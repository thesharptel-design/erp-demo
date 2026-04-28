# approval_inbox_query Phase 1 운영 체크리스트 (적용/모니터링/롤백)

## 목적
- 대상 변경: `supabase/migrations/20260430290000_approval_inbox_phase1_low_risk_indexes.sql`
- 범위: 인덱스 추가/검증/롤백 절차만 다루며, 애플리케이션 로직은 변경하지 않는다.
- 목표: 성능 개선을 확보하면서 회귀 발생 시 인덱스 단위로 즉시 되돌릴 수 있게 한다.

## 사전 준비
- [ ] 배포 창구 결정: 저트래픽 시간 또는 공지된 유지보수 시간
- [ ] 담당자 확정: 실행자 1명 + 모니터링 담당 1명
- [ ] 베이스라인 확보:
  - [ ] `docs/approval-inbox-explain-baseline.md`
  - [ ] 대표 시나리오 3~5개 파라미터 고정
- [ ] 롤백 파일 준비:
  - [ ] `docs/approval-inbox-phase1-index-rollback.sql`
- [ ] 커뮤니케이션 문구 준비(성능 저하/오류 시 즉시 롤백 안내)

## 적용 절차 (Phase 1 인덱스)
- [ ] 대상 마이그레이션 적용
- [ ] 인덱스 생성 확인:
  - [ ] `idx_approval_lines_doc_line_no`
  - [ ] `idx_approval_lines_doc_approver_id`
  - [ ] `idx_approval_doc_attachments_temp_session_link`
  - [ ] `idx_approval_doc_attachments_temp_expire_unlinked`
- [ ] 적용 직후 에러 로그 확인 (DDL 실패, lock timeout, deadlock 여부)

## 검증 절차
- [ ] 동일 파라미터로 `EXPLAIN (ANALYZE, BUFFERS)` 재측정
- [ ] 최소 검증 항목:
  - [ ] 실행시간 (베이스라인 대비)
  - [ ] shared/local read/hit 변화
  - [ ] rows removed by filter 급증 여부
- [ ] 결과 동일성 확인:
  - [ ] total 건수 일치
  - [ ] 페이지별 items ID 순서 일치
  - [ ] 필터 결과 집합 일치
- [ ] 검증 결과를 `docs/approval-inbox-phase1-regression-report.md`에 업데이트

## 모니터링 포인트 (적용 후 1~2시간)
- [ ] 통합결재문서함 주요 조회 API 지연 증가 여부
- [ ] DB CPU/IO 급증 여부
- [ ] lock wait 이벤트 증가 여부
- [ ] 첨부 임시 정리/연결 관련 에러 증가 여부

## 롤백 트리거 (하나라도 만족 시 즉시 실행)
- [ ] p95/p99 지연이 배포 전 대비 유의미하게 악화
- [ ] total/정렬/필터 결과 불일치 확인
- [ ] lock contention 또는 장애성 에러가 지속

## 롤백 실행 순서 (인덱스 단위)
1. [ ] 영향이 의심되는 인덱스 1개만 우선 롤백
2. [ ] 5~10분 관찰 후 지표 회복 여부 판단
3. [ ] 미회복 시 다음 후보 인덱스 추가 롤백
4. [ ] 필요 시 4개 전체 롤백

> 실행 스크립트: `docs/approval-inbox-phase1-index-rollback.sql`

## 롤백 후 확인
- [ ] `pg_indexes` 조회로 대상 인덱스 제거 확인
- [ ] 대표 시나리오 재실행해 지표 회복 확인
- [ ] 사용자 체감 이슈(문서함 로딩/필터/검색) 해소 여부 확인
- [ ] 결과 및 판단 근거를 운영 로그/문서에 기록

## 재적용 조건
- [ ] 원인 인덱스 범위가 특정됨
- [ ] 수정안(인덱스 재설계 또는 단계 분리) 리뷰 완료
- [ ] 동일 체크리스트로 재검증 계획 수립

## Phase 2 / pg_trgm 의사결정 게이트
- [x] Phase 1 측정 리포트 확인 (`docs/approval-inbox-phase1-regression-report.md`)
- [x] 대표 5개 시나리오 개선율 확인 (`-4.0% ~ -32.3%`)
- [x] 결과 동일성(총건수/정렬/필터 집합) 5/5 일치 확인
- [x] 현재 결정: 중간위험 복합 인덱스 **보류**
- [x] 현재 결정: `pg_trgm` 단계 **보류**
- [ ] 아래 트리거 중 1개 이상 만족 시에만 다음 단계 재검토:
  - [ ] 피크 시간대 p95 > 20ms 또는 p99 > 40ms 지속
  - [ ] 부분검색(S3/S4) 지연이 비검색 시나리오 대비 2배 이상 반복
  - [ ] 인라인 플랜에서 `approval_lines` fanout 병목이 재확인됨
