BEGIN;

-- 최종 승인 완료 후: 마지막으로 승인한 결재·협조·참조 차수 담당자만 한 번에 취소(기안자 반려와 동등한 rejected 복귀).
CREATE OR REPLACE FUNCTION public.direct_cancel_final_approval(p_doc_id bigint, p_opinion text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.approval_docs%ROWTYPE;
  v_last_line record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_doc FROM public.approval_docs WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval doc not found';
  END IF;

  IF v_doc.status <> 'approved' THEN
    RAISE EXCEPTION 'document is not fully approved';
  END IF;

  IF COALESCE(v_doc.remarks, '') LIKE '%취소 요청%'
     OR COALESCE(v_doc.remarks, '') LIKE '%취소완료%'
     OR COALESCE(v_doc.remarks, '') LIKE '%취소승인%' THEN
    RAISE EXCEPTION 'cancellation already in progress';
  END IF;

  SELECT l.line_no, l.approver_id
    INTO v_last_line
    FROM public.approval_lines l
   WHERE l.approval_doc_id = p_doc_id
     AND l.status = 'approved'
     AND lower(trim(l.approver_role)) IN ('approver', 'reviewer', 'cooperator')
   ORDER BY l.line_no DESC, l.id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no approved action line';
  END IF;

  IF v_last_line.approver_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'only the last approver may direct-cancel this document';
  END IF;

  IF COALESCE(v_doc.doc_type, '') = 'outbound_request'
     OR EXISTS (SELECT 1 FROM public.outbound_requests r WHERE r.approval_doc_id = p_doc_id) THEN
    PERFORM public.finalize_outbound_cancellation(p_doc_id);
    UPDATE public.outbound_requests
       SET status = 'rejected',
           updated_at = now()
     WHERE approval_doc_id = p_doc_id;
  END IF;

  UPDATE public.approval_lines
     SET status = 'waiting',
         acted_at = null,
         opinion = null
   WHERE approval_doc_id = p_doc_id
     AND status IN ('approved', 'cancelled', 'rejected', 'pending');

  UPDATE public.approval_docs
     SET status = 'rejected',
         remarks = '결재 취소',
         completed_at = null,
         current_line_no = 1
   WHERE id = p_doc_id;
END;
$$;

COMMENT ON FUNCTION public.direct_cancel_final_approval(bigint, text) IS
  'After full approval: only the last approved action-line approver may one-shot cancel (rejected for writer; outbound stock restored).';

REVOKE ALL ON FUNCTION public.direct_cancel_final_approval(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.direct_cancel_final_approval(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.direct_cancel_final_approval(bigint, text) TO service_role;

COMMIT;
