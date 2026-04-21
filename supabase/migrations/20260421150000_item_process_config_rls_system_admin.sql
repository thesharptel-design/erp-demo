-- Allow system admins (role admin OR can_admin_manage) to edit item_process_config singleton.

BEGIN;

DROP POLICY IF EXISTS item_process_config_insert_super_admin ON public.item_process_config;
CREATE POLICY item_process_config_insert_system_admin
ON public.item_process_config
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND (
        lower(COALESCE(u.role_name, '')) = 'admin'
        OR COALESCE(u.can_admin_manage, false) = true
      )
  )
);

DROP POLICY IF EXISTS item_process_config_update_super_admin ON public.item_process_config;
CREATE POLICY item_process_config_update_system_admin
ON public.item_process_config
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND (
        lower(COALESCE(u.role_name, '')) = 'admin'
        OR COALESCE(u.can_admin_manage, false) = true
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.app_users u
    WHERE u.id = auth.uid()
      AND (
        lower(COALESCE(u.role_name, '')) = 'admin'
        OR COALESCE(u.can_admin_manage, false) = true
      )
  )
);

COMMIT;
