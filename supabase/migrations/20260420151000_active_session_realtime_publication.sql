BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.active_user_sessions;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN invalid_object_definition THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.login_audit_logs;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN invalid_object_definition THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
