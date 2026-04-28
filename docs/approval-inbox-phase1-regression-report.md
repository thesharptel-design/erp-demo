# approval_inbox_query Phase 1 적용 후 성능/회귀 검증 리포트

## 목적
- 대상 마이그레이션: `supabase/migrations/20260430290000_approval_inbox_phase1_low_risk_indexes.sql`
- 목표: 인덱스 적용 후 성능 변화 확인 + 결과 동일성(총건수/정렬/필터 집합) 검증
- 측정일: 2026-04-28
- 환경: Supabase Postgres (`ap-northeast-1`), MCP `user-supabase`

## 적용 확인 (DB 카탈로그)
아래 인덱스 4개가 실DB에 생성된 것을 확인했습니다.

- `idx_approval_lines_doc_line_no`
- `idx_approval_lines_doc_approver_id`
- `idx_approval_doc_attachments_temp_session_link`
- `idx_approval_doc_attachments_temp_expire_unlinked`

## 측정 조건 (베이스라인과 동일)
- 측정 사용자(`auth.uid()`): `7e327358-d81a-4ec6-a699-22824baeaa8c`
- 세션:
  - `set local role authenticated;`
  - `set_config('request.jwt.claim.sub', '<user_uuid>', true);`
  - `set_config('request.jwt.claim.role', 'authenticated', true);`
- 페이징: `p_limit=20`, `p_offset=0`
- 시나리오:
  - `S1_unfiltered`
  - `S2_doc_type_outbound`
  - `S3_title_partial_요청`
  - `S4_approver_line_김영태`
  - `S5_status_approved`

## 성능 비교 (EXPLAIN ANALYZE, BUFFERS)
베이스라인 값은 `docs/approval-inbox-explain-baseline.md`의 함수 호출 단위 수치를 사용했습니다.

| 시나리오 | Before Exec (ms) | After Exec (ms) | Delta (ms) | 개선율 | Before Shared Hit | After Shared Hit | Shared Read (After) |
|---|---:|---:|---:|---:|---:|---:|---:|
| S1_unfiltered | 16.502 | 14.802 | -1.700 | -10.3% | 2044 | 2077 | 0 |
| S2_doc_type_outbound | 21.672 | 14.665 | -7.007 | -32.3% | 2044 | 2077 | 0 |
| S3_title_partial_요청 | 20.381 | 13.916 | -6.465 | -31.7% | 2044 | 2077 | 0 |
| S4_approver_line_김영태 | 23.387 | 16.308 | -7.079 | -30.3% | 2044 | 2077 | 0 |
| S5_status_approved | 14.873 | 14.272 | -0.601 | -4.0% | 2044 | 2077 | 0 |

### 해석
- 5개 시나리오 모두 실행시간이 감소했습니다(약 `4% ~ 32%`).
- `Shared Read Blocks=0`은 유지되어 warm-cache 조건에서 비교되었습니다.
- `Shared Hit Blocks`는 소폭 증가했으나, 실행시간은 동시에 개선되어 성능 저하 신호로 보이지 않습니다.
- 현재 측정은 함수 호출 단위(`Result`)이므로, 노드별 인덱스 사용률까지 확정하려면 함수 본문 인라인 플랜 재수집을 추가 권장합니다.

## 결과 동일성 검증

### 1) 베이스라인 total 비교 (함수 결과)
`docs/approval-inbox-explain-baseline.md`의 total 기준값과 적용 후 total이 일치합니다.

| 시나리오 | Baseline total | After total | 일치 |
|---|---:|---:|---|
| S1_unfiltered | 24 | 24 | O |
| S2_doc_type_outbound | 5 | 5 | O |
| S3_title_partial_요청 | 3 | 3 | O |
| S4_approver_line_김영태 | 16 | 16 | O |
| S5_status_approved | 9 | 9 | O |

### 2) 함수 결과 vs 인라인 본문 결과 비교
동일 세션/동일 파라미터에서 아래 항목을 시나리오별 대조했습니다.

- `total_fn == total_inline`
- `ids_fn == ids_inline` (첫 페이지 ID 순서 문자열 비교)

결과: 5/5 시나리오 모두 `total_match=true`, `ids_match=true`.

## 결론
- Phase 1 인덱스 적용 후 대표 조회 5개 시나리오에서 성능 개선이 확인되었습니다.
- 총건수/페이지 ID 순서(정렬)/필터 결과 집합 모두 동일하게 유지되어 회귀 징후가 관측되지 않았습니다.
- 따라서 이번 변경은 “로직/응답 불변” 목표를 충족한 것으로 판단합니다.

## Phase 2/pg_trgm 진행 의사결정 (수치 기반)

### 의사결정 기준
- 중간위험(복합 인덱스) 진행 조건:
  - Phase 1 이후에도 대표 시나리오의 p95 실행시간이 목표치(20ms) 초과가 지속될 것
  - 또는 `approval_lines` 관련 fanout 비용(반복 스캔/rows removed by filter)이 노드 단위 플랜에서 계속 병목으로 확인될 것
- `pg_trgm` 진행 조건:
  - 제목/결재선 부분검색 시나리오에서 성능 저하가 전체 UX 병목으로 확인될 것
  - 그리고 `pg_trgm` 확장 도입에 따른 쓰기 부하 증가를 상쇄할 만큼 검색 개선 효과가 재현될 것

### 현재 측정값 근거
- Phase 1 적용 후 함수 호출 기준 실행시간 범위: `13.916ms ~ 16.308ms`
- 대표 5개 시나리오 개선율: `-4.0% ~ -32.3%`
- 결과 동일성: `total`, 첫 페이지 `items ID 순서`, 필터 결과 집합 모두 5/5 일치
- warm-cache 기준에서 `Shared Read Blocks = 0` 유지, 장애/회귀 징후 없음

### 판단
- **중간위험 복합 인덱스(approval_lines (approval_doc_id, status, approver_role, approver_id))**:
  - `보류(Do Not Proceed Now)`
  - 근거: Phase 1만으로도 대표 시나리오가 목표 실행시간 내로 수렴했고, 기능 회귀 없이 개선이 확인됨
- **`pg_trgm` + GIN 인덱스 단계**:
  - `보류(Do Not Proceed Now)`
  - 근거: 현재 데이터/트래픽 기준에서 문자열 부분검색 병목을 재현하는 수치가 부족하며, 확장 도입 대비 편익 입증이 미완료

### 재개 트리거
- 피크 시간대 p95/p99 지연이 20ms/40ms를 지속 초과
- 부분검색 시나리오(S3/S4) 지연이 비검색 시나리오 대비 2배 이상으로 반복 관측
- 인라인 플랜에서 `approval_lines` 반복 스캔 병목이 재확인되고, Phase 1 인덱스로 완화되지 않는 증거 확보

## 운영 메모
- 트래픽 피크에서의 cold-cache/혼합 워크로드 지표는 별도 관찰 권장
- 잔여 후보(중간위험 복합 인덱스)는 본 리포트 결과를 근거로 분리 배포 판단
