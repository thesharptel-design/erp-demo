import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import ApprovalActionButtons from '@/components/ApprovalActionButtons'
import ApprovalDocumentPaperView from '@/components/approvals/ApprovalDocumentPaperView'
import ApprovalDetailAttachmentsPanel from '@/components/approvals/ApprovalDetailAttachmentsPanel'
import ApprovalLineOpinionsBlock from '@/components/approvals/ApprovalLineOpinionsBlock'
import ApprovalProcessHistoryPanel, {
  type ApprovalProcessHistoryRow,
} from '@/components/approvals/ApprovalProcessHistoryPanel'
import ApprovalCloseButton from '@/components/approvals/ApprovalCloseButton'
import ApprovalShellListNav from '@/components/approvals/ApprovalShellListNav'
import { selectApprovalOpinionRows } from '@/lib/approval-line-opinions'
import OutboundDetailCoaButtons, {
  type OutboundCoaFileRow,
} from '@/components/outbound/OutboundDetailCoaButtons'
import OutboundDispatchActionButtons from '@/components/outbound/OutboundDispatchActionButtons'
import {
  canViewApprovalDoc,
  cooperatorReadBadge,
  getDetailLineStatus,
  getIsAdmin,
} from '@/lib/approval-document-detail-helpers'
import { formatWriterDepartmentLabel } from '@/lib/approval-draft'
import {
  buildPostApprovalCancelPaperRow,
  getDocTypeLabel,
  getOutboundDispatchStatePresentation,
  getUnifiedApprovalWorkflowBadges,
  isApprovalWriterCancelRequestRemark,
  type ApprovalDocLike,
} from '@/lib/approval-status'
import { getApprovalDocTypeRule } from '@/lib/approval-doc-type-rules'
import { normalizeApprovalRole } from '@/lib/approval-roles'
import { isProbablyRichHtml } from '@/lib/html-content'
import { hasOutboundPermission, type CurrentUserPermissions } from '@/lib/permissions'

type ApprovalDoc = {
  id: number
  doc_no: string
  doc_type: string
  title: string
  content: string | null
  execution_start_date: string | null
  execution_end_date: string | null
  cooperation_dept: string | null
  agreement_text: string | null
  status: string
  current_line_no: number | null
  drafted_at: string
  submitted_at: string | null
  completed_at: string | null
  remarks: string | null
  writer_id: string
  dept_id: number
  post_approval_cancel_opinion?: string | null
  post_approval_cancel_by?: string | null
  post_approval_cancel_at?: string | null
}

type ApprovalLine = {
  id: number
  approval_doc_id: number
  line_no: number
  approver_id: string
  approver_role: string
  status: string
  acted_at?: string | null
  opinion?: string | null
}

type ApprovalParticipant = {
  user_id: string
  role: string
  line_no: number
}

type AppUserProfile = {
  id: string
  email?: string | null
  user_name: string | null
  employee_no?: string | null
  dept_id: number | null
  department?: string | null
  job_rank?: string | null
  major?: string | null
  user_kind?: string | null
  training_program?: string | null
  school_name?: string | null
  teacher_subject?: string | null
  role_name: string | null
  seal_image_path: string | null
  can_manage_permissions?: boolean | null
  can_admin_manage?: boolean | null
  can_outbound_view?: boolean | null
  can_outbound_execute_self?: boolean | null
  can_outbound_assign_handler?: boolean | null
  can_outbound_reassign_recall?: boolean | null
  can_outbound_execute_any?: boolean | null
}

function formatHandlerMetaLabel(user: Partial<AppUserProfile>): string {
  const name = String(user.user_name ?? '').trim() || '이름없음'
  const school = String(user.school_name ?? '').trim()
  const major =
    String(user.major ?? '').trim() ||
    String(user.training_program ?? '').trim() ||
    String(user.teacher_subject ?? '').trim()
  const schoolMajor = [school, major].filter(Boolean).join(' ')
  const dept = String(user.department ?? '').trim()
  const rank = String(user.job_rank ?? '').trim()
  const deptRank = [dept, rank].filter(Boolean).join(' ')
  const empNo = String(user.employee_no ?? '').trim()
  const middle = [schoolMajor, deptRank ? `(${deptRank})` : ''].filter(Boolean).join(' ').trim()
  return `${name} · ${middle || '-'} · ${empNo || '-'}`
}

type OutboundRequestRow = {
  id: number
  req_no: string | null
  requester_id: string
  purpose: string | null
  status: string
  approval_doc_id: number | null
  warehouse_id: number
  dispatch_state: 'queue' | 'assigned' | 'in_progress' | 'completed' | null
  dispatch_handler_user_id: string | null
  dispatch_handler_name: string | null
  receipt_confirmed_at: string | null
  receipt_confirmed_by: string | null
  created_at: string
}

