-- 결재 시스템 관리자: 문서 완전 삭제 (클라이언트 직접 DELETE 우회 방지).
-- 출고 연동 시 재고 복원은 기존 finalize_outbound_cancellation과 동일하게 선행한 뒤 CASCADE 삭제.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_delete_approval_doc(p_doc_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_outbound boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT public.is_approval_admin(v_uid) THEN
    RAISE EXCEPTION 'forbidden: approval admin only';
  END IF;

  PERFORM d.id
    FROM public.approval_docs d
   WHERE d.id = p_doc_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval_doc not found: %', p_doc_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.outbound_requests obr
     WHERE obr.approval_doc_id = p_doc_id
  )
    INTO v_has_outbound;

  IF v_has_outbound THEN
    PERFORM public.finalize_outbound_cancellation(p_doc_id);
  END IF;

  DELETE FROM public.approval_docs
   WHERE id = p_doc_id;
END;
$$;

COMMENT ON FUNCTION public.admin_delete_approval_doc(bigint) IS
  'Approval system admin only: restores outbound stock when applicable, then deletes approval_docs (CASCADE to lines, outbound, etc.).';

REVOKE ALL ON FUNCTION public.admin_delete_approval_doc(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_approval_doc(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_approval_doc(bigint) TO service_role;

COMMIT;
