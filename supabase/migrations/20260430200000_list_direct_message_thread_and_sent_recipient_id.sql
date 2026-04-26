-- 1:1 쪽지 스레드 조회 RPC + 보낸함에 수신자 user_id 포함(대화 보기 진입).

BEGIN;

-- ---------------------------------------------------------------------------
-- list_direct_message_thread: 나와 상대 간 direct 쪽지 시간순
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_direct_message_thread(uuid, integer);

CREATE FUNCTION public.list_direct_message_thread(p_other_user_id uuid, p_limit integer DEFAULT 120)
RETURNS TABLE (
  message_id uuid,
  direction text,
  created_at timestamptz,
  subject text,
  body text,
  inbound_recipient_id uuid,
  my_read_at timestamptz,
  peer_read_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH lim AS (SELECT LEAST(GREATEST(COALESCE(NULLIF(p_limit, 0), 120), 1), 300) AS n)
  SELECT x.message_id, x.direction, x.created_at, x.subject, x.body, x.inbound_recipient_id, x.my_read_at, x.peer_read_at
  FROM (
    SELECT
      m.id AS message_id,
      'in'::text AS direction,
      m.created_at,
      m.subject,
      m.body,
      r.id AS inbound_recipient_id,
      r.read_at AS my_read_at,
      NULL::timestamptz AS peer_read_at
    FROM public.private_message_recipients r
    INNER JOIN public.private_messages m ON m.id = r.message_id
    WHERE r.user_id = auth.uid()
      AND r.archived_at IS NULL
      AND m.kind = 'direct'
      AND m.sender_id = p_other_user_id
    UNION ALL
    SELECT
      m.id AS message_id,
      'out'::text AS direction,
      m.created_at,
      m.subject,
      m.body,
      NULL::uuid AS inbound_recipient_id,
      NULL::timestamptz AS my_read_at,
      r.read_at AS peer_read_at
    FROM public.private_messages m
    INNER JOIN public.private_message_recipients r ON r.message_id = m.id AND r.user_id = p_other_user_id
    WHERE m.sender_id = auth.uid()
      AND m.kind = 'direct'
      AND r.archived_at IS NULL
  ) x
  CROSS JOIN lim
  ORDER BY x.created_at ASC
  LIMIT (SELECT n FROM lim);
$$;

COMMENT ON FUNCTION public.list_direct_message_thread(uuid, integer) IS
  'Direct messages between auth.uid() and p_other_user_id, oldest first; inbound_recipient_id is current user''s recipient row for read.';

REVOKE ALL ON FUNCTION public.list_direct_message_thread(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_direct_message_thread(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_sent_private_messages_with_stats: primary recipient user id
-- ---------------------------------------------------------------------------
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
  primary_recipient_employee_no text,
  primary_recipient_user_id uuid
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
    END AS primary_recipient_employee_no,
    CASE
      WHEN m.kind = 'direct' THEN rc.user_id
      ELSE NULL::uuid
    END AS primary_recipient_user_id
  FROM public.private_messages m
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE r.read_at IS NOT NULL)::bigint AS read_n
    FROM public.private_message_recipients r
    WHERE r.message_id = m.id
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT r2.user_id, au.user_name, au.employee_no
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
  'Sent messages for auth.uid(); primary_recipient_* + primary_recipient_user_id for kind=direct.';

REVOKE ALL ON FUNCTION public.list_sent_private_messages_with_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_sent_private_messages_with_stats(integer) TO authenticated;

COMMIT;