type OutboundDispatchAuditLogRow = {
  id: number
  action_type: 'assign' | 'reassign' | 'recall' | 'execute_self' | 'complete'
  actor_id: string
  actor_name: string | null
  occurred_at: string
  reason: string | null
}

type OutboundItemRow = {
  id: number
  line_no: number | null
  qty: number
  item_id: number
  remarks?: string | null
  items: {
    item_code: string | null
    item_name: string | null
    item_spec: string | null
    unit: string | null
    is_lot_managed: boolean | null
    is_sn_managed: boolean | null
    is_exp_managed: boolean | null
  } | null
}

function normUserIdKey(id: string | null | undefined): string {
  if (id == null || id === '') return ''
  return String(id).trim().toLowerCase()
}

async function loadOutboundDetailAppUsers(supabase: SupabaseClient): Promise<AppUserProfile[]> {
  const outboundCols = `outbound_role, can_outbound_view, can_outbound_execute_self, can_outbound_assign_handler, can_outbound_reassign_recall, can_outbound_execute_any`
  const coreCols = `id, email, user_name, employee_no, dept_id, department, job_rank, major, user_kind, training_program, school_name, teacher_subject, role_name, seal_image_path, can_manage_permissions, can_admin_manage`
  const coreColsNoEmail = `id, user_name, employee_no, dept_id, department, job_rank, major, user_kind, training_program, school_name, teacher_subject, role_name, seal_image_path, can_manage_permissions, can_admin_manage`

  const run = (sel: string) => supabase.from('app_users').select(sel).order('user_name')

  let r: any = await run(`${coreCols}, ${outboundCols}`)
  if (r.error && /can_outbound_/i.test(String(r.error.message ?? ''))) {
    r = await run(coreCols)
  }
  if (r.error && /(\bemail\b|column).*does not exist/i.test(String(r.error.message ?? ''))) {
    r = await run(`${coreColsNoEmail}, ${outboundCols}`)
    if (r.error && /can_outbound_/i.test(String(r.error.message ?? ''))) {
      r = await run(coreColsNoEmail)
    }
  }

  if (r.error) return []
  return (Array.isArray(r.data) ? r.data : []) as AppUserProfile[]
}

/** 목록 조회가 일부 사용자만 돌려줄 때(RLS 등) 이력·결재선에 나온 id로 추가 적재한다. */
async function supplementAppUsersForActorIds(
  supabase: SupabaseClient,
  profiles: AppUserProfile[],
  refs: {
    histories: { actor_id: string }[]
    lines: { approver_id: string }[]
    participants: { user_id: string }[]
    writerId: string
  }
) {
  const have = new Set(profiles.map((p) => normUserIdKey(p.id)))
  const queued = new Set<string>()
  const missing: string[] = []

  const add = (raw: string | null | undefined) => {
    const trimmed = String(raw ?? '').trim()
    if (!trimmed) return
    const n = normUserIdKey(trimmed)
    if (!n || have.has(n) || queued.has(n)) return
    queued.add(n)
    missing.push(trimmed)
  }

  for (const h of refs.histories) add(h.actor_id)
  for (const l of refs.lines) add(l.approver_id)
  for (const p of refs.participants) add(p.user_id)
  add(refs.writerId)

  if (missing.length === 0) return

  const outboundCols = `outbound_role, can_outbound_view, can_outbound_execute_self, can_outbound_assign_handler, can_outbound_reassign_recall, can_outbound_execute_any`
  const coreCols = `id, email, user_name, employee_no, dept_id, department, job_rank, major, user_kind, training_program, school_name, teacher_subject, role_name, seal_image_path, can_manage_permissions, can_admin_manage`
  const coreColsNoEmail = `id, user_name, employee_no, dept_id, department, job_rank, major, user_kind, training_program, school_name, teacher_subject, role_name, seal_image_path, can_manage_permissions, can_admin_manage`

  let r: any = await supabase.from('app_users').select(`${coreCols}, ${outboundCols}`).in('id', missing)
  if (r.error && /can_outbound_/i.test(String(r.error.message ?? ''))) {
    r = await supabase.from('app_users').select(coreCols).in('id', missing)
  }
  if (r.error && /(\bemail\b|column).*does not exist/i.test(String(r.error.message ?? ''))) {
    r = await supabase.from('app_users').select(`${coreColsNoEmail}, ${outboundCols}`).in('id', missing)
    if (r.error && /can_outbound_/i.test(String(r.error.message ?? ''))) {
      r = await supabase.from('app_users').select(coreColsNoEmail).in('id', missing)
    }
  }
  if (r.error) return
  const rows = (Array.isArray(r.data) ? r.data : []) as AppUserProfile[]
  if (rows.length === 0) return
  for (const row of rows) {
    const n = normUserIdKey(row.id)
    if (!have.has(n)) {
      profiles.push(row)
      have.add(n)
    }
  }
}

