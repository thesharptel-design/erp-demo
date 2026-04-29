BEGIN;

DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'approval_histories'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%action_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.approval_histories DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.approval_histories
  ADD CONSTRAINT ck_approval_histories_action_type
  CHECK (
    action_type IN (
      'submit',
      'approve',
      'reject',
      'recall',
      'cancel',
      'cancel_request',
      'cancel_relay',
      'direct_cancel_final',
      'outbound_cancel_done',
      'approve_revoke',
      'outbound_assign_handler',
      'outbound_reassign_handler',
      'outbound_recall_handler',
      'outbound_execute_self',
      'outbound_complete'
    )
  );

COMMIT;
