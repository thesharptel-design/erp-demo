import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import ApprovalActionButtons from '@/components/ApprovalActionButtons'
import ApprovalDocumentPaperView from '@/components/approvals/ApprovalDocumentPaperView'
import ApprovalLineOpinionsBlock from '@/components/approvals/ApprovalLineOpinionsBlock'
import ApprovalProcessHistoryPanel, {
  type ApprovalProcessHistoryRow,
} from '@/components/approvals/ApprovalProcessHistoryPanel'
import ApprovalShellListNav from '@/components/approvals/ApprovalShellListNav'
import { selectApprovalOpinionRows } from '@/lib/approval-line-opinions'
import {
  buildPostApprovalCancelPaperRow,
  getDocTypeLabel,
  getUnifiedApprovalWorkflowBadges,
  type ApprovalDocLike,
} from '@/lib/approval-status'
import {
  canViewApprovalDoc,
  cooperatorReadBadge,
  getDetailLineStatus,
  getIsAdmin,
} from '@/lib/approval-document-detail-helpers'
import { formatWriterDepartmentLabel } from '@/lib/approval-draft'
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
  can_manage_permissions?: boolean | null
  can_admin_manage?: boolean | null
}

export async function getApprovalDetail(supabase: SupabaseClient, id: string) {
  const docId = Number(id)
  if (Number.isNaN(docId)) return null

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const currentUserId = user?.id ?? null

  const [
    { data: doc, error: docError },
    { data: users },
    { data: departments },
    { data: lines },
    { data: histories },
    { data: participants },
  ] = await Promise.all([
    supabase.from('approval_docs').select('*').eq('id', docId).single(),
    supabase
      .from('app_users')
      .select(
        'id, user_name, employee_no, dept_id, department, user_kind, training_program, school_name, teacher_subject, role_name, seal_image_path, can_manage_permissions, can_admin_manage'
      ),
    supabase.from('departments').select('id, dept_name'),
    supabase.from('approval_lines').select('*').eq('approval_doc_id', docId).order('line_no'),
    supabase.from('approval_histories').select('*').eq('approval_doc_id', docId).order('action_at'),
    supabase.from('approval_participants').select('user_id, role, line_no').eq('approval_doc_id', docId).order('line_no'),
  ])

  if (docError) return null

  const isAdmin = getIsAdmin((users ?? []) as AppUserProfile[], currentUserId)
  const canView = canViewApprovalDoc({
    isAdmin,
    currentUserId,
    writerId: (doc as ApprovalDoc).writer_id,
    lines: lines ?? [],
    participants: participants ?? [],
  })
  if (!canView) return null

  return {
    doc: doc as ApprovalDoc,
    users: (users as AppUserProfile[]) ?? [],
    departments: departments ?? [],
    lines: (lines as ApprovalLine[]) ?? [],
    participants: (participants as ApprovalParticipant[]) ?? [],
    histories: histories ?? [],
    currentUserId,
    currentUserRole: isAdmin ? 'admin' : 'user',
  }
}

type ShellMode = 'app' | 'bare'

