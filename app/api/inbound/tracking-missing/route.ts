import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasManagePermission } from '@/lib/permissions'
import { resolveAccessibleWarehouses } from '@/lib/server/resolve-accessible-warehouses'

type MissingRow = {
  transaction_id: number | null
  inventory_id: number
  trans_date: string | null
  warehouse_id: number
  warehouse_name: string
  item_id: number
  item_code: string
  item_name: string
  qty: number
  lot_no: string | null
  exp_date: string | null
  serial_no: string | null
  need_lot: boolean
  need_exp: boolean
  need_sn: boolean
  missing_fields: string[]
  completed_qty: number
  total_qty: number
  progress_pct: number
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 환경변수가 설정되지 않았습니다.' }, { status: 500 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(jwt)
    if (userError || !user?.id) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const { data: appUser, error: appUserError } = await adminClient
      .from('app_users')
      .select('id, role_name, can_material_manage, can_manage_permissions, can_admin_manage')
      .eq('id', user.id)
      .single()
    if (appUserError || !appUser) {
      return NextResponse.json({ error: '현재 사용자 권한을 확인할 수 없습니다.' }, { status: 403 })
    }
    if (!hasManagePermission(appUser, 'can_material_manage')) {
      return NextResponse.json({ error: '입고 보완 권한이 없습니다.' }, { status: 403 })
    }

    const access = await resolveAccessibleWarehouses(adminClient, user.id)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }
    if (!access.hasFullAccess && access.warehouseIds.length === 0) {
      return NextResponse.json({ rows: [], warehouses: [] })
    }

    const params = request.nextUrl.searchParams
    const dateFrom = normalizeText(params.get('date_from'))
    const dateTo = normalizeText(params.get('date_to'))
    const itemKeyword = normalizeText(params.get('item_keyword'))?.toLowerCase() ?? ''
    const warehouseFilter = Number(params.get('warehouse_id') ?? 0)
    const onlyMissing = String(params.get('only_missing') ?? 'true') !== 'false'
    const countOnly = String(params.get('count_only') ?? 'false') === 'true'

    let query = adminClient
      .from('inventory')
      .select(`
        id,
        current_qty,
        lot_no,
        exp_date,
        serial_no,
        warehouse_id,
        items!inner (
          id,
          item_code,
          item_name,
          is_lot_managed,
          is_exp_managed,
          is_sn_managed
        ),
        warehouses!inner (name)
      `)
      .gt('current_qty', 0)
      .order('id', { ascending: false })
      .limit(3000)

    if (!access.hasFullAccess) query = query.in('warehouse_id', access.warehouseIds)
    if (Number.isInteger(warehouseFilter) && warehouseFilter > 0) query = query.eq('warehouse_id', warehouseFilter)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const baseRows = ((data ?? []) as any[])
      .map((row) => {
        const item = Array.isArray(row.items) ? row.items[0] : row.items
        const warehouse = Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses
        if (!item || !warehouse) return null

        const lotNo = normalizeText(row.lot_no)
        const expDate = normalizeText(row.exp_date)
        const serialNo = normalizeText(row.serial_no)
        const needLot = Boolean(item.is_lot_managed)
        const needExp = Boolean(item.is_exp_managed)
        const needSn = Boolean(item.is_sn_managed)
        const missingFields: string[] = []
        if (needLot && !lotNo) missingFields.push('LOT')
        if (needExp && !expDate) missingFields.push('EXP')
        if (needSn && !serialNo) missingFields.push('SN')

        const out: MissingRow = {
          transaction_id: null,
          inventory_id: Number(row.id),
          trans_date: null,
          warehouse_id: Number(row.warehouse_id),
          warehouse_name: String(warehouse.name ?? ''),
          item_id: Number(item.id),
          item_code: String(item.item_code ?? ''),
          item_name: String(item.item_name ?? ''),
          qty: Number(row.current_qty ?? 0),
          lot_no: lotNo,
          exp_date: expDate,
          serial_no: serialNo,
          need_lot: needLot,
          need_exp: needExp,
          need_sn: needSn,
          missing_fields: missingFields,
          completed_qty: 0,
          total_qty: Number(row.current_qty ?? 0),
          progress_pct: 0,
        }
        return out
      })
      .filter((row): row is MissingRow => row !== null)
      .filter((row) => {
        if (onlyMissing && row.missing_fields.length === 0) return false
        if (dateFrom || dateTo) {
          // inventory에는 trans_date가 없어 최신 IN 트랜잭션 일시는 응답에 포함되지 않습니다.
          // 날짜 필터는 화면 단에서 보완 저장 대상을 좁히는 보조 조건으로만 사용합니다.
        }
        if (!itemKeyword) return true
        return row.item_code.toLowerCase().includes(itemKeyword) || row.item_name.toLowerCase().includes(itemKeyword)
      })

    const inventoryIds = baseRows.map((row) => row.inventory_id)
    let completedQtyByInventoryId = new Map<number, number>()
    if (inventoryIds.length > 0) {
      const { data: completionRows, error: completionError } = await adminClient
        .from('inbound_tracking_completions')
        .select('inventory_id, completed_qty')
        .in('inventory_id', inventoryIds)
      if (!completionError) {
        completedQtyByInventoryId = new Map<number, number>()
        for (const row of (completionRows ?? []) as Array<{ inventory_id: number; completed_qty: number | null }>) {
          const inventoryId = Number(row.inventory_id)
          const completedQty = Number(row.completed_qty ?? 0)
          if (!Number.isInteger(inventoryId) || inventoryId <= 0 || !Number.isFinite(completedQty) || completedQty <= 0) continue
          completedQtyByInventoryId.set(inventoryId, (completedQtyByInventoryId.get(inventoryId) ?? 0) + completedQty)
        }
      }
    }

    const rows = baseRows.map((row) => {
      const completedQty = completedQtyByInventoryId.get(row.inventory_id) ?? 0
      const totalQty = completedQty + Number(row.qty ?? 0)
      const progressPct = totalQty > 0 ? Math.min(100, Math.round((completedQty / totalQty) * 100)) : 0
      return {
        ...row,
        completed_qty: completedQty,
        total_qty: totalQty,
        progress_pct: progressPct,
      }
    })

    if (countOnly) {
      return NextResponse.json({
        count: rows.length,
        warehouses: access.warehouses,
      })
    }

    return NextResponse.json({
      rows,
      warehouses: access.warehouses,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '누락 추적정보 조회 중 서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
