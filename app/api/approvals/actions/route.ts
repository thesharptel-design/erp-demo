import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  isApprovalActionRole,
  isFinalApprovalRole,
  isPostCooperatorRole,
  isPreCooperatorRole,
  normalizeApprovalRole,
} from '@/lib/approval-roles'

type AdminClient = SupabaseClient<any, 'public', 'public'>

type ApprovalAction =
  | 'recall_before_first_action'
  | 'request_cancel_after_action'
  | 'confirm_pre_cooperation'
  | 'approve_document'
  | 'override_approve_document'
  | 'reject_document'
  | 'confirm_post_cooperation'

type RejectType = 'direct' | 'sequential' | 'targeted'

type ApprovalDocRow = {
  id: number
  doc_no: string | null
  title: string | null
  status: string
  remarks: string | null
  writer_id: string | null
  current_line_no: number | null
  doc_type: string | null
}

type ApprovalLineRow = {
  id: number
  approval_doc_id: number
  line_no: number
  approver_id: string
  approver_role: string
  status: string
  acted_at: string | null
  opinion: string | null
}

const ACTIVE_DOC_STATUSES = new Set(['submitted', 'in_review', 'in_progress'])
const EFFECTIVE_DOC_STATUSES = new Set(['approved', 'effective'])
const PROCESSED_LINE_STATUSES = new Set(['confirmed', 'approved', 'rejected', 'skipped', 'cancelled'])

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status })
}

function asTrimmed(value: unknown): string {
  return String(value ?? '').trim()
}

function lineActorId(line: ApprovalLineRow): string {
  return String(line.approver_id ?? '').toLowerCase()
}

function sameUser(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase()
}

function isActiveDoc(doc: ApprovalDocRow): boolean {
  return ACTIVE_DOC_STATUSES.has(String(doc.status ?? ''))
}

function isEffectiveDoc(doc: ApprovalDocRow): boolean {
  return EFFECTIVE_DOC_STATUSES.has(String(doc.status ?? ''))
}

async function getCurrentUser(request: NextRequest, adminClient: AdminClient) {
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

async function resolveActorId(adminClient: AdminClient, user: { id: string; email?: string | null }) {
  const authUserId = String(user.id ?? '').trim()
  const authEmail = String(user.email ?? '').trim().toLowerCase()

  const byId = authUserId
    ? await adminClient
        .from('app_users')
        .select('id, is_active')
        .eq('id', authUserId)
        .maybeSingle()
    : { data: null, error: null }

  if (!byId.error && byId.data?.id && byId.data.is_active !== false) {
    return String(byId.data.id)
  }

  if (authEmail) {
    const byEmail = await adminClient
      .from('app_users')
      .select('id, is_active')
      .eq('email', authEmail)
      .maybeSingle()

    if (!byEmail.error && byEmail.data?.id && byEmail.data.is_active !== false) {
      return String(byEmail.data.id)
    }
  }

  return authUserId || null
}

async function logHistory(
  adminClient: AdminClient,
  input: {
    docId: number
    actorId: string
    actionType: string
    comment?: string | null
    dedupeKey?: string | null
  }
) {
  const { error } = await adminClient.from('approval_histories').insert({
    approval_doc_id: input.docId,
    actor_id: input.actorId,
    action_type: input.actionType,
    action_comment: asTrimmed(input.comment) || '[-]',
    action_at: new Date().toISOString(),
    dedupe_key: input.dedupeKey ?? null,
  })
  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505' && input.dedupeKey) return
    throw error
  }
}

async function fanoutQuiet(
  adminClient: AdminClient,
  input: {
    actorId: string
    docId: number
    recipientMode: string
    type: string
    title: string
    lineNo?: number | null
  }
) {
  try {
    await adminClient.rpc('fanout_work_approval_notification', {
      p_actor_id: input.actorId,
      p_approval_doc_id: input.docId,
      p_recipient_mode: input.recipientMode,
      p_type: input.type,
      p_title: input.title,
      p_target_url: `/approvals/${input.docId}`,
      p_dedupe_key: null,
      p_payload: {
        approval_doc_id: input.docId,
        line_no: input.lineNo ?? null,
      },
    })
  } catch {
    // Notification delivery should not make an already-valid approval mutation look failed.
  }
}

