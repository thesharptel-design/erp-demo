-- Break RLS infinite recursion between parent inbox rows and child per-user rows.
-- Pattern: A.FOR SELECT uses EXISTS(B), B.FOR SELECT uses EXISTS(A) -> recursion when either is evaluated.
-- Fix: SECURITY DEFINER helpers read the parent row without re-entering child-table policies.

BEGIN;

-- ---------------------------------------------------------------------------
-- private_messages <-> private_message_recipients
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_message_sender_id(p_message_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.sender_id
  FROM public.private_messages m
  WHERE m.id = p_message_id;
$$;

COMMENT ON FUNCTION public.private_message_sender_id(uuid) IS
  'Returns sender_id for a private message; used by RLS on private_message_recipients to avoid policy recursion.';

REVOKE ALL ON FUNCTION public.private_message_sender_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.private_message_sender_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.private_message_sender_id(uuid) TO service_role;

DROP POLICY IF EXISTS private_message_recipients_select_authenticated ON public.private_message_recipients;
CREATE POLICY private_message_recipients_select_authenticated
ON public.private_message_recipients
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.private_message_sender_id(private_message_recipients.message_id) = auth.uid()
);

DROP POLICY IF EXISTS private_message_recipients_insert_authenticated ON public.private_message_recipients;
CREATE POLICY private_message_recipients_insert_authenticated
ON public.private_message_recipients
FOR INSERT
TO authenticated
WITH CHECK (public.private_message_sender_id(message_id) = auth.uid());

-- ---------------------------------------------------------------------------
-- notification_events <-> user_notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_event_actor_id(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.actor_id
  FROM public.notification_events e
  WHERE e.id = p_event_id;
$$;

COMMENT ON FUNCTION public.notification_event_actor_id(uuid) IS
  'Returns actor_id for a notification event; used by RLS on user_notifications to avoid policy recursion.';

REVOKE ALL ON FUNCTION public.notification_event_actor_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_event_actor_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_event_actor_id(uuid) TO service_role;

DROP POLICY IF EXISTS user_notifications_select_authenticated ON public.user_notifications;
CREATE POLICY user_notifications_select_authenticated
ON public.user_notifications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.notification_event_actor_id(user_notifications.event_id) = auth.uid()
);

COMMIT;
