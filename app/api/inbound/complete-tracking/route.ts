import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasManagePermission } from '@/lib/permissions'

type RequestBody = {
  inventory_id?: number
  transaction_id?: number | null
  complete_qty?: number
  lot_no?: string | null
  exp_date?: string | null
  serial_no?: string | null
  reason?: string
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function normalizeDate(value: unknown): string | null {
  const text = normalizeText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  throw new Error('EXP 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 또는 YYYYMMDD)')
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as RequestBody
    const inventoryId = Number(body.inventory_id ?? 0)
    const txId = Number(body.transaction_id ?? 0)
    const completeQty = Number(body.complete_qty ?? 1)
    const reason = normalizeText(body.reason)
    const lotNo = normalizeText(body.lot_no)
    const expDate = normalizeDate(body.exp_date)
    const serialNo = normalizeText(body.serial_no)

    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      return NextResponse.json({ error: '보완 대상 재고를 확인해주세요.' }, { status: 400 })
    }
    if (!reason) {
      return NextResponse.json({ error: '보완 사유를 입력해주세요.' }, { status: 400 })
    }
    if (!Number.isFinite(completeQty) || completeQty <= 0) {
      return NextResponse.json({ error: '보완 수량은 0보다 커야 합니다.' }, { status: 400 })
    }

    const { data, error } = await adminClient.rpc('execute_inbound_tracking_completion', {
      p_inventory_id: inventoryId,
      p_inventory_transaction_id: Number.isInteger(txId) && txId > 0 ? txId : null,
      p_complete_qty: completeQty,
      p_actor_id: appUser.id,
      p_reason: reason,
      p_lot_no: lotNo,
      p_exp_date: expDate,
      p_serial_no: serialNo,
    })
    if (error) {
      const message = String(error.message ?? '입고 보완 처리 중 오류가 발생했습니다.')
      const status = message.includes('권한') ? 403 : message.includes('중복') ? 409 : 400
      return NextResponse.json({ error: message }, { status })
    }

    return NextResponse.json({ success: true, result: data })
  } catch (error: any) {
    const message = String(error?.message ?? '입고 보완 처리 중 서버 오류가 발생했습니다.')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