async function updateDocStatus(
  adminClient: AdminClient,
  doc: ApprovalDocRow,
  patch: Record<string, unknown>
) {
  const { error } = await adminClient.from('approval_docs').update(patch).eq('id', doc.id)
  if (error) throw error

  if (doc.doc_type === 'outbound_request' && 'status' in patch) {
    const docStatus = String(patch.status ?? '')
    const outboundStatus =
      docStatus === 'draft'
        ? 'draft'
        : docStatus === 'rejected'
          ? 'rejected'
          : docStatus === 'effective' || docStatus === 'closed' || docStatus === 'approved'
            ? 'approved'
            : 'submitted'
    const { error: outboundError } = await adminClient
      .from('outbound_requests')
      .update({ status: outboundStatus })
      .eq('approval_doc_id', doc.id)
    if (outboundError) throw outboundError
  }
}

async function updateLine(
  adminClient: AdminClient,
  line: ApprovalLineRow,
  patch: Record<string, unknown>
) {
  const { error } = await adminClient.from('approval_lines').update(patch).eq('id', line.id)
  if (error) throw error
}

function getActionLines(lines: ApprovalLineRow[]) {
  return [...lines]
    .filter((line) => isApprovalActionRole(line.approver_role))
    .sort((a, b) => a.line_no - b.line_no)
}

function getPendingLine(lines: ApprovalLineRow[]) {
  return getActionLines(lines).find((line) => line.status === 'pending') ?? null
}

function getNextWaitingBeforePost(lines: ApprovalLineRow[], afterLineNo: number) {
  return getActionLines(lines).find((line) => {
    if (line.line_no <= afterLineNo) return false
    if (line.status !== 'waiting') return false
    return isPreCooperatorRole(line.approver_role) || isFinalApprovalRole(line.approver_role)
  }) ?? null
}

function getPostCooperatorLines(lines: ApprovalLineRow[]) {
  return [...lines]
    .filter((line) => isPostCooperatorRole(line.approver_role))
    .sort((a, b) => a.line_no - b.line_no)
}

async function markPostCooperatorsPending(adminClient: AdminClient, docId: number, lines: ApprovalLineRow[]) {
  const postLines = getPostCooperatorLines(lines).filter((line) => line.status === 'waiting')
  if (postLines.length === 0) return
  const { error } = await adminClient
    .from('approval_lines')
    .update({ status: 'pending' })
    .eq('approval_doc_id', docId)
    .in('id', postLines.map((line) => line.id))
  if (error) throw error
}

function findLastApproverLineForUser(lines: ApprovalLineRow[], userId: string) {
  const approvers = getActionLines(lines).filter((line) => isFinalApprovalRole(line.approver_role))
  const lastApprover = approvers[approvers.length - 1] ?? null
  if (!lastApprover || !sameUser(lastApprover.approver_id, userId)) return null
  return lastApprover
}

