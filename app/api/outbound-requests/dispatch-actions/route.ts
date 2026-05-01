import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasOutboundPermission, isSystemAdminUser, type CurrentUserPermissions } from '@/lib/permissions'
import { logApprovalHistory } from '@/lib/approval-history-log'
import { applyOutboundDispatchConcurrencyGuard } from '@/lib/outbound-dispatch-concurrency'
import {
  logOutboundDispatchAuditEvent,
  type OutboundDispatchAuditSnapshot,
} from '@/lib/outbound-dispatch-audit-log'

type DispatchActionType = 'assign' | 'reassign' | 'recall' | 'execute_self' | 'complete'

type DispatchActionBody = {
  outbound_request_id?: number
  action?: DispatchActionType
  handler_user_id?: string | null
  note?: string | null
  line_overrides?: Array<{
    req_item_id?: number
    selected_lot?: string | null
    selected_sn?: string | null
    selected_exp?: string | null
  }>
}

type DispatchState = 'queue' | 'assigned' | 'in_progress' | 'completed'

type OutboundRequestRow = {
  id: number
  requester_id: string
  warehouse_id: number
  status: string
  outbound_completed: boolean
  approval_doc_id: number | null
  remarks: string | null
  dispatch_state: DispatchState | null
  dispatch_handler_user_id: string | null
  dispatch_handler_name: string | null
  receipt_confirmed_at: string | null
  receipt_confirmed_by: string | null
  updated_at: string | null
}

type ApprovalDocRow = {
  id: number
  status: string
}

type OutboundItemRow = {
  id: number
  item_id: number
  qty: number
  remarks: string | null
  items?: {
    is_lot_managed?: boolean | null
    is_sn_managed?: boolean | null
    is_exp_managed?: boolean | null
  } | null
}

function parseOutboundItemMeta(remarks: string | null | undefined): {
  selected_lot: string | null
  selected_sn: string | null
  selected_exp: string | null
} {
  if (!remarks) return { selected_lot: null, selected_sn: null, selected_exp: null }
  try {
    const parsed = JSON.parse(remarks) as {
      selected_lot?: unknown
      selected_sn?: unknown
      selected_exp?: unknown
    }
    return {
      selected_lot: typeof parsed.selected_lot === 'string' ? parsed.selected_lot : null,
      selected_sn: typeof parsed.selected_sn === 'string' ? parsed.selected_sn : null,
      selected_exp: typeof parsed.selected_exp === 'string' ? parsed.selected_exp : null,
    }
  } catch {
    return { selected_lot: null, selected_sn: null, selected_exp: null }
  }
}

type AppUserPermissionRow = Pick<
  CurrentUserPermissions,
  | 'id'
  | 'user_name'
  | 'user_kind'
  | 'role_name'
  | 'can_manage_permissions'
  | 'can_admin_manage'
  | 'outbound_role'
  | 'can_outbound_view'
  | 'can_outbound_execute_self'
  | 'can_outbound_assign_handler'
  | 'can_outbound_reassign_recall'
  | 'can_outbound_execute_any'
> & {
  is_active?: boolean | null
}

