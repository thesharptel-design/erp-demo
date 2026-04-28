-- approval_inbox_query Phase 1 저위험 인덱스 롤백 스크립트
-- 대상 마이그레이션: supabase/migrations/20260430290000_approval_inbox_phase1_low_risk_indexes.sql
--
-- 사용 원칙
-- 1) "필요한 인덱스만" 개별 실행합니다(인덱스 단위 롤백).
-- 2) 운영 DB에서는 가능하면 CONCURRENTLY를 사용해 잠금 영향을 줄입니다.
-- 3) DROP INDEX CONCURRENTLY는 트랜잭션 블록(BEGIN/COMMIT) 안에서 실행할 수 없습니다.

-- ---------------------------------------------------------------------------
-- [A] 운영 권장안: 온라인 롤백(개별 실행)
-- ---------------------------------------------------------------------------

-- 1) approval_lines (approval_doc_id, line_no)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_approval_lines_doc_line_no;

-- 2) approval_lines (approval_doc_id, approver_id)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_approval_lines_doc_approver_id;

-- 3) approval_doc_attachments temp session link partial index
DROP INDEX CONCURRENTLY IF EXISTS public.idx_approval_doc_attachments_temp_session_link;

-- 4) approval_doc_attachments temp expire partial index
DROP INDEX CONCURRENTLY IF EXISTS public.idx_approval_doc_attachments_temp_expire_unlinked;

-- ---------------------------------------------------------------------------
-- [B] 유지보수 창구/저트래픽 시간: 트랜잭션 기반 롤백(필요 시)
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_approval_lines_doc_line_no;
-- DROP INDEX IF EXISTS public.idx_approval_lines_doc_approver_id;
-- DROP INDEX IF EXISTS public.idx_approval_doc_attachments_temp_session_link;
-- DROP INDEX IF EXISTS public.idx_approval_doc_attachments_temp_expire_unlinked;
-- COMMIT;

-- ---------------------------------------------------------------------------
-- [C] 롤백 후 확인 쿼리
-- ---------------------------------------------------------------------------
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_approval_lines_doc_line_no',
    'idx_approval_lines_doc_approver_id',
    'idx_approval_doc_attachments_temp_session_link',
    'idx_approval_doc_attachments_temp_expire_unlinked'
  )
ORDER BY indexname;
