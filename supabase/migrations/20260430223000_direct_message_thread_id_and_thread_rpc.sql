-- Direct 쪽지 스레드 분리: 새 쪽지는 새 thread_id, 답장은 기존 thread_id 유지

BEGIN;

ALTER TABLE public.private_messages
  ADD COLUMN IF NOT EXISTS thread_id uuid;

-- 기존 direct 데이터는 메시지 id를 thread_id로 백필 (과거 데이터 보존)
UPDATE public.private_messages
SET thread_id = id
WHERE kind = 'direct'
  AND thread_id IS NULL;

-- direct는 반드시 thread_id, broadcast는 NULL 유지
ALTER TABLE public.private_messages
  DROP CONSTRAINT IF EXISTS private_messages_direct_requires_thread_id;

ALTER TABLE public.private_messages
  ADD CONSTRAINT private_messages_direct_requires_thread_id CHECK (
    (kind = 'direct' AND thread_id IS NOT NULL)
    OR (kind = 'broadcast' AND thread_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_private_messages_thread_created_at
  ON public.private_messages (thread_id, created_at DESC)
  WHERE kind = 'direct';

-- ---------------------------------------------------------------------------
-- list_direct_message_thread: 스레드 단위 조회
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_direct_message_thread(uuid, integer);

CREATE FUNCTION public.list_direct_message_thread(p_thread_id uuid, p_limit integer DEFAULT 120)
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
  SELECT
    m.id AS message_id,
    CASE WHEN m.sender_id = auth.uid() THEN 'out'::text ELSE 'in'::text END AS direction,
    m.created_at,
    m.subject,
    m.body,
    r_me.id AS inbound_recipient_id,
    r_me.read_at AS my_read_at,
    r_peer.read_at AS peer_read_at
  FROM public.private_messages m
  LEFT JOIN public.private_message_recipients r_me
    ON r_me.message_id = m.id
   AND r_me.user_id = auth.uid()
  LEFT JOIN public.private_message_recipients r_peer
    ON r_peer.message_id = m.id
   AND r_peer.user_id <> auth.uid()
  WHERE m.kind = 'direct'
    AND m.thread_id = p_thread_id
    AND (
      m.sender_id = auth.uid()
      OR r_me.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC
  LIMIT (SELECT n FROM lim);
$$;

COMMENT ON FUNCTION public.list_direct_message_thread(uuid, integer) IS
  'Direct thread messages by thread_id for auth.uid(); oldest first.';

REVOKE ALL ON FUNCTION public.list_direct_message_thread(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_direct_message_thread(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_sent_private_messages_with_stats: thread_id 포함
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_sent_private_messages_with_stats(integer);

CREATE FUNCTION public.list_sent_private_messages_with_stats(p_limit integer DEFAULT 50)
RETURNS TABLE (
  message_id uuid,
  thread_id uuid,
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
    m.thread_id,
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
  'Sent messages for auth.uid(); includes thread_id for direct thread open.';

REVOKE ALL ON FUNCTION public.list_sent_private_messages_with_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_sent_private_messages_with_stats(integer) TO authenticated;

COMMIT;

