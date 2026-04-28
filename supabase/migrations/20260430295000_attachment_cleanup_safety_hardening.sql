-- 임시 첨부 자동정리 안전 하드닝:
-- - 중복 실행 방지(advisory lock)
-- - 동시 처리 충돌 완화(FOR UPDATE SKIP LOCKED)
-- - 레이스 조건 방지(삭제 시점 상태 재검증)
BEGIN;

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

  RETURN QUERY SELECT v_run_id, v_deleted, v_failed;

  PERFORM pg_advisory_unlock(v_lock_key);
EXCEPTION WHEN OTHERS THEN
  IF v_lock_acquired THEN
    PERFORM pg_advisory_unlock(v_lock_key);
  END IF;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_temp_approval_attachments(integer) IS
  'Admin-triggered cleanup with overlap lock, row-level skip-locked scanning, and race-safe delete conditions.';

COMMENT ON FUNCTION public.cleanup_expired_temp_approval_attachments_system(integer) IS
  'System-only cleanup with overlap lock, row-level skip-locked scanning, and race-safe delete conditions for unattended automation.';

COMMIT;
