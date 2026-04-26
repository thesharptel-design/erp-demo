-- Inbox 180-day retention: tighten orphan event cleanup, optional pg_cron schedule.
-- See docs/inbox-retention-ops.md for operations.

BEGIN;

-- Orphan notification_events: only remove rows older than the same cutoff as inbox rows.
-- Avoids scanning/deleting very recent events that might temporarily have zero user_notifications rows.
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
  WHERE e.created_at < v_cutoff
    AND NOT EXISTS (
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

COMMENT ON FUNCTION public.purge_inbox_data_older_than_180_days() IS
  'Deletes non-archived inbox rows older than 180 days, orphan messages, and orphan notification_events older than the same cutoff. Prefer daily pg_cron (see migration 20260429170000) or call with service_role.';

-- Daily off-peak UTC when pg_cron is available (Supabase Dashboard: enable Database > Extensions > pg_cron).
DO $cron$
DECLARE
  j RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'purge_inbox_data_180d'
    LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;

    PERFORM cron.schedule(
      'purge_inbox_data_180d',
      '5 4 * * *',
      $$SELECT public.purge_inbox_data_older_than_180_days();$$
    );
  END IF;
END
$cron$;

COMMIT;
