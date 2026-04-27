import type { SupabaseClient } from '@supabase/supabase-js'

export type AccessibleWarehouseRow = { id: number; name: string }

export type ResolveAccessibleWarehousesResult =
  | { ok: true; hasFullAccess: true; warehouseIds: null; warehouses: AccessibleWarehouseRow[] }
  | { ok: true; hasFullAccess: false; warehouseIds: number[]; warehouses: AccessibleWarehouseRow[] }
  | { ok: false; error: string; status: number }

/**
 * `/api/warehouses/accessible`와 동일한 기준으로, 인증 사용자가 볼 수 있는 창고 목록을 반환합니다.
 * `authUserId`는 `auth.users.id` (= `app_users.id`)입니다.
 */
export async function resolveAccessibleWarehouses(
  adminClient: SupabaseClient,
  authUserId: string
): Promise<ResolveAccessibleWarehousesResult> {
  const { data: appUser, error: appUserError } = await adminClient
    .from('app_users')
    .select('id, role_name, can_manage_permissions, can_admin_manage')
    .eq('id', authUserId)
    .single()

  if (appUserError || !appUser) {
    return { ok: false, error: '사용자 정보를 확인할 수 없습니다.', status: 400 }
  }

  const hasFullAccess =
    String(appUser.role_name ?? '').toLowerCase() === 'admin' ||
    appUser.can_manage_permissions === true ||
    appUser.can_admin_manage === true

  if (hasFullAccess) {
    const { data: rows, error } = await adminClient
      .from('warehouses')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      return { ok: false, error: error.message, status: 400 }
    }

    const warehouses = ((rows ?? []) as AccessibleWarehouseRow[]).filter(
      (w) => Number.isInteger(Number(w.id)) && Number(w.id) > 0 && String(w.name ?? '').trim()
    )
    return { ok: true, hasFullAccess: true, warehouseIds: null, warehouses }
  }

  const { data: rows, error } = await adminClient
    .from('app_user_warehouses')
    .select('warehouse_id, warehouses!inner(id, name, is_active)')
    .eq('user_id', authUserId)
    .eq('warehouses.is_active', true)

  if (error) {
    return { ok: false, error: error.message, status: 400 }
  }

  const uniqueById = new Map<number, AccessibleWarehouseRow>()
  for (const row of rows ?? []) {
    const warehouse = Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses
    const id = Number(warehouse?.id)
    const name = String(warehouse?.name ?? '').trim()
    if (!Number.isInteger(id) || id <= 0 || !name) continue
    uniqueById.set(id, { id, name })
  }

  const warehouses = Array.from(uniqueById.values()).sort((a, b) => a.id - b.id)
  const warehouseIds = warehouses.map((w) => w.id)

  if (warehouseIds.length === 0) {
    return {
      ok: true,
      hasFullAccess: false,
      warehouseIds: [],
      warehouses: [],
    }
  }

  return { ok: true, hasFullAccess: false, warehouseIds, warehouses }
}
