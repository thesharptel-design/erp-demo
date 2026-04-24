import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import ApprovalActionButtons from '@/components/ApprovalActionButtons'
import ApprovalDocumentPaperView from '@/components/approvals/ApprovalDocumentPaperView'
import ApprovalLineOpinionsBlock from '@/components/approvals/ApprovalLineOpinionsBlock'
import ApprovalProcessHistoryPanel, {
  type ApprovalProcessHistoryRow,
} from '@/components/approvals/ApprovalProcessHistoryPanel'
import ApprovalShellListNav from '@/components/approvals/ApprovalShellListNav'
import { selectApprovalOpinionRows } from '@/lib/approval-line-opinions'
import OutboundDetailCoaButtons, {
  type OutboundCoaFileRow,
} from '@/components/outbound/OutboundDetailCoaButtons'
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
  getUnifiedApprovalWorkflowBadges,
  type ApprovalDocLike,
} from '@/lib/approval-status'
import { isProbablyRichHtml } from '@/lib/html-content'

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
  user_name: string | null
  employee_no?: string | null
  dept_id: number | null
  department?: string | null
  user_kind?: string | null
  training_program?: string | null
  school_name?: string | null
  teacher_subject?: string | null
  role_name: string | null
  seal_image_path: string | null
}

type OutboundRequestRow = {
  id: number
  req_no: string | null
  requester_id: string
  purpose: string | null
  status: string
  approval_doc_id: number | null
  warehouse_id: number
  created_at: string
}

type OutboundItemRow = {
  id: number
  line_no: number | null
  qty: number
  item_id: number
  items: {
    item_code: string | null
    item_name: string | null
    item_spec: string | null
    unit: string | null
  } | null
}

export async function getOutboundRequestDetail(supabase: SupabaseClient, id: string) {
  const reqId = Number(id)
  if (Number.isNaN(reqId)) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const currentUserId = user?.id ?? null

  const { data: reqRow, error: reqErr } = await supabase
    .from('outbound_requests')
    .select('id, req_no, requester_id, purpose, status, approval_doc_id, warehouse_id, created_at')
    .eq('id', reqId)
    .single()

  if (reqErr || !reqRow) return null

  const request = reqRow as OutboundRequestRow
  const approvalDocId = request.approval_doc_id

  const [{ data: users }, { data: departments }, { data: whRow }] = await Promise.all([
    supabase
      .from('app_users')
      .select(
        'id, user_name, employee_no, dept_id, department, user_kind, training_program, school_name, teacher_subject, role_name, seal_image_path'
      ),
    supabase.from('departments').select('id, dept_name'),
    supabase.from('warehouses').select('name').eq('id', request.warehouse_id).maybeSingle(),
  ])

  const warehouseName = (whRow as { name?: string } | null)?.name?.trim() || '—'

  let doc: ApprovalDoc | null = null
  let lines: ApprovalLine[] = []
  let participants: ApprovalParticipant[] = []
  let histories: { id: number; action_type: string; actor_id: string; action_at: string; action_comment?: string | null }[] =
    []

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

  const isAdmin = getIsAdmin((users ?? []) as AppUserProfile[], currentUserId)
  const canView =
    isAdmin ||
    (currentUserId != null && request.requester_id === currentUserId) ||
    (doc != null &&
      currentUserId != null &&
      canViewApprovalDoc({
        isAdmin: false,
        currentUserId,
        writerId: doc.writer_id,
        lines,
        participants,
      }))

  if (!canView) return null

  const { data: items } = await supabase
    .from('outbound_request_items')
    .select('id, line_no, qty, item_id, items(item_code, item_name, item_spec, unit)')
    .eq('outbound_request_id', reqId)
    .order('line_no')

  const itemRows = (items ?? []) as unknown as OutboundItemRow[]
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
    users: (users as AppUserProfile[]) ?? [],
    departments: departments ?? [],
    lines,
    participants,
    histories,
    warehouseName,
    itemRows,
    coaFiles,
  }
}

type ShellMode = 'app' | 'bare'

