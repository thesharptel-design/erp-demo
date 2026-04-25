BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_adjust_idempotency (
  actor_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS inventory_adjust_idempotency_created_at_idx
  ON public.inventory_adjust_idempotency (created_at DESC);

COMMIT;
