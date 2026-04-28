-- 임시 첨부 정리 실패 시 시스템관리자 내부 알림 자동 생성.
-- 외부 Slack/Telegram 없이 앱 내 알림함으로 운영 이슈를 전달한다.
BEGIN;

CREATE OR REPLACE FUNCTION public.notify_system_admins_attachment_cleanup_issue(
  p_run_id bigint,
  p_failed integer,
  p_deleted integer,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_event_id uuid;
  v_uid uuid;
  v_dedupe_key text;
  v_title text;
BEGIN
  IF COALESCE(p_failed, 0) <= 0 THEN
    RETURN;
  END IF;

  -- notification_events.actor_id가 NOT NULL이므로 시스템관리자 1명을 대표 actor로 사용.
  SELECT u.id
    INTO v_actor_id
    FROM public.app_users u
   WHERE public.is_system_admin_user(u.id)
   ORDER BY u.id
   LIMIT 1;

  IF v_actor_id IS NULL THEN
    RETURN;
  END IF;

  v_dedupe_key := 'ops:attachment_cleanup_failed:' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24');
  v_title := '임시 첨부 자동정리 실패가 발생했습니다.';

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
    v_actor_id,
    'work',
    'system.attachment_cleanup_failed',
    v_title,
    jsonb_build_object(
      'run_id', p_run_id,
      'failed_count', COALESCE(p_failed, 0),
      'deleted_count', COALESCE(p_deleted, 0),
      'note', COALESCE(p_note, '')
    ),
    '/dashboard',
    v_dedupe_key
  )
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT e.id
      INTO v_event_id
      FROM public.notification_events e
     WHERE e.dedupe_key = v_dedupe_key;
  END IF;

  IF v_event_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_uid IN
    SELECT u.id
      FROM public.app_users u
     WHERE public.is_system_admin_user(u.id)
  LOOP
    INSERT INTO public.user_notifications (user_id, event_id)
    VALUES (v_uid, v_event_id)
    ON CONFLICT (user_id, event_id) DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_system_admins_attachment_cleanup_issue(bigint, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_system_admins_attachment_cleanup_issue(bigint, integer, integer, text) TO service_role;

COMMENT ON FUNCTION public.notify_system_admins_attachment_cleanup_issue(bigint, integer, integer, text) IS
  'Creates one deduped internal notification event per hour when attachment cleanup failures occur, and fans out to system admins.';

CREATE OR REPLACE FUNCTION public.cleanup_expired_temp_approval_attachments(
  p_limit integer DEFAULT 200
)
RETURNS TABLE(run_id bigint, deleted_count integer, failed_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id bigint;
  v_deleted integer := 0;
  v_failed integer := 0;
  v_limit integer := GREATEST(COALESCE(p_limit, 200), 1);
  v_lock_key bigint := hashtextextended('approval_temp_attachment_cleanup_lock', 0);
  v_lock_acquired boolean := false;
  v_storage_path text;
  r RECORD;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION '관리자만 실행할 수 있습니다.';
  END IF;

  v_lock_acquired := pg_try_advisory_lock(v_lock_key);
  IF NOT v_lock_acquired THEN
    INSERT INTO public.attachment_cleanup_runs(note, finished_at, scanned_count, deleted_count, failed_count)
    VALUES ('manual cleanup skipped: another run is active', now(), 0, 0, 0)
    RETURNING id INTO v_run_id;
    RETURN QUERY SELECT v_run_id, 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.attachment_cleanup_runs(note)
  VALUES ('scheduled/manual cleanup (hardened)')
  RETURNING id INTO v_run_id;

  FOR r IN
    SELECT a.id
      FROM public.approval_doc_attachments a
     WHERE a.status = 'temp'
       AND a.approval_doc_id IS NULL
       AND a.expires_at IS NOT NULL
       AND a.expires_at < now()
     ORDER BY a.expires_at ASC
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_storage_path := NULL;

      UPDATE public.approval_doc_attachments a
         SET status = 'deleted',
             cleaned_at = now(),
             last_cleanup_error = NULL
       WHERE a.id = r.id
         AND a.status = 'temp'
         AND a.approval_doc_id IS NULL
         AND a.expires_at IS NOT NULL
         AND a.expires_at < now()
      RETURNING a.storage_path INTO v_storage_path;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      IF COALESCE(v_storage_path, '') <> '' THEN
        DELETE FROM storage.objects
         WHERE bucket_id = 'approval_attachments'
           AND name = v_storage_path;
      END IF;

      v_deleted := v_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      UPDATE public.approval_doc_attachments
         SET cleanup_attempts = cleanup_attempts + 1,
             last_cleanup_error = SQLERRM,
             status = CASE WHEN cleanup_attempts + 1 >= 5 THEN 'cleanup_failed' ELSE status END
       WHERE id = r.id
         AND status = 'temp'
         AND approval_doc_id IS NULL;

      INSERT INTO public.attachment_cleanup_errors(run_id, attachment_id, storage_path, error_message)
      VALUES (v_run_id, r.id, v_storage_path, SQLERRM);
    END;
  END LOOP;

  UPDATE public.attachment_cleanup_runs
     SET finished_at = now(),
         scanned_count = v_deleted + v_failed,
         deleted_count = v_deleted,
         failed_count = v_failed
   WHERE id = v_run_id;

  IF v_failed > 0 THEN
    PERFORM public.notify_system_admins_attachment_cleanup_issue(v_run_id, v_failed, v_deleted, 'manual');
  END IF;

  RETURN QUERY SELECT v_run_id, v_deleted, v_failed;

  PERFORM pg_advisory_unlock(v_lock_key);
EXCEPTION WHEN OTHERS THEN
  IF v_lock_acquired THEN
    PERFORM pg_advisory_unlock(v_lock_key);
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_temp_approval_attachments_system(
  p_limit integer DEFAULT 200
)
RETURNS TABLE(run_id bigint, deleted_count integer, failed_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id bigint;
  v_deleted integer := 0;
  v_failed integer := 0;
  v_limit integer := GREATEST(COALESCE(p_limit, 200), 1);
  v_lock_key bigint := hashtextextended('approval_temp_attachment_cleanup_lock', 0);
  v_lock_acquired boolean := false;
  v_storage_path text;
  r RECORD;
BEGIN
  v_lock_acquired := pg_try_advisory_lock(v_lock_key);
  IF NOT v_lock_acquired THEN
    INSERT INTO public.attachment_cleanup_runs(note, finished_at, scanned_count, deleted_count, failed_count)
    VALUES ('system cleanup skipped: another run is active', now(), 0, 0, 0)
    RETURNING id INTO v_run_id;
    RETURN QUERY SELECT v_run_id, 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.attachment_cleanup_runs(note)
  VALUES ('scheduled/system cleanup (hardened)')
  RETURNING id INTO v_run_id;

  FOR r IN
    SELECT a.id
      FROM public.approval_doc_attachments a
     WHERE a.status = 'temp'
       AND a.approval_doc_id IS NULL
       AND a.expires_at IS NOT NULL
       AND a.expires_at < now()
     ORDER BY a.expires_at ASC
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_storage_path := NULL;

      UPDATE public.approval_doc_attachments a
         SET status = 'deleted',
             cleaned_at = now(),
             last_cleanup_error = NULL
       WHERE a.id = r.id
         AND a.status = 'temp'
         AND a.approval_doc_id IS NULL
         AND a.expires_at IS NOT NULL
         AND a.expires_at < now()
      RETURNING a.storage_path INTO v_storage_path;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      IF COALESCE(v_storage_path, '') <> '' THEN
        DELETE FROM storage.objects
         WHERE bucket_id = 'approval_attachments'
           AND name = v_storage_path;
      END IF;

      v_deleted := v_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      UPDATE public.approval_doc_attachments
         SET cleanup_attempts = cleanup_attempts + 1,
             last_cleanup_error = SQLERRM,
             status = CASE WHEN cleanup_attempts + 1 >= 5 THEN 'cleanup_failed' ELSE status END
       WHERE id = r.id
         AND status = 'temp'
         AND approval_doc_id IS NULL;

      INSERT INTO public.attachment_cleanup_errors(run_id, attachment_id, storage_path, error_message)
      VALUES (v_run_id, r.id, v_storage_path, SQLERRM);
    END;
  END LOOP;

  UPDATE public.attachment_cleanup_runs
     SET finished_at = now(),
         scanned_count = v_deleted + v_failed,
         deleted_count = v_deleted,
         failed_count = v_failed
   WHERE id = v_run_id;

  IF v_failed > 0 THEN
    PERFORM public.notify_system_admins_attachment_cleanup_issue(v_run_id, v_failed, v_deleted, 'system');
  END IF;

  RETURN QUERY SELECT v_run_id, v_deleted, v_failed;

  PERFORM pg_advisory_unlock(v_lock_key);
EXCEPTION WHEN OTHERS THEN
  IF v_lock_acquired THEN
    PERFORM pg_advisory_unlock(v_lock_key);
  END IF;
  RAISE;
END;
$$;

COMMIT;
