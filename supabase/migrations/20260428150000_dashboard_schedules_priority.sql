BEGIN;

ALTER TABLE public.dashboard_schedules
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dashboard_schedules_priority_check'
  ) THEN
    ALTER TABLE public.dashboard_schedules
      ADD CONSTRAINT dashboard_schedules_priority_check
      CHECK (priority IN ('high', 'normal', 'low'));
  END IF;
END
$$;

COMMIT;
