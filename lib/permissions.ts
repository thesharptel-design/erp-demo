import { supabase } from '@/lib/supabase'

export type CurrentUserPermissions = {
  id: string
  login_id: string | null
  email: string | null
  user_name: string | null
  role_name: string | null
  can_manage_master: boolean | null
  can_sales_manage: boolean | null
  can_material_manage: boolean | null
  can_production_manage: boolean | null
  can_qc_manage: boolean | null
  can_admin_manage: boolean | null
  can_manage_permissions: boolean | null
  // legacy fallback keys
  can_quote_create: boolean
  can_po_create: boolean
  can_receive_stock: boolean
  can_prod_complete: boolean
  can_approve: boolean
}

export type ManagePermissionKey =
  | 'can_manage_master'
  | 'can_sales_manage'
  | 'can_material_manage'
  | 'can_production_manage'
  | 'can_qc_manage'
  | 'can_admin_manage'
  | 'can_manage_permissions'

export function isAdminRole(roleName: string | null | undefined) {
  return String(roleName ?? '').toLowerCase() === 'admin'
}

export function hasManagePermission(
  user: Partial<
    Pick<
    CurrentUserPermissions,
    | 'role_name'
    | 'can_manage_master'
    | 'can_sales_manage'
    | 'can_material_manage'
    | 'can_production_manage'
    | 'can_qc_manage'
    | 'can_admin_manage'
    | 'can_manage_permissions'
    | 'can_quote_create'
    | 'can_po_create'
    | 'can_receive_stock'
    | 'can_prod_complete'
    | 'can_approve'
  >
  > | null,
  key: ManagePermissionKey
) {
  if (!user) return false
  if (isAdminRole(user.role_name)) return true

  switch (key) {
    case 'can_manage_master':
      return Boolean(user.can_manage_master)
    case 'can_sales_manage':
      return Boolean(user.can_sales_manage) || Boolean(user.can_po_create) || Boolean(user.can_quote_create)
    case 'can_material_manage':
      return Boolean(user.can_material_manage) || Boolean(user.can_receive_stock)
    case 'can_production_manage':
      return Boolean(user.can_production_manage) || Boolean(user.can_prod_complete)
    case 'can_qc_manage':
      return Boolean(user.can_qc_manage) || Boolean(user.can_approve)
    case 'can_admin_manage':
      return Boolean(user.can_admin_manage) || Boolean(user.can_manage_permissions)
    case 'can_manage_permissions':
      return Boolean(user.can_manage_permissions)
    default:
      return false
  }
}

export async function getCurrentUserPermissions() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return null
  }

  const { data, error } = await supabase
    .from('app_users')
    .select(`
      id,
      login_id,
      email,
      user_name,
      role_name,
      can_manage_master,
      can_sales_manage,
      can_material_manage,
      can_production_manage,
      can_qc_manage,
      can_admin_manage,
      can_manage_permissions,
      can_quote_create,
      can_po_create,
      can_receive_stock,
      can_prod_complete,
      can_approve
    `)
    .eq('email', user.email)
    .single()

  if (error || !data) {
    return null
  }

  return data as CurrentUserPermissions
}