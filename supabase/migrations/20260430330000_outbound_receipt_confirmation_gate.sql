BEGIN;

ALTER TABLE public.outbound_requests
  ADD COLUMN IF NOT EXISTS receipt_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_confirmed_by uuid;

CREATE INDEX IF NOT EXISTS idx_outbound_requests_receipt_confirmed_at
  ON public.outbound_requests (receipt_confirmed_at);

COMMIT;
