-- Items: optional manufacturer/remarks, process_metadata JSON, remove safety_stock_qty.
-- Storage: private bucket sop-files + RLS on storage.objects (paths under item-*/).

BEGIN;

ALTER TABLE public.items DROP COLUMN IF EXISTS safety_stock_qty;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS manufacturer text NULL,
  ADD COLUMN IF NOT EXISTS remarks text NULL,
  ADD COLUMN IF NOT EXISTS process_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.items.process_metadata IS
  'JSON shape: { "category"?: string, "checks"?: Record<string, boolean>, "sopFiles"?: Array<{ path: string, name: string, uploadedAt: string }> }';

INSERT INTO storage.buckets (id, name, public)
VALUES ('sop-files', 'sop-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS sop_files_objects_select_authenticated ON storage.objects;
CREATE POLICY sop_files_objects_select_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'sop-files'
  AND name LIKE 'item-%'
);

DROP POLICY IF EXISTS sop_files_objects_insert_authenticated ON storage.objects;
CREATE POLICY sop_files_objects_insert_authenticated
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sop-files'
  AND name LIKE 'item-%'
);

DROP POLICY IF EXISTS sop_files_objects_update_authenticated ON storage.objects;
CREATE POLICY sop_files_objects_update_authenticated
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'sop-files'
  AND name LIKE 'item-%'
)
WITH CHECK (
  bucket_id = 'sop-files'
  AND name LIKE 'item-%'
);

DROP POLICY IF EXISTS sop_files_objects_delete_authenticated ON storage.objects;
CREATE POLICY sop_files_objects_delete_authenticated
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'sop-files'
  AND name LIKE 'item-%'
);

COMMIT;
