BEGIN;

-- approval_participants role model:
-- reviewer / cooperator / approver
ALTER TABLE public.approval_participants
  DROP CONSTRAINT IF EXISTS approval_participants_role_check;

UPDATE public.approval_participants
SET role = CASE
  WHEN role IN ('review', 'reviewer') THEN 'reviewer'
  WHEN role IN ('approve', 'final_approver', 'approver') THEN 'approver'
  WHEN role IN ('pre_cooperator', 'post_cooperator', 'reference', 'cooperator') THEN 'cooperator'
  ELSE role
END;

-- Legacy roles can collapse into duplicate (approval_doc_id, user_id, role) keys.
-- Keep the earliest line and delete the rest before re-enabling constraints.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY approval_doc_id, user_id, role
      ORDER BY COALESCE(line_no, 2147483647), id
    ) AS rn
  FROM public.approval_participants
)
DELETE FROM public.approval_participants p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.approval_participants
    WHERE role NOT IN ('reviewer', 'cooperator', 'approver')
  ) THEN
    RAISE EXCEPTION 'approval_participants.role contains unsupported values';
  END IF;
END
$$;

ALTER TABLE public.approval_participants
  ADD CONSTRAINT approval_participants_role_check
  CHECK (role IN ('reviewer', 'cooperator', 'approver'));

-- Keep approval_lines role values in sync with the new model.
UPDATE public.approval_lines
SET approver_role = CASE
  WHEN approver_role IN ('review', 'reviewer') THEN 'reviewer'
  WHEN approver_role IN ('approve', 'final_approver', 'approver') THEN 'approver'
  WHEN approver_role IN ('pre_cooperator', 'post_cooperator', 'reference', 'cooperator') THEN 'cooperator'
  ELSE approver_role
END;

COMMIT;
