BEGIN;

-- Keep anonymous board moderation as role-admin only, but align other admin features
-- with system-admin policy (role admin OR can_manage_permissions OR can_admin_manage).

CREATE OR REPLACE FUNCTION public.is_system_admin_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = p_user_id
      AND (
        lower(COALESCE(u.role_name, '')) = 'admin'
        OR COALESCE((to_jsonb(u) ->> 'can_manage_permissions')::boolean, false) = true
        OR COALESCE((to_jsonb(u) ->> 'can_admin_manage')::boolean, false) = true
      )
  );
$$;

-- Warehouses: system-admin can read/write.
DROP POLICY IF EXISTS warehouses_select_policy ON public.warehouses;
CREATE POLICY warehouses_select_policy
ON public.warehouses
FOR SELECT
TO authenticated
USING (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS warehouses_write_policy ON public.warehouses;
CREATE POLICY warehouses_write_policy
ON public.warehouses
FOR ALL
TO authenticated
USING (public.is_system_admin_user(auth.uid()))
WITH CHECK (public.is_system_admin_user(auth.uid()));

-- Dashboard schedules: system-admin can CUD.
DROP POLICY IF EXISTS dashboard_schedules_insert_admin_only ON public.dashboard_schedules;
CREATE POLICY dashboard_schedules_insert_admin_only
ON public.dashboard_schedules
FOR INSERT
TO authenticated
WITH CHECK (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS dashboard_schedules_update_admin_only ON public.dashboard_schedules;
CREATE POLICY dashboard_schedules_update_admin_only
ON public.dashboard_schedules
FOR UPDATE
TO authenticated
USING (public.is_system_admin_user(auth.uid()))
WITH CHECK (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS dashboard_schedules_delete_admin_only ON public.dashboard_schedules;
CREATE POLICY dashboard_schedules_delete_admin_only
ON public.dashboard_schedules
FOR DELETE
TO authenticated
USING (public.is_system_admin_user(auth.uid()));

-- CoA files: align admin/system-admin access to avoid sidebar mismatch.
DROP POLICY IF EXISTS coa_files_select_policy ON public.coa_files;
CREATE POLICY coa_files_select_policy
ON public.coa_files
FOR SELECT
TO authenticated
USING (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS coa_files_insert_policy ON public.coa_files;
CREATE POLICY coa_files_insert_policy
ON public.coa_files
FOR INSERT
TO authenticated
WITH CHECK (public.is_system_admin_user(auth.uid()));

COMMIT;
