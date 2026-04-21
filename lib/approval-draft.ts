import { generateNextAppDocNo } from '@/lib/approval-doc-no'
import { APPROVAL_ROLES, type ApprovalRole } from '@/lib/approval-roles'
import {
  buildApprovalLines,
  buildApprovalParticipantsRows,
  normalizeParticipants,
} from '@/lib/approval-participants'

type SupabaseLike = {
  from: (table: string) => any
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

export type CreateApprovalDraftInput = {
  supabase: SupabaseLike
  docType: string
  title: string
  content: string
  writerId: string
  writerDeptId: number
  approvalOrder: Array<{ role: ApprovalRole; userId: string }>
  executionStartDate?: string
  executionEndDate?: string
  cooperationDept?: string
  agreementText?: string
  remarks?: string
}

export const APPROVAL_DRAFT_DOC_TYPE_OPTIONS = [
  { value: 'draft_doc', label: '일반기안' },
  { value: 'purchase_request', label: '구매품의' },
  { value: 'leave_request', label: '휴가신청' },
]

export function makeEmptyRoleAssignees(): Record<ApprovalRole, string[]> {
  return APPROVAL_ROLES.reduce(
    (acc, role) => {
      acc[role] = ['']
      return acc
    },
    {} as Record<ApprovalRole, string[]>
  )
}

export function makeEmptyRoleSearches(): Record<ApprovalRole, string> {
  return APPROVAL_ROLES.reduce(
    (acc, role) => {
      acc[role] = ''
      return acc
    },
    {} as Record<ApprovalRole, string>
  )
}

export function getApprovalCreateErrorMessage(error: SupabaseErrorLike) {
  if (error.message.includes('결재권')) return '결재권이 없는 사용자는 기안/결재선에 지정할 수 없습니다.'
  if (error.code === '23505') return '문서번호가 중복되었습니다. 다시 시도해 주세요.'
  if (error.code === '23502') return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  return '기안서 저장 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

export async function createApprovalDraft(input: CreateApprovalDraftInput) {
  const {
    supabase,
    docType,
    title,
    content,
    writerId,
    writerDeptId,
    approvalOrder,
    executionStartDate,
    executionEndDate,
    cooperationDept,
    agreementText,
    remarks = '웹 등록 문서',
  } = input

  const docNo = await generateNextAppDocNo(supabase as any)
  const now = new Date().toISOString()

  const { data: docData, error: docError } = await supabase
    .from('approval_docs')
    .insert({
      doc_no: docNo,
      doc_type: docType,
      title: title.trim(),
      content: content.trim(),
      writer_id: writerId,
      dept_id: writerDeptId,
      execution_start_date: executionStartDate || null,
      execution_end_date: executionEndDate || null,
      cooperation_dept: cooperationDept?.trim() || null,
      agreement_text: agreementText?.trim() || null,
      status: 'submitted',
      current_line_no: 1,
      drafted_at: now,
      submitted_at: now,
      remarks,
    })
    .select('id')
    .single()

  if (docError || !docData) throw docError || new Error('문서 생성 실패')

  const participants = normalizeParticipants(
    approvalOrder.map((line) => ({ role: line.role, userId: line.userId }))
  )
  const linesToInsert = buildApprovalLines(docData.id, participants)
  const participantRows = buildApprovalParticipantsRows(docData.id, participants)

  if (linesToInsert.length > 0) {
    const { error: linesError } = await supabase.from('approval_lines').insert(linesToInsert)
    if (linesError) throw linesError
  }
  if (participantRows.length > 0) {
    const { error: participantsError } = await supabase
      .from('approval_participants')
      .insert(participantRows)
    if (participantsError) throw participantsError
  }

  await supabase.from('approval_histories').insert({
    approval_doc_id: docData.id,
    actor_id: writerId,
    action_type: 'submit',
    action_comment: '기안서 상신',
    action_at: now,
  })

  return { docId: docData.id, docNo }
}