async function loadDocBundle(adminClient: AdminClient, docId: number) {
  const { data: doc, error: docError } = await adminClient
    .from('approval_docs')
    .select('id, doc_no, title, status, remarks, writer_id, current_line_no, doc_type')
    .eq('id', docId)
    .single()
  if (docError || !doc) throw new Error('문서를 찾을 수 없습니다.')

  const { data: lines, error: linesError } = await adminClient
    .from('approval_lines')
    .select('id, approval_doc_id, line_no, approver_id, approver_role, status, acted_at, opinion')
    .eq('approval_doc_id', docId)
    .order('line_no', { ascending: true })
  if (linesError) throw linesError

  return {
    doc: doc as ApprovalDocRow,
    lines: (lines ?? []) as ApprovalLineRow[],
  }
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError('서버 환경변수가 설정되지 않았습니다.', 500)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const user = await getCurrentUser(request, adminClient)
  if (!user) return jsonError('로그인이 필요합니다.', 401)

  const body = (await request.json().catch(() => ({}))) as {
    docId?: number
    action?: ApprovalAction
    opinion?: string | null
    rejectType?: RejectType | null
    targetLineNo?: number | null
  }
  const docId = Number(body.docId ?? 0)
  if (!Number.isInteger(docId) || docId <= 0) return jsonError('문서 ID가 올바르지 않습니다.')

  const action = body.action
  if (!action) return jsonError('처리할 액션이 없습니다.')

  try {
    const { doc, lines } = await loadDocBundle(adminClient, docId)
    const actorId = await resolveActorId(adminClient, user)
    if (!actorId) return jsonError('현재 사용자 권한을 확인할 수 없습니다.', 403)
    const actorIdLower = actorId.toLowerCase()
    const now = new Date().toISOString()
    const title = asTrimmed(doc.title) || asTrimmed(doc.doc_no) || '결재 문서'
    const pendingLine = getPendingLine(lines)
    const isWriter = sameUser(doc.writer_id, actorId)

    if (action === 'recall_before_first_action') {
      if (!isWriter) return jsonError('기안자만 기안회수를 할 수 있습니다.', 403)
      if (!isActiveDoc(doc)) return jsonError('진행중 문서만 회수할 수 있습니다.', 409)
      const hasProcessed = lines.some((line) => PROCESSED_LINE_STATUSES.has(line.status))
      if (hasProcessed) return jsonError('이미 협조/결재가 시작되어 회수할 수 없습니다. 취소요청을 사용하세요.', 409)

      await updateDocStatus(adminClient, doc, {
        status: 'draft',
        current_line_no: null,
        remarks: '기안 회수',
        completed_at: null,
      })
      const { error: lineError } = await adminClient
        .from('approval_lines')
        .update({ status: 'waiting', acted_at: null, opinion: null })
        .eq('approval_doc_id', doc.id)
      if (lineError) throw lineError
      await logHistory(adminClient, {
        docId: doc.id,
        actorId,
        actionType: 'recall_before_first_action',
        comment: '첫 처리 전 기안회수',
        dedupeKey: `doc:${doc.id}:recall_before_first_action:${actorId}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'request_cancel_after_action') {
      if (!isWriter) return jsonError('기안자만 취소요청을 보낼 수 있습니다.', 403)
      if (!isActiveDoc(doc)) return jsonError('진행중 문서에서만 취소요청을 보낼 수 있습니다.', 409)
      const reason = asTrimmed(body.opinion)
      if (reason.length < 2) return jsonError('취소요청 사유를 입력하세요.')
      const hasProcessed = lines.some((line) => line.status === 'confirmed' || line.status === 'approved')
      if (!hasProcessed) return jsonError('아직 아무도 처리하지 않았습니다. 기안회수를 사용하세요.', 409)
      await updateDocStatus(adminClient, doc, { remarks: '기안자 취소요청' })
      await logHistory(adminClient, {
        docId: doc.id,
        actorId,
        actionType: 'cancel_requested_by_writer',
        comment: reason,
        dedupeKey: `doc:${doc.id}:cancel_requested_by_writer:${actorId}:${reason}`,
      })
      await fanoutQuiet(adminClient, {
        actorId,
        docId: doc.id,
        recipientMode: 'doc_current_line',
        type: 'work_approval_cancel_requested',
        title: `기안자 취소요청: ${title}`,
        lineNo: doc.current_line_no,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'confirm_pre_cooperation') {
      if (!pendingLine) return jsonError('현재 처리할 결재라인이 없습니다.', 409)
      if (!sameUser(pendingLine.approver_id, actorId)) return jsonError('현재 본인 차례가 아닙니다.', 403)
      if (!isPreCooperatorRole(pendingLine.approver_role)) {
        return jsonError('사전협조자만 협조확인을 할 수 있습니다.', 403)
      }
      await updateLine(adminClient, pendingLine, {
        status: 'confirmed',
        acted_at: now,
        opinion: asTrimmed(body.opinion) || null,
      })
      const nextLine = getNextWaitingBeforePost(lines, pendingLine.line_no)
      if (nextLine) {
        await updateLine(adminClient, nextLine, { status: 'pending' })
        await updateDocStatus(adminClient, doc, {
          status: 'in_progress',
          current_line_no: nextLine.line_no,
        })
        await fanoutQuiet(adminClient, {
          actorId,
          docId: doc.id,
          recipientMode: 'pending_lines',
          type: 'work_approval_line_turn',
          title: `결재 대기: ${title}`,
          lineNo: nextLine.line_no,
        })
      }
      await logHistory(adminClient, {
        docId: doc.id,
        actorId,
        actionType: 'confirm_pre_cooperation',
        comment: body.opinion,
        dedupeKey: `doc:${doc.id}:confirm_pre:${pendingLine.id}:${actorId}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'approve_document') {
      if (!pendingLine) return jsonError('현재 처리할 결재라인이 없습니다.', 409)
      if (!sameUser(pendingLine.approver_id, actorId)) return jsonError('현재 본인 차례가 아닙니다.', 403)
      if (!isFinalApprovalRole(pendingLine.approver_role)) return jsonError('결재자만 승인할 수 있습니다.', 403)

      await updateLine(adminClient, pendingLine, {
        status: 'approved',
        acted_at: now,
        opinion: asTrimmed(body.opinion) || null,
      })
      const nextLine = getNextWaitingBeforePost(lines, pendingLine.line_no)
      if (nextLine) {
        await updateLine(adminClient, nextLine, { status: 'pending' })
        await updateDocStatus(adminClient, doc, {
          status: 'in_progress',
          current_line_no: nextLine.line_no,
        })
        await fanoutQuiet(adminClient, {
          actorId,
          docId: doc.id,
          recipientMode: 'pending_lines',
          type: 'work_approval_line_turn',
          title: `결재 대기: ${title}`,
          lineNo: nextLine.line_no,
        })
      } else {
        await markPostCooperatorsPending(adminClient, doc.id, lines)
        await updateDocStatus(adminClient, doc, {
          status: 'effective',
          current_line_no: getPostCooperatorLines(lines)[0]?.line_no ?? null,
          completed_at: now,
        })
        await fanoutQuiet(adminClient, {
          actorId,
          docId: doc.id,
          recipientMode: 'writer',
          type: 'work_approval_completed',
          title: `최종승인: ${title}`,
        })
        await fanoutQuiet(adminClient, {
          actorId,
          docId: doc.id,
          recipientMode: 'pending_lines',
          type: 'work_approval_post_confirm_requested',
          title: `사후확인 요청: ${title}`,
        })
      }
      await logHistory(adminClient, {
        docId: doc.id,
        actorId,
        actionType: 'approve',
        comment: body.opinion,
        dedupeKey: `doc:${doc.id}:approve:${pendingLine.id}:${actorId}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'override_approve_document') {
      if (!isActiveDoc(doc)) return jsonError('진행중 문서에서만 전결승인할 수 있습니다.', 409)
      const actorLine = findLastApproverLineForUser(lines, actorId)
      if (!actorLine) return jsonError('최종 결재자만 전결승인할 수 있습니다.', 403)

      const skipLines = getActionLines(lines).filter((line) => {
        if (line.id === actorLine.id) return false
        if (isPostCooperatorRole(line.approver_role)) return false
        return line.status === 'waiting' || line.status === 'pending'
      })
      if (skipLines.length > 0) {
        const { error: skipError } = await adminClient
          .from('approval_lines')
          .update({ status: 'skipped', acted_at: now, opinion: '전결생략' })
          .eq('approval_doc_id', doc.id)
          .in('id', skipLines.map((line) => line.id))
        if (skipError) throw skipError
      }
      await updateLine(adminClient, actorLine, {
        status: 'approved',
        acted_at: now,
        opinion: asTrimmed(body.opinion) || null,
      })
      for (const skipped of skipLines) {
        await logHistory(adminClient, {
          docId: doc.id,
          actorId,
          actionType: 'skip_by_override',
          comment: `전결로 ${skipped.line_no}차 생략`,
          dedupeKey: `doc:${doc.id}:skip_by_override:${skipped.id}:${actorId}`,
        })
      }
      await markPostCooperatorsPending(adminClient, doc.id, lines)
      await updateDocStatus(adminClient, doc, {
        status: 'effective',
        current_line_no: getPostCooperatorLines(lines)[0]?.line_no ?? null,
        completed_at: now,
      })
      await logHistory(adminClient, {
        docId: doc.id,
        actorId,
        actionType: 'override_approve',
        comment: body.opinion,
        dedupeKey: `doc:${doc.id}:override_approve:${actorLine.id}:${actorId}`,
      })
      await fanoutQuiet(adminClient, {
        actorId,
        docId: doc.id,
        recipientMode: 'actionable_all_except_actor',
        type: 'work_approval_override_approved',
        title: `전결승인: ${title}`,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'reject_document') {
      if (!isActiveDoc(doc)) return jsonError('진행중 문서에서만 반려할 수 있습니다.', 409)
      const rejectType = body.rejectType ?? 'direct'
      const actorLine =
        pendingLine && lineActorId(pendingLine) === actorIdLower && isFinalApprovalRole(pendingLine.approver_role)
          ? pendingLine
          : findLastApproverLineForUser(lines, actorId)
      if (!actorLine) return jsonError('결재자만 반려할 수 있습니다.', 403)
      const reason = asTrimmed(body.opinion)
      if (reason.length < 2) return jsonError('반려 사유를 입력하세요.')

      if (rejectType === 'direct') {
        await updateLine(adminClient, actorLine, { status: 'rejected', acted_at: now, opinion: reason })
        await updateDocStatus(adminClient, doc, {
          status: 'rejected',
          current_line_no: null,
          remarks: '직권반려',
          completed_at: now,
        })
      } else {
        const processedBefore = lines
          .filter((line) => line.line_no < actorLine.line_no && (line.status === 'confirmed' || line.status === 'approved'))
          .sort((a, b) => a.line_no - b.line_no)
        const targetLine =
          rejectType === 'targeted'
            ? processedBefore.find((line) => line.line_no === Number(body.targetLineNo ?? 0))
            : processedBefore[processedBefore.length - 1]
        if (!targetLine) return jsonError('되돌릴 이전 처리자를 찾을 수 없습니다.', 409)
        await updateLine(adminClient, targetLine, { status: 'pending', acted_at: null })
        const laterLineIds = lines
          .filter((line) => line.line_no > targetLine.line_no)
          .map((line) => line.id)
        if (laterLineIds.length > 0) {
          const { error: laterError } = await adminClient
            .from('approval_lines')
            .update({ status: 'waiting', acted_at: null, opinion: null })
            .eq('approval_doc_id', doc.id)
            .in('id', laterLineIds)
          if (laterError) throw laterError
        }
        await updateDocStatus(adminClient, doc, {
          status: 'in_progress',
          current_line_no: targetLine.line_no,
          remarks: rejectType === 'targeted' ? '선택반려' : '순차반려',
        })
      }

      const actionType =
        rejectType === 'targeted'
          ? 'reject_targeted'
          : rejectType === 'sequential'
            ? 'reject_sequential'
            : 'reject_direct'
      await logHistory(adminClient, {
        docId: doc.id,
        actorId,
        actionType,
        comment: reason,
        dedupeKey: `doc:${doc.id}:${actionType}:${actorLine.id}:${actorId}:${reason}`,
      })
      await fanoutQuiet(adminClient, {
        actorId,
        docId: doc.id,
        recipientMode: rejectType === 'direct' ? 'writer' : 'doc_current_line',
        type: 'work_approval_rejected',
        title: `반려: ${title}`,
        lineNo: doc.current_line_no,
      })
      return NextResponse.json({ success: true })
    }

    if (action === 'confirm_post_cooperation') {
      if (!isEffectiveDoc(doc)) return jsonError('최종승인 후 사후확인만 가능합니다.', 409)
      const myPostLine = getPostCooperatorLines(lines).find(
        (line) => sameUser(line.approver_id, actorId) && (line.status === 'pending' || line.status === 'waiting')
      )
      if (!myPostLine) return jsonError('확인할 사후협조 차례가 없습니다.', 403)
      await updateLine(adminClient, myPostLine, {
        status: 'confirmed',
        acted_at: now,
        opinion: asTrimmed(body.opinion) || null,
      })
      const postLines = getPostCooperatorLines(lines)
      const allPostDone = postLines.every((line) => line.id === myPostLine.id || line.status === 'confirmed')
      await updateDocStatus(adminClient, doc, {
        status: allPostDone ? 'closed' : 'effective',
        current_line_no: allPostDone ? null : doc.current_line_no,
      })
      await logHistory(adminClient, {
        docId: doc.id,
        actorId,
        actionType: allPostDone ? 'close' : 'confirm_post_cooperation',
        comment: body.opinion,
        dedupeKey: `doc:${doc.id}:post_confirm:${myPostLine.id}:${actorId}`,
      })
      return NextResponse.json({ success: true })
    }

    return jsonError('지원하지 않는 액션입니다.', 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.'
    return jsonError(message, 500)
  }
}
