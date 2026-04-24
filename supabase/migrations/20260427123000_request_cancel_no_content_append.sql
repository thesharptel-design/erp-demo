BEGIN;

-- 결재 취소 요청 사유는 본문(content)에 누적하지 않고, 처리 이력(action_comment)으로만 남긴다.
CREATE OR REPLACE FUNCTION public.request_approval_cancellation(p_doc_id bigint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc public.approval_docs%ROWTYPE;
  v_last_line_no int;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_is_writer boolean;
  v_on_action_line boolean := false;
  v_can_approver boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF length(v_reason) < 2 THEN
    RAISE EXCEPTION 'cancel reason required';
  END IF;

  SELECT * INTO v_doc FROM public.approval_docs WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval doc not found';
  END IF;

  IF v_doc.status NOT IN ('submitted', 'in_review', 'approved') THEN
    RAISE EXCEPTION 'invalid status for cancellation request';
  END IF;

  IF COALESCE(v_doc.remarks, '') LIKE '%취소 요청%'
     OR COALESCE(v_doc.remarks, '') LIKE '%취소완료%'
     OR COALESCE(v_doc.remarks, '') LIKE '%취소승인%' THEN
    RAISE EXCEPTION 'cancellation already in progress';
  END IF;

  v_is_writer := (v_doc.writer_id = v_uid);

  IF v_is_writer THEN
    IF v_doc.status <> 'approved' AND NOT EXISTS (
      SELECT 1
        FROM public.approval_lines l
       WHERE l.approval_doc_id = p_doc_id
         AND l.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'no completed approval line for cancellation request';
    END IF;
  ELSE
    v_on_action_line := (
      EXISTS (
        SELECT 1
          FROM public.approval_participants p
         WHERE p.approval_doc_id = p_doc_id
           AND p.user_id = v_uid
           AND lower(trim(p.role)) IN ('approver', 'reviewer', 'cooperator')
      )
      OR EXISTS (
        SELECT 1
          FROM public.approval_lines l
         WHERE l.approval_doc_id = p_doc_id
           AND l.approver_id = v_uid
           AND lower(trim(l.approver_role)) IN ('approver', 'reviewer', 'cooperator')
      )
    );

    IF NOT v_on_action_line THEN
      RAISE EXCEPTION 'not authorized to request cancellation';
    END IF;

    IF v_doc.status = 'approved' THEN
      v_can_approver := true;
    ELSE
      IF EXISTS (
        SELECT 1
          FROM public.approval_lines l
         WHERE l.approval_doc_id = p_doc_id
           AND l.approver_id = v_uid
           AND l.status = 'approved'
      ) THEN
        v_can_approver := true;
      END IF;
    END IF;

    IF NOT v_can_approver THEN
      RAISE EXCEPTION 'not authorized to request cancellation';
    END IF;
  END IF;

  SELECT max(l.line_no)
    INTO v_last_line_no
    FROM public.approval_lines l
   WHERE l.approval_doc_id = p_doc_id
     AND l.status IN ('approved', 'cancelled');

  IF v_last_line_no IS NULL THEN
    SELECT COALESCE(max(l.line_no), 1)
      INTO v_last_line_no
      FROM public.approval_lines l
     WHERE l.approval_doc_id = p_doc_id;
  END IF;

  UPDATE public.approval_docs
     SET remarks = '취소 요청 중',
         current_line_no = v_last_line_no
   WHERE id = p_doc_id;
END;
$$;

COMMENT ON FUNCTION public.request_approval_cancellation(bigint, text) IS
  'Writer or eligible approver: starts reverse cancellation relay (remarks 취소 요청 중). Reason is stored in approval_histories.action_comment, not approval_docs.content.';

REVOKE ALL ON FUNCTION public.request_approval_cancellation(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_approval_cancellation(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_approval_cancellation(bigint, text) TO service_role;

COMMIT;
