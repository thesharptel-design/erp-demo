-- 임시 첨부 자동 정리 무인화:
-- 1) 관리자 로그인 컨텍스트 없이도 실행 가능한 시스템 전용 래퍼 함수 추가
-- 2) pg_cron 사용 가능 시 주기 스케줄 등록
BEGIN;

-- 시스템/배치 전용 래퍼.
-- 기존 cleanup_expired_temp_approval_attachments()의 관리자 auth.uid 검사에 막히지 않도록
-- 동일 정리 로직을 서비스 실행 컨텍스트에서 수행합니다.
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
  r RECORD;
BEGIN
  INSERT INTO public.attachment_cleanup_runs(note)
  VALUES ('scheduled/system cleanup')
  RETURNING id INTO v_run_id;

  FOR r IN
    SELECT a.id, a.storage_path
      FROM public.approval_doc_attachments a
     WHERE a.status = 'temp'
       AND a.approval_doc_id IS NULL
       AND a.expires_at IS NOT NULL
       AND a.expires_at < now()
     ORDER BY a.expires_at ASC
     LIMIT v_limit
  LOOP
    BEGIN
      IF COALESCE(r.storage_path, '') <> '' THEN
        DELETE FROM storage.objects
         WHERE bucket_id = 'approval_attachments'
           AND name = r.storage_path;
      END IF;

      UPDATE public.approval_doc_attachments
         SET status = 'deleted',
             cleaned_at = now(),
             last_cleanup_error = NULL
       WHERE id = r.id;
      v_deleted := v_deleted + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      UPDATE public.approval_doc_attachments
         SET cleanup_attempts = cleanup_attempts + 1,
             last_cleanup_error = SQLERRM,
             status = CASE WHEN cleanup_attempts + 1 >= 5 THEN 'cleanup_failed' ELSE status END
       WHERE id = r.id;
      INSERT INTO public.attachment_cleanup_errors(run_id, attachment_id, storage_path, error_message)
      VALUES (v_run_id, r.id, r.storage_path, SQLERRM);
    END;
  END LOOP;

  UPDATE public.attachment_cleanup_runs
     SET finished_at = now(),
         scanned_count = v_deleted + v_failed,
         deleted_count = v_deleted,
         failed_count = v_failed
   WHERE id = v_run_id;

  RETURN QUERY SELECT v_run_id, v_deleted, v_failed;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_temp_approval_attachments_system(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_temp_approval_attachments_system(integer) TO service_role;

COMMENT ON FUNCTION public.cleanup_expired_temp_approval_attachments_system(integer) IS
  'System-only cleanup for expired temp approval attachments. Intended for pg_cron/service_role automation without admin login context.';

-- 매 15분마다 만료 임시첨부 정리 (무인 실행).
DO $cron$
DECLARE
  j RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'cleanup_expired_temp_approval_attachments'
    LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;

    PERFORM cron.schedule(
      'cleanup_expired_temp_approval_attachments',
      '*/15 * * * *',
      $$SELECT public.cleanup_expired_temp_approval_attachments_system(300);$$
    );
  END IF;
END
$cron$;

COMMIT;
