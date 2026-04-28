# approval_inbox_query EXPLAIN 베이스라인 (ANALYZE, BUFFERS)

## 측정 목적
- 대상: `public.approval_inbox_query(...)`
- 목적: 인덱스 적용 전 대표 파라미터 5개 기준 베이스라인 확보
- 측정일: 2026-04-28
- 환경: Supabase Postgres (`ap-northeast-1`), MCP `execute_sql`

## 고정 측정 조건
- 측정 사용자(`auth.uid()`): `7e327358-d81a-4ec6-a699-22824baeaa8c` (읽기 가능 문서 24건)
- 세션 설정:
  - `set local role authenticated;`
  - `set_config('request.jwt.claim.sub', '<user_uuid>', true);`
  - `set_config('request.jwt.claim.role', 'authenticated', true);`
- 공통 페이징:
  - `p_limit = 20`
  - `p_offset = 0`

## 대표 파라미터 (고정)
1. `S1_unfiltered`: 전체(무필터)
2. `S2_doc_type_outbound`: `p_doc_type = 'outbound_request'`
3. `S3_title_partial_요청`: `p_title = '요청'`
4. `S4_approver_line_김영태`: `p_approver_line = '김영태'`
5. `S5_status_approved`: `p_status = 'approved'`

참고 결과 건수(`approval_inbox_query(...)->>'total'`):
- S1: 24
- S2: 5
- S3: 3
- S4: 16
- S5: 9

## EXPLAIN (ANALYZE, BUFFERS) 결과 요약

| 시나리오 | Execution Time (ms) | Shared Hit Blocks | Shared Read Blocks |
|---|---:|---:|---:|
| S1_unfiltered | 16.502 | 2044 | 0 |
| S2_doc_type_outbound | 21.672 | 2044 | 0 |
| S3_title_partial_요청 | 20.381 | 2044 | 0 |
| S4_approver_line_김영태 | 23.387 | 2044 | 0 |
| S5_status_approved | 14.873 | 2044 | 0 |

## 해석
- 현재 측정은 SQL 함수 호출 단위(`Result` 노드)로 집계되어 내부 서브플랜(테이블별 scan/filter/sort)의 상세 노드가 노출되지 않았다.
- 시나리오 간 총 실행시간 편차는 약 `14.9ms ~ 23.4ms` 범위다.
- 모든 시나리오에서 `Shared Read Blocks = 0`으로 관측되어, 이번 측정 시점은 캐시 hit 기반의 warm 상태로 보인다.
- 필터 조건을 추가해도 `Shared Hit Blocks`가 동일(2044)하게 관측되어, 함수 내부 처리 비용이 호출 전체 단위로 유사하게 집계되는 경향이 있다.

## 재현 SQL (예시: S1)
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '7e327358-d81a-4ec6-a699-22824baeaa8c', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

explain (analyze, buffers, verbose, format json)
select public.approval_inbox_query(null, null, null, null, null, null, null, 20, 0);

rollback;
```

## 다음 단계 제안
- 인덱스 효과를 노드 단위로 확인하려면 함수 본문 SQL을 동일 조건으로 풀어서(인라인) `EXPLAIN (ANALYZE, BUFFERS)`를 추가 수집하는 것을 권장한다.
- 1차 인덱스 적용 후 동일 5개 시나리오를 같은 사용자/같은 페이징으로 재측정하여 전후 비교한다.

## 인라인 본문 SQL 병행 측정 (완료)
- 측정 방식: 함수 본문 CTE(`base -> filtered -> ranked -> rows_ordered`)를 직접 인라인으로 실행
- 측정 옵션: `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)`
- 세션 조건/사용자/파라미터 세트는 위와 동일

### 인라인 결과 요약
| 시나리오 | Execution Time (ms) | Shared Hit Blocks | Shared Read Blocks |
|---|---:|---:|---:|
| S1_unfiltered | 25.924 | 384 | 0 |
| S2_doc_type_outbound | 13.364 | 377 | 0 |
| S3_title_partial_요청 | 20.836 | 366 | 0 |
| S4_approver_line_김영태 | 38.512 | 370 | 0 |
| S5_status_approved | 36.705 | 370 | 0 |

### 인라인 플랜에서 확인된 핵심 포인트
- `approval_docs`:
  - `Seq Scan` + `Filter: can_read_approval_doc(...)`
  - 대표 플랜 기준 `Rows Removed by Filter: 0` (측정 사용자의 가시 문서가 전량 포함된 상태)
- `approval_lines` (상관 서브쿼리 2곳):
  - 반복적으로 `Seq Scan` 수행
  - `SubPlan 1`에서 루프당 `Rows Removed by Filter`가 크게 발생(문서별 결재선 집계 시 fanout 비용 노출)
- 정렬:
  - `row_number() over (order by CASE(status='approved'), id desc)` 전후로 `Sort` 노드 사용
  - 현재 데이터 규모에서는 메모리 정렬(quicksort)로 처리
- 버퍼:
  - 전 시나리오 `Shared Read Blocks = 0` (warm cache 상태), `Shared Hit` 중심

### 해석 (인덱스 후보와의 연결)
- 본문 인라인 플랜에서 `approval_lines` 반복 `Seq Scan`이 가장 명확한 개선 타깃으로 확인됨.
- 따라서 계획의 1차 후보인
  - `approval_lines (approval_doc_id, line_no)`
  - `approval_lines (approval_doc_id, approver_id)`
  는 측정 근거가 충분함.
- `S4/S5`가 상대적으로 느린 이유도 문자열 결합/부분검색 + 반복 스캔 영향으로 해석 가능.