function asTrimmed(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

function toHistoryAction(action: DispatchActionType): string {
  switch (action) {
    case 'assign':
      return 'outbound_assign_handler'
    case 'reassign':
      return 'outbound_reassign_handler'
    case 'recall':
      return 'outbound_recall_handler'
    case 'execute_self':
      return 'outbound_execute_self'
    case 'complete':
      return 'outbound_complete'
    default:
      return 'outbound_assign_handler'
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
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
    const authedClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
    })

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(jwt)
    if (userError || !user?.id) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const { data: appUser, error: appUserError } = await adminClient
      .from('app_users')
      .select(`
        id, user_name, user_kind, role_name, is_active,
        can_manage_permissions, can_admin_manage,
        outbound_role,
        can_outbound_view, can_outbound_execute_self, can_outbound_assign_handler,
        can_outbound_reassign_recall, can_outbound_execute_any
      `)
      .eq('id', user.id)
      .single()
    if (appUserError || !appUser || appUser.is_active === false) {
      return NextResponse.json({ error: '현재 사용자 권한을 확인할 수 없습니다.' }, { status: 403 })
    }

    const body = (await request.json()) as DispatchActionBody
    const requestId = Number(body.outbound_request_id ?? 0)
    const action = String(body.action ?? '') as DispatchActionType
    const note = asTrimmed(body.note)

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return NextResponse.json({ error: '출고요청 ID가 올바르지 않습니다.' }, { status: 400 })
    }
    if (!['assign', 'reassign', 'recall', 'execute_self', 'complete'].includes(action)) {
      return NextResponse.json({ error: '알 수 없는 출고 액션입니다.' }, { status: 400 })
    }

    const currentUser = appUser as AppUserPermissionRow
    const canAssignHandler = hasOutboundPermission(currentUser, 'can_outbound_assign_handler')
    const canReassignRecall = hasOutboundPermission(currentUser, 'can_outbound_reassign_recall')
    const canExecuteSelf = hasOutboundPermission(currentUser, 'can_outbound_execute_self')
    const canExecuteAny = hasOutboundPermission(currentUser, 'can_outbound_execute_any')
    const canTeacherRecall =
      String(currentUser.user_kind ?? '').toLowerCase() === 'teacher' ||
      isSystemAdminUser(currentUser) ||
      String(currentUser.role_name ?? '').toLowerCase() === 'admin'

    if (action === 'assign' && !(canAssignHandler || canExecuteAny)) {
      return NextResponse.json({ error: '담당자 지정 권한이 없습니다.' }, { status: 403 })
    }
    if (action === 'reassign' && !(canReassignRecall || canExecuteAny)) {
      return NextResponse.json({ error: '담당자 변경 권한이 없습니다.' }, { status: 403 })
    }
    if (action === 'recall' && !(canReassignRecall || canTeacherRecall || canExecuteAny)) {
      return NextResponse.json({ error: '담당자 회수 권한이 없습니다.' }, { status: 403 })
    }
    if (action === 'execute_self' && !(canExecuteSelf || canExecuteAny)) {
      return NextResponse.json({ error: '직접 처리 권한이 없습니다.' }, { status: 403 })
    }

    const { data: requestRow, error: requestError } = await adminClient
      .from('outbound_requests')
      .select(`
        id, requester_id, warehouse_id, status, outbound_completed, approval_doc_id, remarks, updated_at,
        dispatch_state, dispatch_handler_user_id, dispatch_handler_name,
        receipt_confirmed_at, receipt_confirmed_by
      `)
      .eq('id', requestId)
      .single()
    if (requestError || !requestRow) {
      return NextResponse.json({ error: '출고요청을 찾을 수 없습니다.' }, { status: 404 })
    }

    const outboundRequest = requestRow as OutboundRequestRow
    if (!outboundRequest.approval_doc_id) {
      return NextResponse.json({ error: '결재문서가 연결되지 않은 요청입니다.' }, { status: 400 })
    }

    const { data: docRow, error: docError } = await adminClient
      .from('approval_docs')
      .select('id, status')
      .eq('id', outboundRequest.approval_doc_id)
      .single()
    if (docError || !docRow) {
      return NextResponse.json({ error: '연결된 결재문서를 확인할 수 없습니다.' }, { status: 400 })
    }
    const approvalDoc = docRow as ApprovalDocRow
    if (approvalDoc.status !== 'approved') {
      return NextResponse.json({ error: '결재 완료된 요청만 출고 통제할 수 있습니다.' }, { status: 409 })
    }

    const now = new Date().toISOString()
    const beforeSnapshot: OutboundDispatchAuditSnapshot = {
      status: outboundRequest.status,
      outbound_completed: outboundRequest.outbound_completed,
      dispatch_state: outboundRequest.dispatch_state ?? 'queue',
      dispatch_handler_user_id: outboundRequest.dispatch_handler_user_id,
      dispatch_handler_name: outboundRequest.dispatch_handler_name,
      remarks: outboundRequest.remarks,
    }

    let nextStatus = outboundRequest.status
    let nextCompletedFlag = outboundRequest.outbound_completed
    let nextHandlerId: string | null = outboundRequest.dispatch_handler_user_id
    let nextHandlerName: string | null = outboundRequest.dispatch_handler_name
    let nextState: DispatchState = outboundRequest.dispatch_state ?? 'queue'
    let nextAssignedAt: string | null = null
    let nextStartedAt: string | null = null
    let nextCompletedAt: string | null = null
    let nextReceiptConfirmedAt: string | null = outboundRequest.receipt_confirmed_at
    let nextReceiptConfirmedBy: string | null = outboundRequest.receipt_confirmed_by
    let historyComment = note ?? ''
    let fulfilledByRpc = false

    if (action === 'assign' || action === 'reassign') {
      const targetHandlerId = asTrimmed(body.handler_user_id)
      if (!targetHandlerId) {
        return NextResponse.json({ error: '담당자 사용자 ID가 필요합니다.' }, { status: 400 })
      }
      if (action === 'assign' && outboundRequest.dispatch_handler_user_id) {
        return NextResponse.json({ error: '이미 담당자가 지정되어 있습니다. 변경을 사용하세요.' }, { status: 409 })
      }
      if (action === 'reassign' && !outboundRequest.dispatch_handler_user_id) {
        return NextResponse.json({ error: '변경할 기존 담당자가 없습니다. 지정을 먼저 수행하세요.' }, { status: 409 })
      }

      const { data: targetUser, error: targetUserError } = await adminClient
        .from('app_users')
        .select('id, user_name, is_active')
        .eq('id', targetHandlerId)
        .single()
      if (targetUserError || !targetUser || targetUser.is_active === false) {
        return NextResponse.json({ error: '지정할 담당자 정보를 확인할 수 없습니다.' }, { status: 400 })
      }

      nextStatus = 'approved'
      nextCompletedFlag = false
      nextHandlerId = targetUser.id as string
      nextHandlerName = (targetUser.user_name as string | null) ?? null
      nextState = 'assigned'
      nextAssignedAt = now
      nextStartedAt = null
      nextCompletedAt = null
      nextReceiptConfirmedAt = null
      nextReceiptConfirmedBy = null
      historyComment =
        action === 'assign'
          ? `담당자 지정: ${nextHandlerName ?? nextHandlerId}${note ? ` / ${note}` : ''}`
          : `담당자 변경: ${nextHandlerName ?? nextHandlerId}${note ? ` / ${note}` : ''}`
    } else if (action === 'recall') {
      if (!outboundRequest.dispatch_handler_user_id) {
        return NextResponse.json({ error: '회수할 담당자가 없습니다.' }, { status: 409 })
      }
      nextStatus = 'approved'
      nextCompletedFlag = false
      nextHandlerId = null
      nextHandlerName = null
      nextState = 'queue'
      nextAssignedAt = null
      nextStartedAt = null
      nextCompletedAt = null
      nextReceiptConfirmedAt = null
      nextReceiptConfirmedBy = null
      historyComment = `담당자 회수${note ? ` / ${note}` : ''}`
    } else if (action === 'execute_self') {
      nextStatus = 'approved'
      nextCompletedFlag = false
      nextHandlerId = currentUser.id
      nextHandlerName = currentUser.user_name ?? null
      nextState = 'in_progress'
      nextAssignedAt = now
      nextStartedAt = now
      nextCompletedAt = null
      nextReceiptConfirmedAt = null
      nextReceiptConfirmedBy = null
      historyComment = `직접 처리 시작: ${nextHandlerName ?? currentUser.id}${note ? ` / ${note}` : ''}`
    } else if (action === 'complete') {
      const handlerId = outboundRequest.dispatch_handler_user_id
      const isAssignedHandler = handlerId != null && String(handlerId) === String(currentUser.id)
      if (!(isAssignedHandler || canExecuteAny)) {
        return NextResponse.json({ error: '완료 처리 권한이 없습니다. 담당자 또는 관리자만 가능합니다.' }, { status: 403 })
      }
      if (outboundRequest.status === 'completed' || outboundRequest.outbound_completed) {
        return NextResponse.json({ error: '이미 완료된 요청입니다.' }, { status: 409 })
      }
      if (outboundRequest.dispatch_state !== 'in_progress') {
        return NextResponse.json({ error: '출고시작 이후 인수확인중 상태에서만 완료할 수 있습니다.' }, { status: 409 })
      }
      if (!outboundRequest.receipt_confirmed_at || !outboundRequest.receipt_confirmed_by) {
        return NextResponse.json(
          { error: '인수확인이 필요합니다. 출고결재문서함에서 수령확인을 먼저 진행해 주세요.' },
          { status: 409 }
        )
      }
      const { data: itemRows, error: itemErr } = await adminClient
        .from('outbound_request_items')
        .select('id, item_id, qty, remarks, items(is_lot_managed, is_sn_managed, is_exp_managed)')
        .eq('outbound_request_id', outboundRequest.id)
      if (itemErr) {
        return NextResponse.json({ error: itemErr.message }, { status: 500 })
      }
      const normalizedItems = (itemRows ?? []) as OutboundItemRow[]
      const overrideMap = new Map<number, { selected_lot: string | null; selected_sn: string | null; selected_exp: string | null }>()
      for (const row of body.line_overrides ?? []) {
        const reqItemId = Number(row.req_item_id ?? 0)
        if (!Number.isInteger(reqItemId) || reqItemId <= 0) continue
        overrideMap.set(reqItemId, {
          selected_lot: asTrimmed(row.selected_lot),
          selected_sn: asTrimmed(row.selected_sn),
          selected_exp: asTrimmed(row.selected_exp),
        })
      }
      if (normalizedItems.length === 0) {
        return NextResponse.json({ error: '출고 품목이 없어 완료 처리할 수 없습니다.' }, { status: 409 })
      }
      const lines: Array<{ inventory_id: number; item_id: number; qty: number }> = []
      for (const row of normalizedItems) {
        const itemId = Number(row.item_id)
        const qty = Number(row.qty)
        if (!Number.isFinite(itemId) || itemId <= 0 || !Number.isFinite(qty) || qty <= 0) continue
        const baseMeta = parseOutboundItemMeta(row.remarks)
        const override = overrideMap.get(Number(row.id))
        const meta = {
          selected_lot: override?.selected_lot ?? baseMeta.selected_lot,
          selected_sn: override?.selected_sn ?? baseMeta.selected_sn,
          selected_exp: override?.selected_exp ?? baseMeta.selected_exp,
        }
        const itemOptions = row.items ?? null
        if (itemOptions?.is_lot_managed && !meta.selected_lot) {
          return NextResponse.json({ error: `LOT 관리 품목 선택이 필요합니다. item_id=${itemId}` }, { status: 409 })
        }
        if (itemOptions?.is_sn_managed && !meta.selected_sn) {
          return NextResponse.json({ error: `SN 관리 품목 선택이 필요합니다. item_id=${itemId}` }, { status: 409 })
        }
        if (itemOptions?.is_exp_managed && !meta.selected_exp) {
          return NextResponse.json({ error: `EXP 관리 품목 선택이 필요합니다. item_id=${itemId}` }, { status: 409 })
        }
        let invQuery = adminClient
          .from('inventory')
          .select('id, current_qty')
          .eq('warehouse_id', outboundRequest.warehouse_id)
          .eq('item_id', itemId)
          .limit(1)
        if (meta.selected_lot) invQuery = invQuery.eq('lot_no', meta.selected_lot)
        if (meta.selected_sn) invQuery = invQuery.eq('serial_no', meta.selected_sn)
        if (meta.selected_exp) invQuery = invQuery.eq('exp_date', meta.selected_exp)
        const { data: invRows, error: invErr } = await invQuery
        if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
        const inv = Array.isArray(invRows) ? invRows[0] : null
        if (!inv?.id) {
          return NextResponse.json(
            { error: `재고 매핑 실패: item_id=${itemId} (${meta.selected_lot ?? '-'} / ${meta.selected_sn ?? '-'})` },
            { status: 409 }
          )
        }
        if (Number(inv.current_qty ?? 0) < qty) {
          return NextResponse.json({ error: `재고 부족: item_id=${itemId}` }, { status: 409 })
        }
        lines.push({ inventory_id: Number(inv.id), item_id: itemId, qty })
      }
      const { error: rpcError } = await authedClient.rpc('execute_outbound_request_fulfillment', {
        p_outbound_request_id: outboundRequest.id,
        p_lines: lines,
      })
      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 409 })
      }
      fulfilledByRpc = true
      nextStatus = 'completed'
      nextCompletedFlag = true
      nextState = 'completed'
      if (!nextHandlerId) {
        nextHandlerId = currentUser.id
        nextHandlerName = currentUser.user_name ?? null
      }
      nextAssignedAt = now
      nextStartedAt = now
      nextCompletedAt = now
      historyComment = `출고 완료${note ? ` / ${note}` : ''}`
    }

    const outboundUpdate = fulfilledByRpc
      ? await adminClient
          .from('outbound_requests')
          .update({
            remarks: note ?? outboundRequest.remarks,
            dispatch_state: nextState,
            dispatch_handler_user_id: nextHandlerId,
            dispatch_handler_name: nextHandlerName,
            dispatch_last_actor_id: currentUser.id,
            dispatch_last_action_at: now,
            dispatch_assigned_at: nextAssignedAt,
            dispatch_started_at: nextStartedAt,
            dispatch_completed_at: nextCompletedAt,
            receipt_confirmed_at: nextReceiptConfirmedAt,
            receipt_confirmed_by: nextReceiptConfirmedBy,
            updated_at: now,
          })
          .eq('id', outboundRequest.id)
          .select('id')
          .maybeSingle()
      : await applyOutboundDispatchConcurrencyGuard(
            adminClient.from('outbound_requests').update({
              status: nextStatus,
              outbound_completed: nextCompletedFlag,
              remarks: note ?? outboundRequest.remarks,
              dispatch_state: nextState,
              dispatch_handler_user_id: nextHandlerId,
              dispatch_handler_name: nextHandlerName,
              dispatch_last_actor_id: currentUser.id,
              dispatch_last_action_at: now,
              dispatch_assigned_at: nextAssignedAt,
              dispatch_started_at: nextStartedAt,
              dispatch_completed_at: nextCompletedAt,
              receipt_confirmed_at: nextReceiptConfirmedAt,
              receipt_confirmed_by: nextReceiptConfirmedBy,
              updated_at: now,
            }),
            outboundRequest
          )
            .select('id')
            .maybeSingle()

    if (outboundUpdate.error) {
      return NextResponse.json({ error: outboundUpdate.error.message }, { status: 500 })
    }
    if (!outboundUpdate.data?.id) {
      return NextResponse.json(
        { error: '다른 사용자가 먼저 처리했습니다. 최신 상태를 다시 확인해 주세요.' },
        { status: 409 }
      )
    }

    await logApprovalHistory(adminClient, {
      approval_doc_id: outboundRequest.approval_doc_id,
      actor_id: currentUser.id,
      action_type: toHistoryAction(action),
      action_comment: historyComment,
      action_at: now,
      dedupe_key: `dispatch:${outboundRequest.approval_doc_id}:${action}:${currentUser.id}:${now}`,
    })

    const afterSnapshot: OutboundDispatchAuditSnapshot = {
      status: nextStatus,
      outbound_completed: nextCompletedFlag,
      dispatch_state: nextState,
      dispatch_handler_user_id: nextHandlerId,
      dispatch_handler_name: nextHandlerName,
      remarks: note ?? outboundRequest.remarks,
    }

    await logOutboundDispatchAuditEvent(adminClient, {
      outbound_request_id: outboundRequest.id,
      approval_doc_id: outboundRequest.approval_doc_id,
      action_type: action,
      actor_id: currentUser.id,
      actor_name: currentUser.user_name ?? null,
      reason: note,
      occurred_at: now,
      before_state: beforeSnapshot,
      after_state: afterSnapshot,
      dedupe_key: `dispatch-audit:${outboundRequest.id}:${action}:${currentUser.id}:${now}`,
    })

    return NextResponse.json({
      success: true,
      outbound_request_id: outboundRequest.id,
      status: nextStatus,
      outbound_completed: nextCompletedFlag,
      dispatch_state: nextState,
      handler_user_id: nextHandlerId,
      handler_name: nextHandlerName,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '출고 통제 처리 중 서버 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
