BEGIN;

ALTER TABLE public.inbound_upload_log_rows
  ADD COLUMN IF NOT EXISTS item_name text NULL;

COMMIT;
