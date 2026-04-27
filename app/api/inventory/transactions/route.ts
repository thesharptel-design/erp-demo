import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAccessibleWarehouses } from '@/lib/server/resolve-accessible-warehouses'

type TxOut = {
  id: number
  trans_date: string
  trans_type: string
  qty: number
  remarks: string | null
  created_by: string | null
  lot_no: string | null
  serial_no: string | null
  exp_date: string | null
  warehouse_id: number | null
  inventory_id: number | null
  items?: { item_code: string; item_name: string; unit: string | null; process_metadata?: unknown } | null
  warehouses?: { name: string | null } | null
  processor_name: string
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
    if (userError || !user?.id) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const access = await resolveAccessibleWarehouses(adminClient, user.id)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    if (!access.hasFullAccess && access.warehouseIds.length === 0) {
      return NextResponse.json({
        transactions: [] as TxOut[],
        warehouses: access.warehouses,
      })
    }

    let txQuery = adminClient
      .from('inventory_transactions')
      .select(`
        id,
        trans_date,
        trans_type,
        qty,
        remarks,
        created_by,
        lot_no,
        serial_no,
        exp_date,
        warehouse_id,
        inventory_id,
        items (item_code, item_name, unit, process_metadata),
        warehouses (name)
      `)
      .order('trans_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(8000)

    if (!access.hasFullAccess) {
      txQuery = txQuery.in('warehouse_id', access.warehouseIds)
    }

    const { data: txData, error: txError } = await txQuery
    if (txError) {
      return NextResponse.json({ error: txError.message }, { status: 400 })
    }

    const rawRows = (txData ?? []) as Record<string, unknown>[]
    const actorIds = [
      ...new Set(
        rawRows
          .map((r) => r.created_by as string | null | undefined)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ]

    const userNameById = new Map<string, string>()
    if (actorIds.length > 0) {
      const { data: users, error: usersError } = await adminClient
        .from('app_users')
        .select('id, user_name')
        .in('id', actorIds)
      if (!usersError && users) {
        for (const u of users as { id: string; user_name: string | null }[]) {
          userNameById.set(u.id, u.user_name ?? '시스템')
        }
      }
    }

    const transactions: TxOut[] = rawRows.map((tx) => {
      const items = tx.items
      const warehouses = tx.warehouses
      const createdBy = typeof tx.created_by === 'string' ? tx.created_by : null
      return {
        id: Number(tx.id),
        trans_date: String(tx.trans_date),
        trans_type: String(tx.trans_type),
        qty: Number(tx.qty),
        remarks: tx.remarks != null ? String(tx.remarks) : null,
        created_by: createdBy,
        lot_no: tx.lot_no != null ? String(tx.lot_no) : null,
        serial_no: tx.serial_no != null ? String(tx.serial_no) : null,
        exp_date: tx.exp_date != null ? String(tx.exp_date) : null,
        warehouse_id: tx.warehouse_id != null ? Number(tx.warehouse_id) : null,
        inventory_id: tx.inventory_id != null ? Number(tx.inventory_id) : null,
        items: Array.isArray(items) ? (items[0] as TxOut['items']) ?? null : (items as TxOut['items']) ?? null,
        warehouses: Array.isArray(warehouses)
          ? (warehouses[0] as TxOut['warehouses']) ?? null
          : (warehouses as TxOut['warehouses']) ?? null,
        processor_name: createdBy ? userNameById.get(createdBy) ?? '시스템' : '시스템',
      }
    })

    return NextResponse.json({
      transactions,
      warehouses: access.warehouses,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '입출고 조회 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
