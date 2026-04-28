BEGIN;

ALTER TABLE public.approval_histories
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_histories_doc_dedupe_key
ON public.approval_histories (approval_doc_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;

COMMIT;
