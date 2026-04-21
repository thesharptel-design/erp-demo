import { supabase } from '@/lib/supabase'

export type CurrentUserPermissions = {
  id: string
  login_id: string | null
  email: string | null
  user_name: string | null
  user_kind: 'student' | 'teacher' | 'staff'
  role_name: string | null
  department: string | null
  job_rank: string | null
  training_program: string | null
  school_name: string | null
  grade_level: string | null
  major: string | null
  teacher_subject: string | null
  seal_image_path: string | null
  can_approval_participate: boolean
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

export function isSystemAdminUser(
  user: Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
): boolean {
  if (!user) return false
  if (isAdminRole(user.role_name)) return true
  return Boolean(user.can_manage_permissions) || Boolean(user.can_admin_manage)
}

/** System Admin 이상: 품목 마스터 등록·수정·삭제 (role admin 또는 시스템 관리 플래그). */
export function canEditItemsMaster(
  user: Pick<CurrentUserPermissions, 'role_name' | 'can_admin_manage'> | null
): boolean {
  if (!user) return false
  if (isAdminRole(user.role_name)) return true
  return Boolean(user.can_admin_manage)
}

/** 최고관리자: 중앙 공정 설정(DB) 편집 — role `admin` 전용. */
export function canManageCentralItemProcessConfig(
  user: Pick<CurrentUserPermissions, 'role_name'> | null
): boolean {
  if (!user) return false
  return isAdminRole(user.role_name)
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
      user_kind,
      role_name,
      department,
      job_rank,
      training_program,
      school_name,
      grade_level,
      major,
      teacher_subject,
      seal_image_path,
      can_approval_participate,
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

export async function getAllowedWarehouseIds(
  user?: Pick<
    CurrentUserPermissions,
    'id' | 'role_name' | 'can_manage_permissions' | 'can_admin_manage'
  > | null
): Promise<number[] | null> {
  const currentUser = user ?? (await getCurrentUserPermissions())
  if (!currentUser) return []
  if (isSystemAdminUser(currentUser)) return null

  const { data, error } = await supabase
    .from('app_user_warehouses')
    .select('warehouse_id')
    .eq('user_id', currentUser.id)

  if (error || !data) return []

  const warehouseIds = data
    .map((row) => Number(row.warehouse_id))
    .filter((value) => Number.isInteger(value) && value > 0)

  return Array.from(new Set(warehouseIds))
}