export async function getOutboundRequestDetail(supabase: SupabaseClient, id: string) {
  const reqId = Number(id)
  if (Number.isNaN(reqId)) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const authUserId = user?.id ?? null
  const authUserEmail = String(user?.email ?? '').trim().toLowerCase()

  const { data: reqRow, error: reqErr } = await supabase
    .from('outbound_requests')
    .select(`
      id, req_no, requester_id, purpose, status, approval_doc_id, warehouse_id,
      dispatch_state, dispatch_handler_user_id, dispatch_handler_name,
      receipt_confirmed_at, receipt_confirmed_by, created_at
    `)
    .eq('id', reqId)
    .single()

  if (reqErr || !reqRow) return null

  const request = reqRow as OutboundRequestRow
  const approvalDocId = request.approval_doc_id

  const [initialUsers, { data: departments }, { data: whRow }] = await Promise.all([
    loadOutboundDetailAppUsers(supabase),
    supabase.from('departments').select('id, dept_name'),
    supabase.from('warehouses').select('name').eq('id', request.warehouse_id).maybeSingle(),
  ])

  const warehouseName = (whRow as { name?: string } | null)?.name?.trim() || '—'

  let doc: ApprovalDoc | null = null
  let lines: ApprovalLine[] = []
  let participants: ApprovalParticipant[] = []
  let histories: { id: number; action_type: string; actor_id: string; action_at: string; action_comment?: string | null }[] =
    []
  let dispatchAuditLogs: OutboundDispatchAuditLogRow[] = []

  if (approvalDocId) {
    const [docRes, linesRes, partsRes, histRes] = await Promise.all([
      supabase.from('approval_docs').select('*').eq('id', approvalDocId).single(),
      supabase.from('approval_lines').select('*').eq('approval_doc_id', approvalDocId).order('line_no'),
      supabase
        .from('approval_participants')
        .select('user_id, role, line_no')
        .eq('approval_doc_id', approvalDocId)
        .order('line_no'),
      supabase.from('approval_histories').select('*').eq('approval_doc_id', approvalDocId).order('action_at'),
    ])
    if (docRes.data) doc = docRes.data as ApprovalDoc
    lines = (linesRes.data as ApprovalLine[]) ?? []
    participants = (partsRes.data as ApprovalParticipant[]) ?? []
    histories = (histRes.data ?? []) as typeof histories
  }
  {
    const { data: dispatchRows } = await supabase
      .from('outbound_dispatch_audit_logs')
      .select('id, action_type, actor_id, actor_name, occurred_at, reason')
      .eq('outbound_request_id', reqId)
      .order('occurred_at')
    dispatchAuditLogs = (dispatchRows ?? []) as OutboundDispatchAuditLogRow[]
  }

  const userProfiles: AppUserProfile[] = [...initialUsers]
  await supplementAppUsersForActorIds(supabase, userProfiles, {
    histories,
    lines,
    participants,
    writerId: doc?.writer_id ?? request.requester_id,
  })

  const currentUserProfile =
    (authUserId != null
      ? userProfiles.find((u) => normUserIdKey(u.id) === normUserIdKey(authUserId)) ??
        userProfiles.find((u) => u.id === authUserId) ??
        null
      : null) ??
    (authUserEmail
      ? userProfiles.find((u) => String(u.email ?? '').trim().toLowerCase() === authUserEmail) ?? null
      : null)
  // approval_docs/lines/participants는 app_users.id를 기준으로 저장되므로, 현재 사용자 id도 동일 키로 정규화한다.
  const currentUserId = currentUserProfile?.id ?? authUserId
  const isAdmin = getIsAdmin(userProfiles, currentUserId)
  const canOutboundView = hasOutboundPermission(
    (currentUserProfile as Partial<
      Pick<
        CurrentUserPermissions,
        | 'role_name'
        | 'can_manage_permissions'
        | 'can_admin_manage'
        | 'can_outbound_view'
        | 'can_outbound_execute_self'
        | 'can_outbound_assign_handler'
        | 'can_outbound_reassign_recall'
        | 'can_outbound_execute_any'
      >
    > | null) ?? null,
    'can_outbound_view'
  )
  const canUseOutboundActionButtons =
    hasOutboundPermission(currentUserProfile as Partial<CurrentUserPermissions>, 'can_outbound_execute_any') ||
    hasOutboundPermission(currentUserProfile as Partial<CurrentUserPermissions>, 'can_outbound_execute_self') ||
    hasOutboundPermission(currentUserProfile as Partial<CurrentUserPermissions>, 'can_outbound_assign_handler') ||
    hasOutboundPermission(currentUserProfile as Partial<CurrentUserPermissions>, 'can_outbound_reassign_recall')
  const canAssignHandler = hasOutboundPermission(
    currentUserProfile as Partial<CurrentUserPermissions>,
    'can_outbound_assign_handler'
  )
  const canReassignRecall = hasOutboundPermission(
    currentUserProfile as Partial<CurrentUserPermissions>,
    'can_outbound_reassign_recall'
  )
  const canExecuteSelf = hasOutboundPermission(
    currentUserProfile as Partial<CurrentUserPermissions>,
    'can_outbound_execute_self'
  )
  const canExecuteAny = hasOutboundPermission(
    currentUserProfile as Partial<CurrentUserPermissions>,
    'can_outbound_execute_any'
  )
  const canRecallByTeacherPolicy =
    String(currentUserProfile?.user_kind ?? '').toLowerCase() === 'teacher' || isAdmin
  const canViewByApprovalFlow = canViewApprovalDoc({
    isAdmin,
    currentUserId,
    writerId: doc?.writer_id ?? request.requester_id,
    lines,
    participants,
  })
  const isApprovalEffective = doc ? ['approved', 'effective', 'closed'].includes(doc.status) : request.status === 'approved'
  const isPreDispatchApprovalFlow = !isApprovalEffective
  const canView = canOutboundView || (isPreDispatchApprovalFlow && canViewByApprovalFlow)

  if (!canView) {
    return {
      forbidden: true as const,
      requestId: reqId,
    }
  }

  const { data: items } = await supabase
    .from('outbound_request_items')
    .select('id, line_no, qty, item_id, remarks, items(item_code, item_name, item_spec, unit, is_lot_managed, is_sn_managed, is_exp_managed)')
    .eq('outbound_request_id', reqId)
    .order('line_no')

  const itemRows = (items ?? []) as unknown as OutboundItemRow[]
  const outboundPlannedItems = itemRows.map((row, idx) => {
    let lot: string | null = null
    let sn: string | null = null
    let exp: string | null = null
    try {
      const parsed = row.remarks ? (JSON.parse(row.remarks) as { selected_lot?: unknown; selected_sn?: unknown; selected_exp?: unknown }) : null
      lot = typeof parsed?.selected_lot === 'string' ? parsed.selected_lot : null
      sn = typeof parsed?.selected_sn === 'string' ? parsed.selected_sn : null
      exp = typeof parsed?.selected_exp === 'string' ? parsed.selected_exp : null
    } catch {
      lot = null
      sn = null
      exp = null
    }
    return {
      req_item_id: row.id,
      item_id: row.item_id,
      no: row.line_no ?? idx + 1,
      itemCode: row.items?.item_code ?? '',
      itemName: row.items?.item_name ?? '',
      lot,
      sn,
      exp,
      qty: row.qty,
      is_lot: row.items?.is_lot_managed === true,
      is_sn: row.items?.is_sn_managed === true,
      is_exp: row.items?.is_exp_managed === true,
    }
  })
  const itemIds = itemRows.map((r) => r.item_id).filter((x) => Number.isFinite(x) && x > 0)
  let coaFiles: OutboundCoaFileRow[] = []
  if (itemIds.length > 0) {
    const { data: coaRows } = await supabase
      .from('coa_files')
      .select('id, item_id, version_no, file_name, storage_path')
      .in('item_id', itemIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    coaFiles = (coaRows ?? []) as OutboundCoaFileRow[]
  }

  return {
    request,
    doc,
    currentUserId,
    users: userProfiles,
    departments: departments ?? [],
    lines,
    participants,
    histories,
    dispatchAuditLogs,
    warehouseName,
    itemRows,
    outboundPlannedItems,
    coaFiles,
    canUseOutboundActionButtons,
    canAssignHandler,
    canReassignRecall,
    canExecuteSelf,
    canExecuteAny,
    canRecallByTeacherPolicy,
  }
}

type ShellMode = 'app' | 'bare'

export async function OutboundDetailShared({
  supabase,
  id,
  shellMode,
  attachmentFrom,
  showDispatchControlBox = false,
}: {
  supabase: SupabaseClient
  id: string
  shellMode: ShellMode
  showDispatchControlBox?: boolean
  attachmentFrom?: {
    enabled: boolean
    sourceDocNo: string | null
    sourceTitle: string | null
  }
}) {
  const result = await getOutboundRequestDetail(supabase, id)
  if (!result) notFound()
  if ('forbidden' in result && result.forbidden) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6 shadow-sm">
          <h1 className="text-lg sm:text-xl font-black text-amber-900">조회 권한 없음</h1>
          <p className="mt-3 text-sm sm:text-base font-bold leading-relaxed text-amber-800">
            출고권한(조회) 미부여 상태입니다.
            관리자에게 권한 부여를 요청해 주세요.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <Link
              href="/outbound-requests"
              className="inline-flex items-center justify-center rounded-xl border-2 border-amber-700 bg-amber-100 px-4 py-2.5 text-sm font-black text-amber-900 hover:bg-amber-200"
            >
              목록으로 이동
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const {
    request,
    doc,
    currentUserId,
    users,
    departments,
    lines,
    participants,
    histories,
    dispatchAuditLogs,
    warehouseName,
    itemRows,
    outboundPlannedItems,
    coaFiles,
    canUseOutboundActionButtons,
    canAssignHandler,
    canReassignRecall,
    canExecuteSelf,
    canExecuteAny,
    canRecallByTeacherPolicy,
  } = result

  const userMap = new Map(users.map((u) => [normUserIdKey(u.id), u]))
  const dispatchUserOptions = users
    .filter((u) => {
      return (
        hasOutboundPermission(u as Partial<CurrentUserPermissions>, 'can_outbound_execute_self') ||
        hasOutboundPermission(u as Partial<CurrentUserPermissions>, 'can_outbound_execute_any')
      )
    })
    .map((u) => ({ id: u.id, name: formatHandlerMetaLabel(u) }))
    .filter((u) => u.name.length > 0)
  const deptMap = new Map(departments.map((d: { id: number; dept_name: string }) => [d.id, d.dept_name]))
  const sealUrlMap = new Map<string, string>()
  for (const u of users) {
    if (!u.seal_image_path) continue
    const { data } = supabase.storage.from('user-seals').getPublicUrl(u.seal_image_path)
    if (data?.publicUrl) {
      const url = data.publicUrl
      sealUrlMap.set(normUserIdKey(u.id), url)
      sealUrlMap.set(u.id, url)
    }
  }

  const writerIdForPaper = doc?.writer_id ?? request.requester_id
  const writerProfile = userMap.get(normUserIdKey(writerIdForPaper))
  const writerName = writerProfile?.user_name || writerIdForPaper.slice(0, 8)
  const writerEmployeeNo = writerProfile?.employee_no ?? null
  const writerDeptName = formatWriterDepartmentLabel(writerProfile, deptMap, { docDeptId: doc?.dept_id ?? null })

  const draftedDate = doc?.drafted_at
    ? new Date(doc.drafted_at).toISOString().split('T')[0]
    : new Date(request.created_at).toISOString().split('T')[0]
  const docNo = doc?.doc_no ?? request.req_no ?? '—'
  const titleForPaper = doc?.title?.trim() || request.purpose?.trim()?.slice(0, 500) || '(제목 없음)'
  const contentRaw = doc?.content ?? request.purpose ?? ''
  const latestDirectCancelHistory = [...histories]
    .reverse()
    .find((h) => String((h as { action_type?: string }).action_type || '') === 'direct_cancel_final') as
    | { actor_id?: string | null; action_at?: string | null; action_comment?: string | null }
    | undefined
  const cancelActorIdOutbound = doc?.post_approval_cancel_by ?? latestDirectCancelHistory?.actor_id ?? null
  const cancelActorNameOutbound =
    cancelActorIdOutbound != null ? userMap.get(normUserIdKey(cancelActorIdOutbound))?.user_name ?? null : null
  const cancelOpinionFallbackOutbound =
    doc?.post_approval_cancel_opinion ??
    (latestDirectCancelHistory?.action_comment && latestDirectCancelHistory.action_comment !== '[-]'
      ? latestDirectCancelHistory.action_comment
      : null)
  const cancelAtFallbackOutbound = doc?.post_approval_cancel_at ?? latestDirectCancelHistory?.action_at ?? null
  const postCancelPaper = doc
    ? buildPostApprovalCancelPaperRow(
        {
          ...doc,
          post_approval_cancel_opinion: cancelOpinionFallbackOutbound,
          post_approval_cancel_by: cancelActorIdOutbound,
          post_approval_cancel_at: cancelAtFallbackOutbound,
        },
        cancelActorNameOutbound
      )
    : { cleanBody: contentRaw, row: null as null }
  const contentForPaper = postCancelPaper.row ? postCancelPaper.cleanBody : contentRaw
  const postApprovalCancelRowOutbound = postCancelPaper.row
  const contentIsHtml = Boolean(contentForPaper && isProbablyRichHtml(contentForPaper))

  const displayLines = lines.map((line) => ({
    line_no: line.line_no,
    approver_id: line.approver_id,
    approver_role: line.approver_role,
    status: line.status,
    acted_at: line.acted_at ?? null,
    opinion: line.opinion ?? null,
  }))

  const stampLines = displayLines
    .filter((line) => {
      const role = normalizeApprovalRole(line.approver_role)
      return role === 'approver' || role === 'pre_cooperator' || role === 'post_cooperator'
    })
    .sort((a, b) => a.line_no - b.line_no)
  const stampColumns = stampLines.map((line) => {
    const profile = userMap.get(normUserIdKey(line.approver_id))
    const userName = profile?.user_name ?? '—'
    const role = normalizeApprovalRole(line.approver_role)
    const isCoop = role === 'pre_cooperator' || role === 'post_cooperator'
    const uid = normUserIdKey(line.approver_id)
    return {
      id: `${line.line_no}-${line.approver_id}`,
      role: isCoop ? (role as 'pre_cooperator' | 'post_cooperator') : ('approver' as const),
      name: userName,
      employeeNo: profile?.employee_no ?? null,
      sealUrl: sealUrlMap.get(uid) ?? sealUrlMap.get(line.approver_id) ?? null,
      status: getDetailLineStatus(line.approver_role, line.status),
      actedAt: line.acted_at,
      showSeal: line.status === 'approved' || line.status === 'confirmed',
      readStatus: isCoop ? cooperatorReadBadge(line.status) : undefined,
      opinionText: isCoop ? line.opinion : undefined,
    }
  })
  const reviewerNames = participants
    .filter((p) => normalizeApprovalRole(p.role) === 'reference')
    .map((p) => userMap.get(normUserIdKey(p.user_id))?.user_name)
    .filter(Boolean)
    .join(', ')
  const referenceText = reviewerNames || doc?.cooperation_dept || ''

  const executionText = doc
    ? `${doc.execution_start_date || '-'} ~ ${doc.execution_end_date || '-'}`
    : '- ~ -'
  const agreementText = doc?.agreement_text ?? null
  const docTypeLabel = doc ? getDocTypeLabel(doc.doc_type) : '출고요청'

  const drafterActedAt = doc?.drafted_at ?? request.created_at

  const workflowDoc: ApprovalDocLike =
    doc ??
    ({
      status: request.status,
      remarks: null,
      current_line_no: null,
      doc_type: 'outbound_request',
    } as ApprovalDocLike)
  const workflowLines = lines.map((l) => ({
    line_no: l.line_no,
    approver_role: l.approver_role,
    status: l.status,
  }))
  const docStatusBand = getUnifiedApprovalWorkflowBadges(workflowDoc, workflowLines)[0]!
  const dispatchInfo = getOutboundDispatchStatePresentation(request.dispatch_state)
  const currentUserName = userMap.get(normUserIdKey(currentUserId ?? ''))?.user_name ?? null

  const userNameById = new Map<string, string | null | undefined>()
  for (const u of users) {
    userNameById.set(normUserIdKey(u.id), u.user_name)
    userNameById.set(u.id, u.user_name)
  }
  const opinionRows = selectApprovalOpinionRows(
    lines.map((l) => ({
      id: l.id,
      line_no: l.line_no,
      approver_id: l.approver_id,
      approver_role: l.approver_role,
      status: l.status,
      opinion: l.opinion ?? null,
      acted_at: l.acted_at ?? null,
    })),
    userNameById
  )

  const outboundHistoryRowsSorted: ApprovalProcessHistoryRow[] = [...histories]
    .map((h) => ({
      id: h.id,
      action_type: h.action_type,
      actor_id: h.actor_id,
      actor_name: userMap.get(normUserIdKey(h.actor_id))?.user_name ?? null,
      action_at: h.action_at,
      action_comment: h.action_comment ?? null,
    }))
    .sort((a, b) => String(a.action_at).localeCompare(String(b.action_at)))
  const outboundDispatchHistoryRows = [...dispatchAuditLogs]
    .map((h) => ({
      id: h.id,
      action_type:
        h.action_type === 'assign'
          ? 'outbound_assign_handler'
          : h.action_type === 'reassign'
            ? 'outbound_reassign_handler'
            : h.action_type === 'recall'
              ? 'outbound_recall_handler'
              : h.action_type === 'execute_self'
                ? 'outbound_execute_self'
                : 'outbound_complete',
      actor_id: h.actor_id,
      actor_name: h.actor_name ?? userMap.get(normUserIdKey(h.actor_id))?.user_name ?? null,
      action_at: h.occurred_at,
      action_comment: h.reason,
    }))
    .sort((a, b) => String(a.action_at).localeCompare(String(b.action_at)))
  const canShowDispatchControlBox =
    request.status === 'approved' &&
    (canAssignHandler || canReassignRecall || canExecuteSelf || canExecuteAny || canRecallByTeacherPolicy)

  const postBodyGridSlot = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
        <span className="text-xs font-black text-gray-600">출고창고</span>
        <p className="text-sm font-bold text-gray-900">{warehouseName}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
        <span className="text-xs font-black text-gray-600">출고통제</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className={dispatchInfo.className}>{dispatchInfo.label}</span>
          <span className="text-sm font-bold text-gray-700">
            담당자: {request.dispatch_handler_name ?? '미지정'}
          </span>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-black text-gray-600">출고품목</p>
        <OutboundDetailCoaButtons files={coaFiles} />
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[280px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 font-black">No.</th>
                <th className="px-3 py-2 font-black">품목코드</th>
                <th className="px-3 py-2 font-black">품목명</th>
                <th className="px-3 py-2 font-black">규격 / 단위</th>
                <th className="px-3 py-2 text-right font-black">수량</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {itemRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs font-bold text-gray-400">
                    등록된 품목이 없습니다.
                  </td>
                </tr>
              ) : (
                itemRows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-xs font-bold text-gray-500">{row.line_no ?? idx + 1}</td>
                    <td className="px-3 py-2 text-xs font-black text-blue-600">{row.items?.item_code ?? '—'}</td>
                    <td className="px-3 py-2 text-xs font-bold text-gray-800">{row.items?.item_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {row.items?.item_spec || '-'} / {row.items?.unit ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-black text-gray-900">{row.qty}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const listBare = shellMode === 'bare'
  const showAttachmentNotice = Boolean(
    attachmentFrom?.enabled && (attachmentFrom.sourceDocNo?.trim() || attachmentFrom.sourceTitle?.trim())
  )
  const resubmitHref = doc
    ? getApprovalDocTypeRule(doc.doc_type)?.resubmitHrefResolver({
        approvalDocId: doc.id,
        outboundRequestId: request.id,
        writerId: doc.writer_id,
        currentUserId,
        status: doc.status,
      }) ?? null
    : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {showAttachmentNotice ? (
        <div className="sticky top-0 z-30 mb-4 rounded-lg border-2 border-blue-300 bg-blue-50/95 px-4 py-3 text-base font-black text-blue-900 shadow-sm backdrop-blur">
          <span className="block truncate leading-relaxed">
            {attachmentFrom?.sourceDocNo?.trim() ? `[${attachmentFrom.sourceDocNo}] ` : ''}
            {attachmentFrom?.sourceTitle?.trim() ? `${attachmentFrom.sourceTitle} ` : ''}
            기안에서 첨부된 문서입니다.
          </span>
        </div>
      ) : null}
      <ApprovalDocumentPaperView
        paperTitle="출고요청서"
        docStatusLabel={docStatusBand.label}
        docStatusClassName={docStatusBand.className}
        showCancelRequestBadge={isApprovalWriterCancelRequestRemark(doc?.remarks)}
        writerName={writerName}
        writerEmployeeNo={writerEmployeeNo}
        writerDeptName={writerDeptName}
        draftedDate={draftedDate}
        docNo={docNo}
        writerSealUrl={sealUrlMap.get(normUserIdKey(writerIdForPaper)) ?? sealUrlMap.get(writerIdForPaper) ?? null}
        stampColumns={stampColumns}
        docTypeLabel={docTypeLabel}
        referenceText={referenceText}
        executionText={executionText}
        agreementText={agreementText}
        title={titleForPaper}
        contentHtml={contentForPaper}
        contentIsHtml={contentIsHtml}
        drafterStatus={getDetailLineStatus('drafter', 'approved')}
        drafterActedAt={drafterActedAt}
        postApprovalCancelRow={postApprovalCancelRowOutbound}
        afterBodySlot={opinionRows.length > 0 ? <ApprovalLineOpinionsBlock rows={opinionRows} /> : undefined}
        postBodyGridSlot={postBodyGridSlot}
        attachmentsSlot={
          doc ? (
            <ApprovalDetailAttachmentsPanel
              docId={doc.id}
              writerId={doc.writer_id}
              currentUserId={currentUserId}
              sourceDocNo={doc.doc_no}
              sourceTitle={doc.title}
              editable={false}
            />
          ) : undefined
        }
      />

      <div className="mt-6 space-y-4 border-t border-gray-200 pt-4">
        <ApprovalProcessHistoryPanel rows={outboundHistoryRowsSorted} />
        {showDispatchControlBox ? (
          <OutboundDispatchActionButtons
            outboundRequestId={request.id}
            requestStatus={request.status as 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed' | 'cancelled'}
            dispatchState={request.dispatch_state}
            handlerUserId={request.dispatch_handler_user_id}
            handlerName={request.dispatch_handler_name}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            canAssignHandler={canAssignHandler}
            canReassignRecall={canReassignRecall}
            canExecuteSelf={canExecuteSelf}
            canExecuteAny={canExecuteAny}
            canRecallByTeacherPolicy={canRecallByTeacherPolicy}
            handlerOptions={dispatchUserOptions}
            plannedItems={outboundPlannedItems}
            warehouseId={request.warehouse_id}
            requesterId={request.requester_id}
            receiptConfirmedAt={request.receipt_confirmed_at}
            receiptConfirmedBy={request.receipt_confirmed_by}
            compact={listBare}
          />
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="mb-3 text-[11px] font-black uppercase tracking-wide text-slate-600">출고 처리 이력</p>
          <p className="mb-3 text-[10px] font-bold leading-snug text-slate-500">
            출고 담당 지정·변경·회수·시작·완료 이력이 시간 순으로 남습니다.
          </p>
          {!canShowDispatchControlBox ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
              <p className="mb-2 text-[11px] font-black text-slate-600">
                현재 상태: {dispatchInfo.label} / 담당자: {request.dispatch_handler_name ?? '미지정'}
              </p>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-100">
                    <tr>
                      <th className="px-2 py-2 font-black text-slate-700">출고예정 No.</th>
                      <th className="px-2 py-2 font-black text-slate-700">품목코드</th>
                      <th className="px-2 py-2 font-black text-slate-700">품목명</th>
                      <th className="px-2 py-2 font-black text-slate-700">LOT</th>
                      <th className="px-2 py-2 font-black text-slate-700">SN</th>
                      <th className="px-2 py-2 font-black text-slate-700">EXP</th>
                      <th className="px-2 py-2 text-right font-black text-slate-700">수량</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outboundPlannedItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-4 text-center font-bold text-slate-400">
                          출고예정 품목이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      outboundPlannedItems.map((item) => (
                        <tr key={`history-${item.no}-${item.itemCode}-${item.itemName}`}>
                          <td className="px-2 py-2 font-bold text-slate-500">{item.no}</td>
                          <td className="px-2 py-2 font-black text-blue-700">{item.itemCode || '—'}</td>
                          <td className="px-2 py-2 font-bold text-slate-800">{item.itemName || '—'}</td>
                          <td className="px-2 py-2 font-bold text-slate-600">{item.lot || '-'}</td>
                          <td className="px-2 py-2 font-bold text-slate-600">{item.sn || '-'}</td>
                          <td className="px-2 py-2 font-bold text-slate-600">{item.exp || '-'}</td>
                          <td className="px-2 py-2 text-right font-black text-slate-900">{item.qty}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-100">
                <tr>
                  <th className="px-2 py-2 font-black text-slate-700">구분</th>
                  <th className="px-2 py-2 font-black text-slate-700">처리자</th>
                  <th className="px-2 py-2 font-black text-slate-700">일시</th>
                  <th className="px-2 py-2 font-black text-slate-700">비고·의견</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outboundDispatchHistoryRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center font-bold text-slate-400">
                      출고 처리 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  outboundDispatchHistoryRows.map((h) => (
                    <tr key={h.id}>
                      <td className="px-2 py-2 font-black text-slate-900">
                        {h.action_type === 'outbound_assign_handler'
                          ? '출고 담당자 지정'
                          : h.action_type === 'outbound_reassign_handler'
                            ? '출고 담당자 변경'
                            : h.action_type === 'outbound_recall_handler'
                              ? '출고 담당자 회수'
                              : h.action_type === 'outbound_execute_self'
                                ? '출고 시작'
                                : '출고 처리 완료'}
                      </td>
                      <td className="px-2 py-2 font-bold text-slate-800">{h.actor_name?.trim() || h.actor_id || '—'}</td>
                      <td className="px-2 py-2 font-bold text-slate-500">{String(h.action_at || '').replace('T', ' ').slice(0, 19)}</td>
                      <td className="max-w-md px-2 py-2 whitespace-pre-wrap font-bold text-slate-800">
                        {h.action_comment?.trim() ? h.action_comment : '[-]'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {showAttachmentNotice ? (
            <ApprovalCloseButton fallbackHref="/outbound-requests" />
          ) : (
            <>
              {resubmitHref ? (
                <Link
                  href={resubmitHref}
                  className="rounded-lg border-2 border-blue-600 bg-blue-50 px-4 py-2 text-sm font-black text-blue-900 hover:bg-blue-100"
                >
                  수정 후 재상신
                </Link>
              ) : null}
              <ApprovalShellListNav href="/outbound-requests" popupListBehavior={listBare}>
                목록
              </ApprovalShellListNav>
              {doc ? (
                <ApprovalActionButtons
                  doc={doc}
                  lines={lines}
                  participants={participants}
                  actionGuard={{
                    allow: true,
                  }}
                />
              ) : (
                <span className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">
                  연결된 결재 문서가 없어 결재 처리를 할 수 없습니다.
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
