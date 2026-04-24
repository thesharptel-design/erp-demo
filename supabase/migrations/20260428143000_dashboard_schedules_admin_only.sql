BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_schedules (
  id bigserial PRIMARY KEY,
  schedule_date date NOT NULL,
  start_time time NULL,
  end_time time NULL,
  title text NOT NULL,
  description text NULL,
  location text NULL,
  created_by uuid NOT NULL REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_dashboard_schedules_date
  ON public.dashboard_schedules (schedule_date);

CREATE INDEX IF NOT EXISTS idx_dashboard_schedules_date_time
  ON public.dashboard_schedules (schedule_date, start_time);

CREATE OR REPLACE FUNCTION public.set_dashboard_schedules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dashboard_schedules_updated_at ON public.dashboard_schedules;
CREATE TRIGGER trg_dashboard_schedules_updated_at
BEFORE UPDATE ON public.dashboard_schedules
FOR EACH ROW
EXECUTE FUNCTION public.set_dashboard_schedules_updated_at();

CREATE OR REPLACE FUNCTION public.is_erp_role_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = p_user_id
      AND lower(trim(COALESCE(u.role_name, ''))) = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_erp_role_admin_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_erp_role_admin_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_erp_role_admin_user(uuid) TO service_role;

ALTER TABLE public.dashboard_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_schedules_select_authenticated ON public.dashboard_schedules;
CREATE POLICY dashboard_schedules_select_authenticated
ON public.dashboard_schedules
FOR SELECT
TO authenticated
USING (is_deleted = false);

DROP POLICY IF EXISTS dashboard_schedules_insert_admin_only ON public.dashboard_schedules;
CREATE POLICY dashboard_schedules_insert_admin_only
ON public.dashboard_schedules
FOR INSERT
TO authenticated
WITH CHECK (public.is_erp_role_admin_user(auth.uid()));

DROP POLICY IF EXISTS dashboard_schedules_update_admin_only ON public.dashboard_schedules;
CREATE POLICY dashboard_schedules_update_admin_only
ON public.dashboard_schedules
FOR UPDATE
TO authenticated
USING (public.is_erp_role_admin_user(auth.uid()))
WITH CHECK (public.is_erp_role_admin_user(auth.uid()));

DROP POLICY IF EXISTS dashboard_schedules_delete_admin_only ON public.dashboard_schedules;
CREATE POLICY dashboard_schedules_delete_admin_only
ON public.dashboard_schedules
FOR DELETE
TO authenticated
USING (public.is_erp_role_admin_user(auth.uid()));

COMMIT;