export async function ApprovalDetailShared({
  supabase,
  id,
  shellMode,
}: {
  supabase: SupabaseClient
  id: string
  shellMode: ShellMode
}) {
  const docId = Number(id)
  if (Number.isNaN(docId)) notFound()

  const { data: head } = await supabase.from('approval_docs').select('id, doc_type').eq('id', docId).single()
  if (!head) notFound()
  if (head.doc_type === 'outbound_request') {
    const { data: req } = await supabase.from('outbound_requests').select('id').eq('approval_doc_id', docId).maybeSingle()
    if (req?.id != null) {
      redirect(shellMode === 'bare' ? `/outbound-requests/view/${req.id}` : `/outbound-requests/${req.id}`)
    }
  }

  const result = await getApprovalDetail(supabase, id)

  if (!result) notFound()

  const { doc, users, departments, lines, participants, histories, currentUserId } = result

  const canWriterEditResubmit =
    Boolean(currentUserId && doc.writer_id === currentUserId) &&
    ['draft', 'rejected'].includes(doc.status)

  const userMap = new Map(users.map((u) => [u.id, u]))
  const deptMap = new Map(departments.map((d: { id: number; dept_name: string }) => [d.id, d.dept_name]))
  const draftedDate = new Date(doc.drafted_at).toISOString().split('T')[0]
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
  const writerProfile = userMap.get(doc.writer_id)
  const sealUrlMap = new Map<string, string>()
  for (const user of users) {
    if (!user.seal_image_path) continue
    const { data } = supabase.storage.from('user-seals').getPublicUrl(user.seal_image_path)
    if (data?.publicUrl) {
      sealUrlMap.set(user.id, data.publicUrl)
    }
  }

  const writerName = writerProfile?.user_name || doc.writer_id.slice(0, 8)
  const writerEmployeeNo = writerProfile?.employee_no ?? null
  const writerDeptName = formatWriterDepartmentLabel(writerProfile, deptMap, { docDeptId: doc.dept_id })
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
  const referenceText = reviewerNames || doc.cooperation_dept || ''
  const contentRaw = doc.content ?? ''
  const latestDirectCancelHistory = [...histories]
    .reverse()
    .find((h) => String((h as { action_type?: string }).action_type || '') === 'direct_cancel_final') as
    | { actor_id?: string | null; action_at?: string | null; action_comment?: string | null }
    | undefined
  const cancelActorId = doc.post_approval_cancel_by ?? latestDirectCancelHistory?.actor_id ?? null
  const cancelActorName = cancelActorId ? userMap.get(cancelActorId)?.user_name ?? null : null
  const cancelOpinionFallback =
    doc.post_approval_cancel_opinion ??
    (latestDirectCancelHistory?.action_comment && latestDirectCancelHistory.action_comment !== '[-]'
      ? latestDirectCancelHistory.action_comment
      : null)
  const cancelAtFallback = doc.post_approval_cancel_at ?? latestDirectCancelHistory?.action_at ?? null
  const { cleanBody, row: postApprovalCancelRow } = buildPostApprovalCancelPaperRow(
    {
      ...doc,
      post_approval_cancel_opinion: cancelOpinionFallback,
      post_approval_cancel_by: cancelActorId,
      post_approval_cancel_at: cancelAtFallback,
    },
    cancelActorName
  )
  const contentForPaper = postApprovalCancelRow ? cleanBody : contentRaw
  const contentIsHtml = Boolean(contentForPaper && isProbablyRichHtml(contentForPaper))

  const userNameById = new Map(users.map((u) => [u.id, u.user_name]))
  const workflowDoc: ApprovalDocLike = doc
  const workflowLines = lines.map((l) => ({
    line_no: l.line_no,
    approver_role: l.approver_role,
    status: l.status,
  }))
  const docStatusBand = getUnifiedApprovalWorkflowBadges(workflowDoc, workflowLines)[0]!

  const historyRowsSorted: ApprovalProcessHistoryRow[] = [...(histories ?? [])]
    .map((h) => {
      const row = h as {
        id: number
        action_type: string
        actor_id: string
        action_at: string
        action_comment?: string | null
      }
      return {
        id: row.id,
        action_type: row.action_type,
        actor_id: row.actor_id,
        actor_name: userMap.get(row.actor_id)?.user_name ?? null,
        action_at: row.action_at,
        action_comment: row.action_comment ?? null,
      }
    })
    .sort((a, b) => String(a.action_at).localeCompare(String(b.action_at)))

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

  const listBare = shellMode === 'bare'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <ApprovalDocumentPaperView
        docStatusLabel={docStatusBand.label}
        docStatusClassName={docStatusBand.className}
        showCancelRequestBadge={Boolean(doc.remarks?.includes('취소 요청'))}
        writerName={writerName}
        writerEmployeeNo={writerEmployeeNo}
        writerDeptName={writerDeptName}
        draftedDate={draftedDate}
        docNo={doc.doc_no}
        writerSealUrl={sealUrlMap.get(doc.writer_id) ?? null}
        approverColumns={approverColumns}
        cooperators={cooperativeRows}
        docTypeLabel={getDocTypeLabel(doc.doc_type)}
        referenceText={referenceText}
        executionText={`${doc.execution_start_date || '-'} ~ ${doc.execution_end_date || '-'}`}
        agreementText={doc.agreement_text}
        title={doc.title}
        contentHtml={contentForPaper}
        contentIsHtml={contentIsHtml}
        drafterStatus={getDetailLineStatus('drafter', 'approved')}
        drafterActedAt={doc.drafted_at}
        postApprovalCancelRow={postApprovalCancelRow}
        afterBodySlot={opinionRows.length > 0 ? <ApprovalLineOpinionsBlock rows={opinionRows} /> : undefined}
      />

      <div className="mt-6 space-y-4 border-t border-gray-200 pt-4">
        <ApprovalProcessHistoryPanel rows={historyRowsSorted} />

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canWriterEditResubmit && (
            <Link
              href={`/approvals/new?resubmit=${doc.id}`}
              className="rounded-lg border-2 border-blue-600 bg-blue-50 px-4 py-2 text-sm font-black text-blue-900 hover:bg-blue-100"
            >
              수정·재상신
            </Link>
          )}
          <ApprovalShellListNav href="/approvals" popupListBehavior={listBare}>
            목록
          </ApprovalShellListNav>
          <ApprovalActionButtons doc={doc} lines={lines} participants={participants} />
        </div>
      </div>
    </div>
  )
}