export async function OutboundDetailShared({
  supabase,
  id,
  shellMode,
}: {
  supabase: SupabaseClient
  id: string
  shellMode: ShellMode
}) {
  const result = await getOutboundRequestDetail(supabase, id)
  if (!result) notFound()

  const { request, doc, currentUserId, users, departments, lines, participants, histories, warehouseName, itemRows, coaFiles } =
    result

  const userMap = new Map(users.map((u) => [u.id, u]))
  const deptMap = new Map(departments.map((d: { id: number; dept_name: string }) => [d.id, d.dept_name]))
  const sealUrlMap = new Map<string, string>()
  for (const u of users) {
    if (!u.seal_image_path) continue
    const { data } = supabase.storage.from('user-seals').getPublicUrl(u.seal_image_path)
    if (data?.publicUrl) sealUrlMap.set(u.id, data.publicUrl)
  }

  const writerIdForPaper = doc?.writer_id ?? request.requester_id
  const writerProfile = userMap.get(writerIdForPaper)
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
    cancelActorIdOutbound != null ? userMap.get(cancelActorIdOutbound)?.user_name ?? null : null
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

  const lineMapByNo = new Map(lines.map((line) => [line.line_no, line]))
  const displayLines =
    participants.length > 0
      ? participants.map((participant) => {
          const matchedLine = lineMapByNo.get(participant.line_no)
          return {
            line_no: participant.line_no,
            approver_id: participant.user_id,
            approver_role: participant.role,
            status: matchedLine?.status ?? 'waiting',
            acted_at: matchedLine?.acted_at ?? null,
            opinion: matchedLine?.opinion ?? null,
          }
        })
      : lines.map((line) => ({
          line_no: line.line_no,
          approver_id: line.approver_id,
          approver_role: line.approver_role,
          status: line.status,
          acted_at: line.acted_at ?? null,
          opinion: line.opinion ?? null,
        }))

  const cooperativeLines = displayLines.filter((line) => line.approver_role === 'cooperator')
  const approverLines = displayLines
    .filter((line) => line.approver_role === 'approver')
    .sort((a, b) => a.line_no - b.line_no)
  const approverColumns = approverLines.map((line) => {
    const profile = userMap.get(line.approver_id)
    const userName = profile?.user_name ?? '—'
    return {
      id: `${line.line_no}-${line.approver_id}`,
      name: userName,
      employeeNo: profile?.employee_no ?? null,
      sealUrl: sealUrlMap.get(line.approver_id) ?? null,
      status: getDetailLineStatus(line.approver_role, line.status),
      actedAt: line.acted_at,
      showSeal: line.status === 'approved',
    }
  })
  const cooperativeRows = cooperativeLines.map((line) => {
    const profile = userMap.get(line.approver_id)
    const dept = formatWriterDepartmentLabel(profile, deptMap)
    return {
      id: `coop-${line.line_no}-${line.approver_id}`,
      dept,
      name: profile?.user_name ?? '—',
      readStatus: cooperatorReadBadge(line.status),
      opinionText: line.opinion,
    }
  })
  const reviewerNames = participants
    .filter((p) => p.role === 'reviewer')
    .map((p) => userMap.get(p.user_id)?.user_name)
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

  const userNameById = new Map(users.map((u) => [u.id, u.user_name]))
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
      actor_name: userMap.get(h.actor_id)?.user_name ?? null,
      action_at: h.action_at,
      action_comment: h.action_comment ?? null,
    }))
    .sort((a, b) => String(a.action_at).localeCompare(String(b.action_at)))

  const postBodyGridSlot = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-center">
        <span className="text-xs font-black text-gray-600">출고창고</span>
        <p className="text-sm font-bold text-gray-900">{warehouseName}</p>
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
  const canWriterEditResubmit =
    Boolean(currentUserId && doc && doc.writer_id === currentUserId) &&
    ['draft', 'rejected'].includes(String(doc?.status ?? ''))

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <ApprovalDocumentPaperView
        paperTitle="출고요청서"
        docStatusLabel={docStatusBand.label}
        docStatusClassName={docStatusBand.className}
        showCancelRequestBadge={Boolean(doc?.remarks?.includes('취소 요청'))}
        writerName={writerName}
        writerEmployeeNo={writerEmployeeNo}
        writerDeptName={writerDeptName}
        draftedDate={draftedDate}
        docNo={docNo}
        writerSealUrl={sealUrlMap.get(writerIdForPaper) ?? null}
        approverColumns={approverColumns}
        cooperators={cooperativeRows}
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
      />

      <div className="mt-6 space-y-4 border-t border-gray-200 pt-4">
        <ApprovalProcessHistoryPanel rows={outboundHistoryRowsSorted} />

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canWriterEditResubmit && doc ? (
            <Link
              href={`/outbound-requests/new?resubmit=${doc.id}`}
              className="rounded-lg border-2 border-blue-600 bg-blue-50 px-4 py-2 text-sm font-black text-blue-900 hover:bg-blue-100"
            >
              수정·재상신
            </Link>
          ) : null}
          <ApprovalShellListNav href="/outbound-requests" popupListBehavior={listBare}>
            목록
          </ApprovalShellListNav>
          {doc ? (
            <ApprovalActionButtons doc={doc} lines={lines} participants={participants} />
          ) : (
            <span className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500">
              연결된 결재 문서가 없어 결재 처리를 할 수 없습니다.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
