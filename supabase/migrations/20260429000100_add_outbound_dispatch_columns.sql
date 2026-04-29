BEGIN;

ALTER TABLE public.outbound_requests
  ADD COLUMN IF NOT EXISTS dispatch_state text,
  ADD COLUMN IF NOT EXISTS dispatch_handler_user_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_handler_name text,
  ADD COLUMN IF NOT EXISTS dispatch_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_last_actor_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_last_action_at timestamptz;

UPDATE public.outbound_requests
   SET dispatch_state = CASE
     WHEN status = 'completed' THEN 'completed'
     ELSE 'queue'
   END
 WHERE dispatch_state IS NULL;

ALTER TABLE public.outbound_requests
  ALTER COLUMN dispatch_state SET DEFAULT 'queue',
  ALTER COLUMN dispatch_state SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_outbound_requests_dispatch_state'
  ) THEN
    ALTER TABLE public.outbound_requests
      ADD CONSTRAINT ck_outbound_requests_dispatch_state
      CHECK (dispatch_state IN ('queue', 'assigned', 'in_progress', 'completed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_outbound_requests_dispatch_handler_user'
  ) THEN
    ALTER TABLE public.outbound_requests
      ADD CONSTRAINT fk_outbound_requests_dispatch_handler_user
      FOREIGN KEY (dispatch_handler_user_id)
      REFERENCES public.app_users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_outbound_requests_dispatch_last_actor'
  ) THEN
    ALTER TABLE public.outbound_requests
      ADD CONSTRAINT fk_outbound_requests_dispatch_last_actor
      FOREIGN KEY (dispatch_last_actor_id)
      REFERENCES public.app_users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outbound_requests_dispatch_state
  ON public.outbound_requests (dispatch_state);

CREATE INDEX IF NOT EXISTS idx_outbound_requests_dispatch_handler_user
  ON public.outbound_requests (dispatch_handler_user_id);

COMMIT;
