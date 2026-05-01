-- Approval workflow v2 status guardrails.
-- Data impact: no rows are changed or deleted. Existing rows must already use one of these status values.
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
       AND t.relname = 'approval_docs'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.approval_docs DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.approval_docs
  ADD CONSTRAINT ck_approval_docs_workflow_v2_status
  CHECK (
    status IN (
      'draft',
      'submitted',
      'in_review',
      'in_progress',
      'approved',
      'effective',
      'closed',
      'rejected'
    )
  );

COMMENT ON CONSTRAINT ck_approval_docs_workflow_v2_status ON public.approval_docs IS
  'Approval workflow v2 document statuses. effective means final approval has business effect; closed means post-cooperation is complete.';

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
       AND t.relname = 'approval_lines'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.approval_lines DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
END $$;

ALTER TABLE public.approval_lines
  ADD CONSTRAINT ck_approval_lines_workflow_v2_status
  CHECK (
    status IN (
      'waiting',
      'pending',
      'confirmed',
      'approved',
      'rejected',
      'skipped',
      'cancelled',
      'invalidated'
    )
  );

COMMENT ON CONSTRAINT ck_approval_lines_workflow_v2_status ON public.approval_lines IS
  'Approval workflow v2 line statuses. confirmed is for cooperators; approved is for approvers; skipped is used by override approval.';

COMMIT;
