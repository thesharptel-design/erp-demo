BEGIN;

-- approval_histories.action_type 허용값을 현재 앱 로직과 정합하게 표준화.
-- 환경마다 기존 CHECK 제약 이름/정의가 달라질 수 있어, action_type 관련 CHECK를 먼저 모두 정리한다.
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
      -- legacy/호환
      'cancel',
      -- 취소/철회 확장
      'cancel_request',
      'cancel_relay',
      'direct_cancel_final',
      'outbound_cancel_done',
      'approve_revoke'
    )
  );

COMMIT;

