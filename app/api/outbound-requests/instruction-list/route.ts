import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasOutboundPermission, type CurrentUserPermissions } from '@/lib/permissions'
import { formatInboxApproverLineDisplay, type ApprovalLineWithName } from '@/lib/approval-status'

type OutboundListRow = {
  id: number
  req_no: string | null
  requester_id: string
  purpose: string | null
  status: string
  dispatch_state: 'queue' | 'assigned' | 'in_progress' | 'completed' | null
  dispatch_handler_user_id: string | null
  dispatch_handler_name: string | null
  warehouse_id: number
  created_at: string
  approval_doc_id: number | null
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

    const { data: profile, error: profileError } = await adminClient
      .from('app_users')
      .select(`
        id, role_name, can_manage_permissions, can_admin_manage,
        outbound_role, can_outbound_view, can_outbound_execute_self,
        can_outbound_assign_handler, can_outbound_reassign_recall, can_outbound_execute_any
      `)
      .eq('id', user.id)
      .single()
    if (profileError || !profile) {
      return NextResponse.json({ error: '출고 권한을 확인할 수 없습니다.' }, { status: 403 })
    }
    if (!hasOutboundPermission(profile as Partial<CurrentUserPermissions>, 'can_outbound_view')) {
      return NextResponse.json({ error: '출고요청 조회 권한이 없습니다.' }, { status: 403 })
    }

    const { data: rows, error: rowsError } = await adminClient
      .from('outbound_requests')
      .select(
        'id, req_no, requester_id, purpose, status, dispatch_state, dispatch_handler_user_id, dispatch_handler_name, warehouse_id, created_at, approval_doc_id'
      )
      .order('created_at', { ascending: false })
    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 })
    }

    const baseRows = (rows ?? []) as OutboundListRow[]
    if (baseRows.length === 0) return NextResponse.json({ rows: [] })

    const requesterIds = [...new Set(baseRows.map((r) => r.requester_id).filter(Boolean))]
    const warehouseIds = [...new Set(baseRows.map((r) => r.warehouse_id).filter((n) => Number.isFinite(n)))]
    const docIds = [...new Set(baseRows.map((r) => r.approval_doc_id).filter((n): n is number => Number.isFinite(Number(n))))]

    const [{ data: users }, { data: warehouses }, { data: docs }, { data: lines }] = await Promise.all([
      requesterIds.length > 0
        ? adminClient.from('app_users').select('id, user_name').in('id', requesterIds)
        : Promise.resolve({ data: [] as Array<{ id: string; user_name: string | null }> }),
      warehouseIds.length > 0
        ? adminClient.from('warehouses').select('id, name').in('id', warehouseIds)
        : Promise.resolve({ data: [] as Array<{ id: number; name: string | null }> }),
      docIds.length > 0
        ? adminClient.from('approval_docs').select('id, status, drafted_at, title').in('id', docIds)
        : Promise.resolve({ data: [] as Array<{ id: number; status: string | null; drafted_at: string | null }> }),
      docIds.length > 0
        ? adminClient
            .from('approval_lines')
            .select('approval_doc_id, line_no, status, approver_role, approver_id')
            .in('approval_doc_id', docIds)
        : Promise.resolve({
            data: [] as Array<{
              approval_doc_id: number
              line_no: number
              status: string
              approver_role: string
              approver_id: string
            }>,
          }),
    ])

    const approverIds = [...new Set((lines ?? []).map((l) => String(l.approver_id ?? '')).filter(Boolean))]
    const { data: approverUsers } =
      approverIds.length > 0
        ? await adminClient.from('app_users').select('id, user_name').in('id', approverIds)
        : { data: [] as Array<{ id: string; user_name: string | null }> }

    const userNameById = new Map((users ?? []).map((u) => [String(u.id), String(u.user_name ?? '').trim()]))
    const warehouseNameById = new Map((warehouses ?? []).map((w) => [Number(w.id), String(w.name ?? '').trim()]))
    const docById = new Map((docs ?? []).map((d) => [Number(d.id), d]))
    const approverNameById = new Map((approverUsers ?? []).map((u) => [String(u.id), String(u.user_name ?? '').trim()]))
    const linesByDocId = new Map<number, ApprovalLineWithName[]>()
    for (const l of lines ?? []) {
      const docId = Number(l.approval_doc_id)
      const list = linesByDocId.get(docId) ?? []
      list.push({
        line_no: Number(l.line_no ?? 0),
        status: String(l.status ?? ''),
        approver_role: String(l.approver_role ?? ''),
        user_name: approverNameById.get(String(l.approver_id ?? '')) ?? '',
      })
      linesByDocId.set(docId, list)
    }

    const filtered = baseRows
      .map((row) => {
        const doc = row.approval_doc_id != null ? docById.get(Number(row.approval_doc_id)) : null
        const docStatus = String(doc?.status ?? '').toLowerCase()
        const requestDone = row.status === 'completed' || row.dispatch_state === 'completed'
        const requestApproved = row.status === 'approved'
        const docApproved = docStatus === 'approved'
        const include = docApproved || requestApproved || requestDone
        if (!include) return null
        const writerName = userNameById.get(String(row.requester_id)) || null
        const approverLineDisplay = formatInboxApproverLineDisplay(
          writerName,
          linesByDocId.get(Number(row.approval_doc_id ?? 0)) ?? []
        )
        return {
          ...row,
          approval_doc_title: String((doc as { title?: string | null } | null)?.title ?? '').trim() || null,
          app_users: { user_name: writerName },
          warehouses: { name: warehouseNameById.get(Number(row.warehouse_id)) || null },
          approval_doc: doc
            ? {
                id: Number(doc.id),
                status: doc.status,
                drafted_at: doc.drafted_at,
                approval_lines: [],
              }
            : null,
          approver_line_display: approverLineDisplay,
          drafted_date_display: String(doc?.drafted_at ?? row.created_at).slice(0, 10),
        }
      })
      .filter(Boolean)

    return NextResponse.json({ rows: filtered })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '출고요청 목록 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

