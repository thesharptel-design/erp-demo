BEGIN;

-- 0) Immediate mitigation: disable legacy/unused management flag for all users.
UPDATE public.app_users
SET can_admin_manage = false
WHERE COALESCE(can_admin_manage, false) = true;

-- 1) System admin policy: role admin OR can_manage_permissions only.
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
      )
  );
$$;

-- 2) Keep approval/ERP admin helper functions aligned with system admin policy.
CREATE OR REPLACE FUNCTION public.is_erp_role_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_system_admin_user(p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_approval_admin(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_system_admin_user(p_uid);
$$;

-- 3) Item process config: policy should also follow is_system_admin_user only.
DROP POLICY IF EXISTS item_process_config_insert_super_admin ON public.item_process_config;
DROP POLICY IF EXISTS item_process_config_insert_system_admin ON public.item_process_config;
CREATE POLICY item_process_config_insert_system_admin
ON public.item_process_config
FOR INSERT
TO authenticated
WITH CHECK (public.is_system_admin_user(auth.uid()));

DROP POLICY IF EXISTS item_process_config_update_super_admin ON public.item_process_config;
DROP POLICY IF EXISTS item_process_config_update_system_admin ON public.item_process_config;
CREATE POLICY item_process_config_update_system_admin
ON public.item_process_config
FOR UPDATE
TO authenticated
USING (public.is_system_admin_user(auth.uid()))
WITH CHECK (public.is_system_admin_user(auth.uid()));

COMMIT;
