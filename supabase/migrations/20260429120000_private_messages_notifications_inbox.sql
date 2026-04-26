-- Inbox foundation: private messages, notification events + per-user rows, RLS,
-- Realtime publication, replica identity for filtered UPDATE payloads, 180-day purge helper.

BEGIN;

-- ---------------------------------------------------------------------------
-- private_messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.private_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.app_users (id) ON DELETE RESTRICT,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_messages_kind_check CHECK (kind IN ('direct', 'broadcast'))
);

COMMENT ON TABLE public.private_messages IS '1:1 or broadcast (system admin) private messages; recipients in private_message_recipients.';

CREATE INDEX IF NOT EXISTS idx_private_messages_sender_id_created_at
  ON public.private_messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_private_messages_created_at
  ON public.private_messages (created_at);

-- ---------------------------------------------------------------------------
-- private_message_recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.private_message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.private_messages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  read_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT private_message_recipients_message_user_uniq UNIQUE (message_id, user_id)
);

COMMENT ON TABLE public.private_message_recipients IS 'Per-user inbox row for a private message; sender may SELECT for read receipts.';

CREATE INDEX IF NOT EXISTS idx_private_message_recipients_user_created_at
  ON public.private_message_recipients (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_private_message_recipients_message_id
  ON public.private_message_recipients (message_id);

CREATE INDEX IF NOT EXISTS idx_private_message_recipients_retention
  ON public.private_message_recipients (created_at)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- notification_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.app_users (id) ON DELETE RESTRICT,
  category text NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  payload jsonb NULL,
  target_url text NULL,
  dedupe_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_events_category_check CHECK (category IN ('work', 'board')),
  CONSTRAINT notification_events_dedupe_key_uniq UNIQUE (dedupe_key)
);

COMMENT ON TABLE public.notification_events IS 'Single logical notification (board/work); fan-out to user_notifications.';

CREATE INDEX IF NOT EXISTS idx_notification_events_actor_created_at
  ON public.notification_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_events_created_at
  ON public.notification_events (created_at);

-- ---------------------------------------------------------------------------
-- user_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.notification_events (id) ON DELETE CASCADE,
  read_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_notifications_user_event_uniq UNIQUE (user_id, event_id)
);

COMMENT ON TABLE public.user_notifications IS 'Per-user inbox row for a notification event; primary Realtime target.';

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created_at
  ON public.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_event_id
  ON public.user_notifications (event_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_retention
  ON public.user_notifications (created_at)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Replica identity (Realtime UPDATE filters on user_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.private_message_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- RLS: private_messages
-- ---------------------------------------------------------------------------
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_messages_select_authenticated ON public.private_messages;
CREATE POLICY private_messages_select_authenticated
ON public.private_messages
FOR SELECT
TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.private_message_recipients r
    WHERE r.message_id = private_messages.id
      AND r.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS private_messages_insert_authenticated ON public.private_messages;
CREATE POLICY private_messages_insert_authenticated
ON public.private_messages
FOR INSERT
TO authenticated
WITH CHECK (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: private_message_recipients
-- ---------------------------------------------------------------------------
ALTER TABLE public.private_message_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS private_message_recipients_select_authenticated ON public.private_message_recipients;
CREATE POLICY private_message_recipients_select_authenticated
ON public.private_message_recipients
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.private_messages m
    WHERE m.id = private_message_recipients.message_id
      AND m.sender_id = auth.uid()
  )
);

DROP POLICY IF EXISTS private_message_recipients_insert_authenticated ON public.private_message_recipients;
CREATE POLICY private_message_recipients_insert_authenticated
ON public.private_message_recipients
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.private_messages m
    WHERE m.id = message_id
      AND m.sender_id = auth.uid()
  )
);

DROP POLICY IF EXISTS private_message_recipients_update_authenticated ON public.private_message_recipients;
CREATE POLICY private_message_recipients_update_authenticated
ON public.private_message_recipients
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: notification_events
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_events_select_authenticated ON public.notification_events;
CREATE POLICY notification_events_select_authenticated
ON public.notification_events
FOR SELECT
TO authenticated
USING (
  actor_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.event_id = notification_events.id
      AND un.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- RLS: user_notifications
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_select_authenticated ON public.user_notifications;
CREATE POLICY user_notifications_select_authenticated
ON public.user_notifications
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.notification_events e
    WHERE e.id = user_notifications.event_id
      AND e.actor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS user_notifications_update_authenticated ON public.user_notifications;
CREATE POLICY user_notifications_update_authenticated
ON public.user_notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Grants (inserts for notifications/events: SECURITY DEFINER / service_role)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON public.private_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.private_message_recipients TO authenticated;
GRANT SELECT ON public.notification_events TO authenticated;
GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 180-day retention: non-archived rows only; then orphan event cleanup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_inbox_data_older_than_180_days()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '180 days';
  v_pm_recipients_deleted bigint := 0;
  v_pm_messages_deleted bigint := 0;
  v_user_notifications_deleted bigint := 0;
  v_events_deleted bigint := 0;
BEGIN
  DELETE FROM public.private_message_recipients r
  WHERE r.archived_at IS NULL
    AND r.created_at < v_cutoff;
  GET DIAGNOSTICS v_pm_recipients_deleted = ROW_COUNT;

  DELETE FROM public.private_messages m
  WHERE m.created_at < v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.private_message_recipients r2 WHERE r2.message_id = m.id
    );
  GET DIAGNOSTICS v_pm_messages_deleted = ROW_COUNT;

  DELETE FROM public.user_notifications un
  WHERE un.archived_at IS NULL
    AND un.created_at < v_cutoff;
  GET DIAGNOSTICS v_user_notifications_deleted = ROW_COUNT;

  DELETE FROM public.notification_events e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_notifications un2 WHERE un2.event_id = e.id
  );
  GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'private_message_recipients_deleted', v_pm_recipients_deleted,
    'private_messages_orphans_deleted', v_pm_messages_deleted,
    'user_notifications_deleted', v_user_notifications_deleted,
    'notification_events_orphans_deleted', v_events_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_inbox_data_older_than_180_days() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_inbox_data_older_than_180_days() TO service_role;

COMMENT ON FUNCTION public.purge_inbox_data_older_than_180_days() IS
  'Deletes non-archived inbox rows older than 180 days, orphan messages/events. Schedule via pg_cron or external job (service_role).';

-- ---------------------------------------------------------------------------
-- supabase_realtime publication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.private_message_recipients;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN invalid_object_definition THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN invalid_object_definition THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_events;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN invalid_object_definition THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
