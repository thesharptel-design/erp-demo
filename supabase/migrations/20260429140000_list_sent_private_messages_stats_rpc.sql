-- Sender inbox: aggregate read stats without loading every recipient row (broadcast-safe).

BEGIN;

DROP FUNCTION IF EXISTS public.list_sent_private_messages_with_stats(integer);

CREATE OR REPLACE FUNCTION public.list_sent_private_messages_with_stats(p_limit integer DEFAULT 50)
RETURNS TABLE (
  message_id uuid,
  subject text,
  body text,
  kind text,
  created_at timestamptz,
  recipient_total bigint,
  recipient_read bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id AS message_id,
    m.subject,
    m.body,
    m.kind,
    m.created_at,
    COALESCE(s.total, 0)::bigint AS recipient_total,
    COALESCE(s.read_n, 0)::bigint AS recipient_read
  FROM public.private_messages m
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE r.read_at IS NOT NULL)::bigint AS read_n
    FROM public.private_message_recipients r
    WHERE r.message_id = m.id
  ) s ON true
  WHERE m.sender_id = auth.uid()
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 50), 1), 200);
$$;

COMMENT ON FUNCTION public.list_sent_private_messages_with_stats(integer) IS
  'Lists messages sent by auth.uid() with per-message recipient read counts (RLS on underlying tables).';

REVOKE ALL ON FUNCTION public.list_sent_private_messages_with_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_sent_private_messages_with_stats(integer) TO authenticated;

COMMIT;
