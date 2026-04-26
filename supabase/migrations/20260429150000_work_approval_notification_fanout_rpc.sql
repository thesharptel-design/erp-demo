-- Fan-out work (category work) notifications for approval / outbound flows.
-- Called from app after mutations; dedupe_key on notification_events prevents duplicates.

BEGIN;

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

  IF p_recipient_mode NOT IN ('pending_lines', 'writer') THEN
    RAISE EXCEPTION 'invalid recipient_mode' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.approval_docs d
    WHERE d.id = p_approval_doc_id
      AND (
        d.writer_id = p_actor_id
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
        AND l.approver_role IN ('approver', 'reviewer', 'cooperator')
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

  FOR v_uid IN
    SELECT DISTINCT l.approver_id
    FROM public.approval_lines l
    WHERE l.approval_doc_id = p_approval_doc_id
      AND l.status = 'pending'
      AND l.approver_role IN ('approver', 'reviewer', 'cooperator')
      AND l.approver_id IS DISTINCT FROM p_actor_id
  LOOP
    INSERT INTO public.user_notifications (user_id, event_id)
    VALUES (v_uid, v_event_id)
    ON CONFLICT (user_id, event_id) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fanout_work_approval_notification(
  uuid, bigint, text, text, text, text, text, jsonb
) FROM PUBLIC;

COMMENT ON FUNCTION public.fanout_work_approval_notification(
  uuid, bigint, text, text, text, text, text, jsonb
) IS
  'Creates notification_events (category work) + user_notifications. recipient_mode pending_lines|writer. Optional p_dedupe_key (NULL = always new event). Caller must be auth.uid() = p_actor_id and writer or line approver on the doc.';

GRANT EXECUTE ON FUNCTION public.fanout_work_approval_notification(
  uuid, bigint, text, text, text, text, text, jsonb
) TO authenticated;

COMMIT;
