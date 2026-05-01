import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasOutboundPermission, type CurrentUserPermissions } from '@/lib/permissions'

type AdminClient = SupabaseClient<any, 'public', 'public'>

type ReceiptItemRow = {
  id: number
  line_no: number | null
  qty: number
  remarks?: string | null
  items: {
    item_code: string | null
    item_name: string | null
  } | { item_code: string | null; item_name: string | null }[] | null
}

type ReceiptItemView = {
  id: number
  line_no: number | null
  qty: number
  item_code: string | null
  item_name: string | null
  lot: string | null
  sn: string | null
  exp: string | null
}

function asTrimmed(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

function parseOutboundLineMeta(remarks: string | null | undefined): {
  lot: string | null
  sn: string | null
  exp: string | null
} {
  if (!remarks) return { lot: null, sn: null, exp: null }
  try {
    const parsed = JSON.parse(remarks) as {
      selected_lot?: unknown
      selected_sn?: unknown
      selected_exp?: unknown
    }
    return {
      lot: typeof parsed.selected_lot === 'string' ? parsed.selected_lot : null,
      sn: typeof parsed.selected_sn === 'string' ? parsed.selected_sn : null,
      exp: typeof parsed.selected_exp === 'string' ? parsed.selected_exp : null,
    }
  } catch {
    return { lot: null, sn: null, exp: null }
  }
}

async function getCurrentUser(
  request: NextRequest,
  adminClient: AdminClient
) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(jwt)
  if (error || !user?.id) return null
  return user
}

async function getCurrentProfile(adminClient: AdminClient, userId: string) {
  const { data } = await adminClient
    .from('app_users')
    .select(`
      id, role_name, can_manage_permissions, can_admin_manage,
      outbound_role, can_outbound_view
    `)
    .eq('id', userId)
    .single()
  return data as Partial<CurrentUserPermissions> | null
}

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: '서버 환경변수가 설정되지 않았습니다.' }, { status: 500 })
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const user = await getCurrentUser(request, adminClient)
  if (!user) return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })

  const reqId = Number(request.nextUrl.searchParams.get('outbound_request_id') ?? 0)
  if (!Number.isInteger(reqId) || reqId <= 0) {
    return NextResponse.json({ error: '출고요청 ID가 올바르지 않습니다.' }, { status: 400 })
  }

  const profile = await getCurrentProfile(adminClient, user.id)
  const canView = hasOutboundPermission(profile as Partial<CurrentUserPermissions>, 'can_outbound_view')
  if (!canView) return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 })

  const { data: requestRow, error: reqErr } = await adminClient
    .from('outbound_requests')
    .select('id, req_no, requester_id, dispatch_state, dispatch_handler_name, receipt_confirmed_at, receipt_confirmed_by, created_at, purpose, remarks')
    .eq('id', reqId)
    .single()
  if (reqErr || !requestRow) return NextResponse.json({ error: '출고요청을 찾을 수 없습니다.' }, { status: 404 })

  const { data: itemRows } = await adminClient
    .from('outbound_request_items')
    .select('id, line_no, qty, remarks, items(item_code, item_name)')
    .eq('outbound_request_id', reqId)
    .order('line_no')

  const requesterId = String((requestRow as { requester_id?: string }).requester_id ?? '').trim()
  const confirmedById = String((requestRow as { receipt_confirmed_by?: string | null }).receipt_confirmed_by ?? '').trim()
  const lookupIds = [requesterId, confirmedById].filter(Boolean)
  let nameMap = new Map<string, string>()
  if (lookupIds.length > 0) {
    const { data: userRows } = await adminClient
      .from('app_users')
      .select('id, user_name')
      .in('id', lookupIds)
    nameMap = new Map((userRows ?? []).map((u) => [String(u.id), String(u.user_name ?? '')]))
  }

  const viewItems: ReceiptItemView[] = ((itemRows ?? []) as unknown as ReceiptItemRow[]).map((row) => {
    const meta = parseOutboundLineMeta(row.remarks)
    const item = Array.isArray(row.items) ? row.items[0] : row.items
    return {
      id: row.id,
      line_no: row.line_no,
      qty: row.qty,
      item_code: item?.item_code ?? null,
      item_name: item?.item_name ?? null,
      lot: meta.lot,
      sn: meta.sn,
      exp: meta.exp,
    }
  })

  return NextResponse.json({
    request: {
      ...requestRow,
      requester_name: nameMap.get(requesterId) ?? null,
      receipt_confirmed_by_name: confirmedById ? (nameMap.get(confirmedById) ?? null) : null,
    },
    items: viewItems,
    can_confirm: String((requestRow as { requester_id?: string }).requester_id ?? '') === user.id,
  })
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: '서버 환경변수가 설정되지 않았습니다.' }, { status: 500 })
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const user = await getCurrentUser(request, adminClient)
  if (!user) return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as { outbound_request_id?: number }
  const reqId = Number(body.outbound_request_id ?? 0)
  if (!Number.isInteger(reqId) || reqId <= 0) {
    return NextResponse.json({ error: '출고요청 ID가 올바르지 않습니다.' }, { status: 400 })
  }

  const { data: requestRow, error: reqErr } = await adminClient
    .from('outbound_requests')
    .select('id, requester_id, dispatch_state, receipt_confirmed_at, receipt_confirmed_by')
    .eq('id', reqId)
    .single()
  if (reqErr || !requestRow) return NextResponse.json({ error: '출고요청을 찾을 수 없습니다.' }, { status: 404 })

  const requesterId = asTrimmed((requestRow as { requester_id?: unknown }).requester_id)
  if (requesterId !== user.id) {
    return NextResponse.json({ error: '수령확인은 출고요청자만 승인할 수 있습니다.' }, { status: 403 })
  }
  if ((requestRow as { dispatch_state?: string | null }).dispatch_state !== 'in_progress') {
    return NextResponse.json({ error: '인수확인중 상태에서만 수령확인이 가능합니다.' }, { status: 409 })
  }
  if ((requestRow as { receipt_confirmed_at?: string | null }).receipt_confirmed_at) {
    return NextResponse.json({ success: true, already_confirmed: true })
  }

  const now = new Date().toISOString()
  const { error: updateErr } = await adminClient
    .from('outbound_requests')
    .update({
      receipt_confirmed_at: now,
      receipt_confirmed_by: user.id,
      updated_at: now,
    })
    .eq('id', reqId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { data: confirmer } = await adminClient
    .from('app_users')
    .select('user_name')
    .eq('id', user.id)
    .maybeSingle()

  return NextResponse.json({
    success: true,
    confirmed_at: now,
    confirmed_by: user.id,
    confirmed_by_name: confirmer?.user_name ?? null,
  })
}
