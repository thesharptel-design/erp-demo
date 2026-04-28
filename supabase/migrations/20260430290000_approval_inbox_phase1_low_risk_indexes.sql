-- 통합결재문서함 Phase 1: 저위험 인덱스(로직/응답 불변)
-- 주의: Supabase 마이그레이션은 트랜잭션 내 실행되므로 CONCURRENTLY를 사용하지 않습니다.
BEGIN;

-- 근거:
-- approval_inbox_query 및 관련 RPC에서 결재선 표시/추적 시
-- approval_lines를 approval_doc_id로 묶고 line_no 순서로 읽습니다.
CREATE INDEX IF NOT EXISTS idx_approval_lines_doc_line_no
  ON public.approval_lines (approval_doc_id, line_no);

-- 근거:
-- 결재문서별 사용자 결재선 참여 여부/상태 조회에서
-- approval_doc_id + approver_id 조건이 반복됩니다.
CREATE INDEX IF NOT EXISTS idx_approval_lines_doc_approver_id
  ON public.approval_lines (approval_doc_id, approver_id);

-- 근거:
-- 임시 첨부 연결(link_temp_approval_attachments), 자동저장 갱신(touch_temp_approval_attachments) 경로는
-- draft_session_key + created_by + status='temp' + approval_doc_id IS NULL 조건을 사용합니다.
-- 기존 전체 인덱스보다 작은 partial 인덱스로 write/read fanout을 줄입니다.
CREATE INDEX IF NOT EXISTS idx_approval_doc_attachments_temp_session_link
  ON public.approval_doc_attachments (draft_session_key, created_by, created_at DESC)
  WHERE status = 'temp' AND approval_doc_id IS NULL;

-- 근거:
-- 만료 임시 첨부 정리(cleanup_expired_temp_approval_attachments) 경로는
-- status='temp' + approval_doc_id IS NULL + expires_at < now() 조건으로 스캔합니다.
CREATE INDEX IF NOT EXISTS idx_approval_doc_attachments_temp_expire_unlinked
  ON public.approval_doc_attachments (expires_at)
  WHERE status = 'temp' AND approval_doc_id IS NULL;

COMMIT;
