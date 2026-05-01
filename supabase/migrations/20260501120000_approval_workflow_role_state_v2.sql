BEGIN;

-- Restore the richer ERP approval role model without deleting existing rows.
ALTER TABLE public.approval_participants
  DROP CONSTRAINT IF EXISTS approval_participants_role_check;

UPDATE public.approval_participants
SET role = CASE
  WHEN role IN ('review', 'reviewer') THEN 'reference'
  WHEN role IN ('cooperator', 'pre_cooperator') THEN 'pre_cooperator'
  WHEN role IN ('approve', 'final_approver', 'approver') THEN 'approver'
  WHEN role IN ('post_cooperator', 'reference') THEN role
  ELSE role
END;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY approval_doc_id, user_id, role
      ORDER BY COALESCE(line_no, 2147483647), id
    ) AS rn
  FROM public.approval_participants
)
DELETE FROM public.approval_participants p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

ALTER TABLE public.approval_participants
  ADD CONSTRAINT approval_participants_role_check
  CHECK (role IN ('pre_cooperator', 'approver', 'post_cooperator', 'reference'));

UPDATE public.approval_lines
SET approver_role = CASE
  WHEN approver_role IN ('review', 'reviewer') THEN 'reference'
  WHEN approver_role IN ('cooperator', 'pre_cooperator') THEN 'pre_cooperator'
  WHEN approver_role IN ('approve', 'final_approver', 'approver') THEN 'approver'
  WHEN approver_role IN ('post_cooperator', 'reference') THEN approver_role
  ELSE approver_role
END;

DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'approval_histories'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%action_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.approval_histories DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.approval_histories
  ADD CONSTRAINT ck_approval_histories_action_type
  CHECK (
    action_type IN (
      'submit',
      'approve',
      'reject',
      'recall',
      'cancel',
      'cancel_request',
      'cancel_relay',
      'direct_cancel_final',
      'outbound_cancel_done',
      'approve_revoke',
      'outbound_assign_handler',
      'outbound_reassign_handler',
      'outbound_recall_handler',
      'outbound_execute_self',
      'outbound_complete',
      'recall_before_first_action',
      'cancel_requested_by_writer',
      'confirm_pre_cooperation',
      'override_approve',
      'reject_direct',
      'reject_sequential',
      'reject_targeted',
      'skip_by_override',
      'confirm_post_cooperation',
      'resubmit',
      'close'
    )
  );

COMMENT ON CONSTRAINT ck_approval_histories_action_type ON public.approval_histories IS
  'Approval timeline action types, including ERP workflow v2 roles and post-approval confirmation.';

