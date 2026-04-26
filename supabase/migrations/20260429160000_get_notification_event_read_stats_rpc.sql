-- Actor-only read receipt list for a notification event (RLS-backed; explicit actor guard).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_notification_event_read_stats(p_event_id uuid)
RETURNS TABLE (
  user_id uuid,
  user_name text,
  read_at timestamptz,
  notified_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    un.user_id,
    u.user_name,
    un.read_at,
    un.created_at AS notified_at
  FROM public.user_notifications un
  INNER JOIN public.notification_events e ON e.id = un.event_id
  LEFT JOIN public.app_users u ON u.id = un.user_id
  WHERE un.event_id = p_event_id
    AND e.actor_id = auth.uid()
  ORDER BY un.created_at ASC;
$$;

COMMENT ON FUNCTION public.get_notification_event_read_stats(uuid) IS
  'Recipients of a notification event with read_at; only when auth.uid() is the event actor (defense in depth with RLS).';

REVOKE ALL ON FUNCTION public.get_notification_event_read_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_notification_event_read_stats(uuid) TO authenticated;

COMMIT;
