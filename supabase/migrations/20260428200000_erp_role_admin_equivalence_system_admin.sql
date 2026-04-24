-- Align "ERP role admin" checks with system admin (role admin OR can_manage_permissions OR can_admin_manage).

BEGIN;

CREATE OR REPLACE FUNCTION public.is_erp_role_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_system_admin_user(p_user_id);
$$;

REVOKE ALL ON FUNCTION public.is_erp_role_admin_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_erp_role_admin_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_erp_role_admin_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.is_approval_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_system_admin_user(p_uid);
$$;

REVOKE ALL ON FUNCTION public.is_approval_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approval_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approval_admin(uuid) TO service_role;

DROP POLICY IF EXISTS item_process_config_insert_system_admin ON public.item_process_config;
CREATE POLICY item_process_config_insert_system_admin
ON public.item_process_config
FOR INSERT
TO authenticated
WITH CHECK (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS item_process_config_update_system_admin ON public.item_process_config;
CREATE POLICY item_process_config_update_system_admin
ON public.item_process_config
FOR UPDATE
TO authenticated
USING (public.is_system_admin_user(auth.uid()))
WITH CHECK (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS active_user_sessions_select_policy ON public.active_user_sessions;
CREATE POLICY active_user_sessions_select_policy
ON public.active_user_sessions
FOR SELECT
TO authenticated
USING (public.is_system_admin_user(auth.uid()));

COMMIT;