-- Keep work approval notifications aligned with the new role names.
CREATE OR REPLACE FUNCTION public.fanout_work_approval_notification(
  p_actor_id uuid,
  p_approval_doc_id bigint,
  p_recipient_mode text,
  p_type text,
  p_title text,
  p_target_url text,
  p_dedupe_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_uid uuid;
  v_writer uuid;
  v_recipient_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_dedupe_key IS NOT NULL AND btrim(p_dedupe_key) = '' THEN
    RAISE EXCEPTION 'dedupe_key invalid' USING ERRCODE = '23514';
  END IF;

  IF p_recipient_mode NOT IN (
    'pending_lines',
    'writer',
    'doc_current_line',
    'actionable_all_except_actor'
  ) THEN
    RAISE EXCEPTION 'invalid recipient_mode' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.approval_docs d
    WHERE d.id = p_approval_doc_id
      AND (
        d.writer_id = p_actor_id
        OR public.is_approval_admin(p_actor_id)
        OR EXISTS (
          SELECT 1
          FROM public.approval_lines l
          WHERE l.approval_doc_id = d.id
            AND l.approver_id = p_actor_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF p_recipient_mode = 'pending_lines' THEN
    SELECT count(*)::int
    INTO v_recipient_count
    FROM (
      SELECT DISTINCT l.approver_id
      FROM public.approval_lines l
      WHERE l.approval_doc_id = p_approval_doc_id
        AND l.status = 'pending'
        AND lower(trim(l.approver_role::text)) IN (
          'approver', 'approve', 'final_approver',
          'pre_cooperator', 'post_cooperator', 'cooperator', 'reviewer'
        )
        AND l.approver_id IS DISTINCT FROM p_actor_id
    ) s;
    IF v_recipient_count = 0 THEN
      RETURN;
    END IF;
  ELSIF p_recipient_mode = 'writer' THEN
    SELECT d.writer_id
    INTO v_writer
    FROM public.approval_docs d
    WHERE d.id = p_approval_doc_id;
    IF v_writer IS NULL OR v_writer IS NOT DISTINCT FROM p_actor_id THEN
      RETURN;
    END IF;
  ELSIF p_recipient_mode = 'doc_current_line' THEN
    SELECT count(*)::int
    INTO v_recipient_count
    FROM (
      SELECT DISTINCT l.approver_id
      FROM public.approval_lines l
      INNER JOIN public.approval_docs d ON d.id = l.approval_doc_id
      WHERE l.approval_doc_id = p_approval_doc_id
        AND d.current_line_no IS NOT NULL
        AND l.line_no = d.current_line_no
        AND lower(trim(l.approver_role::text)) IN (
          'approver', 'approve', 'final_approver',
          'pre_cooperator', 'post_cooperator', 'cooperator', 'reviewer'
        )
        AND l.approver_id IS DISTINCT FROM p_actor_id
    ) s;
    IF v_recipient_count = 0 THEN
      RETURN;
    END IF;
  ELSIF p_recipient_mode = 'actionable_all_except_actor' THEN
    SELECT count(*)::int
    INTO v_recipient_count
    FROM (
      SELECT DISTINCT l.approver_id
      FROM public.approval_lines l
      WHERE l.approval_doc_id = p_approval_doc_id
        AND lower(trim(l.approver_role::text)) IN (
          'approver', 'approve', 'final_approver',
          'pre_cooperator', 'post_cooperator', 'cooperator', 'reviewer'
        )
        AND l.approver_id IS DISTINCT FROM p_actor_id
    ) s;
    IF v_recipient_count = 0 THEN
      RETURN;
    END IF;
  END IF;

  IF p_dedupe_key IS NOT NULL THEN
    INSERT INTO public.notification_events (
      actor_id,
      category,
      type,
      title,
      payload,
      target_url,
      dedupe_key
    )
    VALUES (
      p_actor_id,
      'work',
      p_type,
      COALESCE(NULLIF(left(btrim(p_title), 500), ''), '알림'),
      COALESCE(p_payload, '{}'::jsonb),
      nullif(btrim(p_target_url), ''),
      p_dedupe_key
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
      SELECT e.id
      INTO v_event_id
      FROM public.notification_events e
      WHERE e.dedupe_key = p_dedupe_key;
    END IF;
  ELSE
    INSERT INTO public.notification_events (
      actor_id,
      category,
      type,
      title,
      payload,
      target_url,
      dedupe_key
    )
    VALUES (
      p_actor_id,
      'work',
      p_type,
      COALESCE(NULLIF(left(btrim(p_title), 500), ''), '알림'),
      COALESCE(p_payload, '{}'::jsonb),
      nullif(btrim(p_target_url), ''),
      NULL
    )
    RETURNING id INTO v_event_id;
  END IF;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  IF p_recipient_mode = 'writer' THEN
    INSERT INTO public.user_notifications (user_id, event_id)
    VALUES (v_writer, v_event_id)
    ON CONFLICT (user_id, event_id) DO NOTHING;
    RETURN;
  END IF;

  IF p_recipient_mode = 'pending_lines' THEN
    FOR v_uid IN
      SELECT DISTINCT l.approver_id
      FROM public.approval_lines l
      WHERE l.approval_doc_id = p_approval_doc_id
        AND l.status = 'pending'
        AND lower(trim(l.approver_role::text)) IN (
          'approver', 'approve', 'final_approver',
          'pre_cooperator', 'post_cooperator', 'cooperator', 'reviewer'
        )
        AND l.approver_id IS DISTINCT FROM p_actor_id
    LOOP
      INSERT INTO public.user_notifications (user_id, event_id)
      VALUES (v_uid, v_event_id)
      ON CONFLICT (user_id, event_id) DO NOTHING;
    END LOOP;
    RETURN;
  END IF;

  IF p_recipient_mode = 'doc_current_line' THEN
    FOR v_uid IN
      SELECT DISTINCT l.approver_id
      FROM public.approval_lines l
      INNER JOIN public.approval_docs d ON d.id = l.approval_doc_id
      WHERE l.approval_doc_id = p_approval_doc_id
        AND d.current_line_no IS NOT NULL
        AND l.line_no = d.current_line_no
        AND lower(trim(l.approver_role::text)) IN (
          'approver', 'approve', 'final_approver',
          'pre_cooperator', 'post_cooperator', 'cooperator', 'reviewer'
        )
        AND l.approver_id IS DISTINCT FROM p_actor_id
    LOOP
      INSERT INTO public.user_notifications (user_id, event_id)
      VALUES (v_uid, v_event_id)
      ON CONFLICT (user_id, event_id) DO NOTHING;
    END LOOP;
    RETURN;
  END IF;

  IF p_recipient_mode = 'actionable_all_except_actor' THEN
    FOR v_uid IN
      SELECT DISTINCT l.approver_id
      FROM public.approval_lines l
      WHERE l.approval_doc_id = p_approval_doc_id
        AND lower(trim(l.approver_role::text)) IN (
          'approver', 'approve', 'final_approver',
          'pre_cooperator', 'post_cooperator', 'cooperator', 'reviewer'
        )
        AND l.approver_id IS DISTINCT FROM p_actor_id
    LOOP
      INSERT INTO public.user_notifications (user_id, event_id)
      VALUES (v_uid, v_event_id)
      ON CONFLICT (user_id, event_id) DO NOTHING;
    END LOOP;
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fanout_work_approval_notification(
  uuid, bigint, text, text, text, text, text, jsonb
) IS
  'Creates work approval notifications. Supports v2 roles: approver, pre_cooperator, post_cooperator; reference remains read-only.';

COMMIT;
