-- Add recipient employee_no for sent list title: "제목 to 이름(사번)".

BEGIN;

DROP FUNCTION IF EXISTS public.list_sent_private_messages_with_stats(integer);

CREATE FUNCTION public.list_sent_private_messages_with_stats(p_limit integer DEFAULT 50)
RETURNS TABLE (
  message_id uuid,
  subject text,
  body text,
  kind text,
  created_at timestamptz,
  recipient_total bigint,
  recipient_read bigint,
  primary_recipient_name text,
  primary_recipient_employee_no text
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
    COALESCE(s.read_n, 0)::bigint AS recipient_read,
    CASE
      WHEN m.kind = 'direct' THEN rc.user_name
      ELSE NULL::text
    END AS primary_recipient_name,
    CASE
      WHEN m.kind = 'direct' THEN NULLIF(trim(COALESCE(rc.employee_no, '')), '')
      ELSE NULL::text
    END AS primary_recipient_employee_no
  FROM public.private_messages m
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE r.read_at IS NOT NULL)::bigint AS read_n
    FROM public.private_message_recipients r
    WHERE r.message_id = m.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT au.user_name, au.employee_no
    FROM public.private_message_recipients r2
    INNER JOIN public.app_users au ON au.id = r2.user_id
    WHERE r2.message_id = m.id
      AND m.kind = 'direct'
    ORDER BY r2.created_at ASC
    LIMIT 1
  ) rc ON true
  WHERE m.sender_id = auth.uid()
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 50), 1), 200);
$$;

COMMENT ON FUNCTION public.list_sent_private_messages_with_stats(integer) IS
  'Sent messages for auth.uid(); primary_recipient_* for kind=direct (1:1).';

REVOKE ALL ON FUNCTION public.list_sent_private_messages_with_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_sent_private_messages_with_stats(integer) TO authenticated;

COMMIT;
