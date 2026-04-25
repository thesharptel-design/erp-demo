-- Phase A+B DB backstops (additive only)
-- A: one outbound request per approval doc
-- B: transfer idempotency replay/cleanup index

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT approval_doc_id
      FROM public.outbound_requests
      WHERE approval_doc_id IS NOT NULL
      GROUP BY approval_doc_id
      HAVING count(*) > 1
    ) dup
  ) THEN
    RAISE EXCEPTION
      'Cannot create uq_outbound_requests_approval_doc_id: duplicate approval_doc_id exists in outbound_requests';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_outbound_requests_approval_doc_id
  ON public.outbound_requests (approval_doc_id)
  WHERE approval_doc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_transfer_idempotency_created_at_idx
  ON public.inventory_transfer_idempotency (created_at DESC);

COMMIT;
