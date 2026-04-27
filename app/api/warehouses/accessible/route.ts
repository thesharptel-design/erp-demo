import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type WarehouseRow = {
  id: number
  name: string
}

type AccessResponse = {
  has_full_access: boolean
  warehouse_ids: number[]
  warehouses: WarehouseRow[]
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 환경변수 누락' }, { status: 500 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })
    }

    const jwt = authHeader.replace('Bearer ', '')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(jwt)
    if (userError || !user) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const { data: appUser, error: appUserError } = await adminClient
      .from('app_users')
      .select('id, role_name, can_manage_permissions, can_admin_manage')
      .eq('id', user.id)
      .single()

    if (appUserError || !appUser) {
      return NextResponse.json({ error: '사용자 정보를 확인할 수 없습니다.' }, { status: 400 })
    }

    const hasFullAccess =
      String(appUser.role_name ?? '').toLowerCase() === 'admin' ||
      appUser.can_manage_permissions === true ||
      appUser.can_admin_manage === true

    let warehouses: WarehouseRow[] = []
    if (hasFullAccess) {
      const { data: rows, error } = await adminClient
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order')
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      warehouses = (rows ?? []) as WarehouseRow[]
    } else {
      const { data: rows, error } = await adminClient
        .from('app_user_warehouses')
        .select('warehouse_id, warehouses!inner(id, name, is_active)')
        .eq('user_id', user.id)
        .eq('warehouses.is_active', true)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      const uniqueById = new Map<number, WarehouseRow>()
      for (const row of rows ?? []) {
        const warehouse = Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses
        const id = Number(warehouse?.id)
        const name = String(warehouse?.name ?? '').trim()
        if (!Number.isInteger(id) || id <= 0 || !name) continue
        uniqueById.set(id, { id, name })
      }
      warehouses = Array.from(uniqueById.values()).sort((a, b) => a.id - b.id)
    }

    const response: AccessResponse = {
      has_full_access: hasFullAccess,
      warehouse_ids: warehouses.map((warehouse) => warehouse.id),
      warehouses,
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : '창고 접근 정보 조회 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
