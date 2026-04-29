import { supabase } from '@/lib/supabase'

export type CurrentUserPermissions = {
  id: string
  employee_no: string | null
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
  outbound_role?: 'none' | 'viewer' | 'worker' | 'master' | null
  can_outbound_view: boolean | null
  can_outbound_execute_self: boolean | null
  can_outbound_assign_handler: boolean | null
  can_outbound_reassign_recall: boolean | null
  can_outbound_execute_any: boolean | null
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

export type OutboundPermissionKey =
  | 'can_outbound_view'
  | 'can_outbound_execute_self'
  | 'can_outbound_assign_handler'
  | 'can_outbound_reassign_recall'
  | 'can_outbound_execute_any'

export type OutboundRole = 'none' | 'viewer' | 'worker' | 'master'

function normalizeOutboundRole(value: unknown): OutboundRole | null {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'none' || v === 'viewer' || v === 'worker' || v === 'master') return v
  return null
}

export function isAdminRole(roleName: string | null | undefined) {
  return String(roleName ?? '').toLowerCase() === 'admin'
}

export function isSystemAdminUser(
  user: Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
): boolean {
  if (!user) return false
  if (isAdminRole(user.role_name)) return true
  return Boolean(user.can_manage_permissions)
}

/**
 * ERP 최고 권한: `role_name = admin` 과 동일하게 시스템 관리자(`can_manage_permissions`) 포함.
 */
export function isErpRoleAdminUser(
  user: Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
): boolean {
  return isSystemAdminUser(user)
}

/** 품목 마스터 등록·수정·삭제 — role admin 과 시스템 관리자 동일. */
export function canEditItemsMaster(
  user: Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
): boolean {
  return isSystemAdminUser(user)
}

/** 중앙 공정 설정(DB) 편집 — role admin 과 시스템 관리자 동일. */
export function canManageCentralItemProcessConfig(
  user: Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'> | null
): boolean {
  return isSystemAdminUser(user)
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
  if (
    isSystemAdminUser(
      user as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'>
    )
  ) {
    return true
  }

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
      return Boolean(user.can_admin_manage)
    case 'can_manage_permissions':
      return Boolean(user.can_manage_permissions)
    default:
      return false
  }
}

export function hasOutboundPermission(
  user: Partial<
    Pick<
      CurrentUserPermissions,
      | 'role_name'
      | 'can_manage_permissions'
      | 'can_admin_manage'
      | 'outbound_role'
      | 'can_outbound_view'
      | 'can_outbound_execute_self'
      | 'can_outbound_assign_handler'
      | 'can_outbound_reassign_recall'
      | 'can_outbound_execute_any'
    >
  > | null,
  key: OutboundPermissionKey
) {
  if (!user) return false
  if (isAdminRole(user.role_name)) return true
  if (
    isSystemAdminUser(
      user as Pick<CurrentUserPermissions, 'role_name' | 'can_manage_permissions' | 'can_admin_manage'>
    )
  ) {
    return true
  }

  const explicitRole = normalizeOutboundRole((user as Partial<CurrentUserPermissions>).outbound_role)
  const inferredRole: OutboundRole =
    explicitRole ??
    (Boolean(user.can_outbound_execute_any) ||
    Boolean(user.can_outbound_assign_handler) ||
    Boolean(user.can_outbound_reassign_recall)
      ? 'master'
      : Boolean(user.can_outbound_execute_self)
        ? 'worker'
        : Boolean(user.can_outbound_view)
          ? 'viewer'
          : 'none')

  switch (key) {
    case 'can_outbound_view':
      return inferredRole !== 'none'
    case 'can_outbound_execute_self':
      return inferredRole === 'worker' || inferredRole === 'master'
    case 'can_outbound_assign_handler':
      return inferredRole === 'master'
    case 'can_outbound_reassign_recall':
      return inferredRole === 'master'
    case 'can_outbound_execute_any':
      return inferredRole === 'master'
    default:
      return false
  }
}

export async function getCurrentUserPermissions() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.id) {
    return null
  }

  const baseSelect = `
    id,
    employee_no,
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
  `
  const outboundSelect = `
    outbound_role,
    can_outbound_view,
    can_outbound_execute_self,
    can_outbound_assign_handler,
    can_outbound_reassign_recall,
    can_outbound_execute_any
  `

  const fetchBy = async (column: 'id' | 'email', value: string) => {
    let result = await supabase
      .from('app_users')
      .select(`${baseSelect}, ${outboundSelect}`)
      .eq(column, value)
      .maybeSingle()

    const missingOutboundColumns =
      result.error &&
      /outbound_role|can_outbound_(view|execute_self|assign_handler|reassign_recall|execute_any)/i.test(result.error.message)

    if (missingOutboundColumns) {
      result = await supabase.from('app_users').select(baseSelect).eq(column, value).maybeSingle()
    }

    if (result.error || !result.data) return null

    return {
      ...result.data,
      outbound_role: normalizeOutboundRole(result.data.outbound_role),
      can_outbound_view: result.data.can_outbound_view === true,
      can_outbound_execute_self: result.data.can_outbound_execute_self === true,
      can_outbound_assign_handler: result.data.can_outbound_assign_handler === true,
      can_outbound_reassign_recall: result.data.can_outbound_reassign_recall === true,
      can_outbound_execute_any: result.data.can_outbound_execute_any === true,
    } as CurrentUserPermissions
  }

  const byId = await fetchBy('id', user.id)
  if (byId) return byId

  const email = String(user.email ?? '').trim()
  if (email) {
    const byEmail = await fetchBy('email', email)
    if (byEmail) return byEmail
  }

  return null
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