-- Approval draft UI upgrade: document header fields + public attachment bucket policies.

BEGIN;

ALTER TABLE public.approval_docs
  ADD COLUMN IF NOT EXISTS execution_start_date date,
  ADD COLUMN IF NOT EXISTS execution_end_date date,
  ADD COLUMN IF NOT EXISTS cooperation_dept text,
  ADD COLUMN IF NOT EXISTS agreement_text text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('approval_attachments', 'approval_attachments', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS approval_attachments_select_public ON storage.objects;
CREATE POLICY approval_attachments_select_public
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'approval_attachments');

DROP POLICY IF EXISTS approval_attachments_insert_authenticated ON storage.objects;
CREATE POLICY approval_attachments_insert_authenticated
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'approval_attachments'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
);

DROP POLICY IF EXISTS approval_attachments_update_authenticated ON storage.objects;
CREATE POLICY approval_attachments_update_authenticated
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'approval_attachments'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'approval_attachments'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
);

DROP POLICY IF EXISTS approval_attachments_delete_authenticated ON storage.objects;
CREATE POLICY approval_attachments_delete_authenticated
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'approval_attachments'
  AND (
    name LIKE auth.uid()::text || '/%'
    OR public.is_system_admin_user(auth.uid())
  )
);

COMMIT;
