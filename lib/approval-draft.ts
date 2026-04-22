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
  writerDeptId: number | null
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

/** 일반기안 웹 임시저장(approval_docs status=draft) 식별용 remarks — 목록/삭제 시 사용 */
export const WEB_GENERAL_DRAFT_REMARKS = 'web_general_draft_v1'
/** 모달 작성용 — 통합 문서함 목록과 섞이지 않도록 구분 */
export const WEB_MODAL_DRAFT_REMARKS = 'web_general_draft_modal_v1'

export type SyncWebGeneralDraftInput = {
  supabase: SupabaseLike
  draftDocId: number | null
  docType: string
  title: string
  content: string
  writerId: string
  writerDeptId: number | null
  approvalOrder: Array<{ role: ApprovalRole; userId: string }>
  executionStartDate?: string
  executionEndDate?: string
  cooperationDept?: string
  agreementText?: string
  /** 기본: WEB_GENERAL_DRAFT_REMARKS */
  remarksTag?: string
}

export function buildReferenceSummaryForDraft(
  approvalOrder: Array<{ role: ApprovalRole; userId: string }>,
  users: Array<{ id: string; user_name: string; dept_id: number | null }>,
  deptMap: Map<number, string>
): string {
  return approvalOrder
    .filter((l) => l.role === 'reviewer' && l.userId.trim())
    .map((l) => {
      const u = users.find((x) => x.id === l.userId)
      if (!u) return ''
      const d = deptMap.get(u.dept_id ?? -1) ?? ''
      return d ? `${d} ${u.user_name}` : u.user_name
    })
    .filter(Boolean)
    .join(', ')
}

/** 기안지 헤더·콤보박스 등: 정규 부서 → 텍스트 부서 → 학생/교사 표시 순 */
export type WriterDepartmentDisplayUser = {
  dept_id: number | null
  department?: string | null
  user_kind?: string | null
  training_program?: string | null
  school_name?: string | null
  teacher_subject?: string | null
}

export function formatWriterDepartmentLabel(
  user: WriterDepartmentDisplayUser | undefined,
  deptMap: Map<number, string>
): string {
  if (!user) return '—'
  const fromDept = user.dept_id != null ? deptMap.get(user.dept_id) : undefined
  if (fromDept) return fromDept
  const textDept = (user.department ?? '').trim()
  if (textDept && textDept.toUpperCase() !== 'EMPTY') return textDept
  if (user.user_kind === 'student') {
    const bits = [user.training_program, user.school_name].map((s) => (s ?? '').trim()).filter(Boolean)
    if (bits.length) return bits.join(' · ')
    return '학생'
  }
  if (user.user_kind === 'teacher') {
    const bits = [user.school_name, user.teacher_subject].map((s) => (s ?? '').trim()).filter(Boolean)
    if (bits.length) return bits.join(' · ')
    return '교사'
  }
  return '—'
}

export async function syncWebGeneralDraft(input: SyncWebGeneralDraftInput): Promise<{ draftDocId: number }> {
  const {
    supabase,
    draftDocId,
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
    remarksTag = WEB_GENERAL_DRAFT_REMARKS,
  } = input

  const participants = normalizeParticipants(
    approvalOrder.map((line) => ({ role: line.role, userId: line.userId }))
  )
  const now = new Date().toISOString()
  const titleForRow = title.trim() || '(제목 없음)'
  const contentForRow = content.trim() || ''

  let docId = draftDocId

  if (!docId) {
    const docNo = `DRAFT-${crypto.randomUUID().replace(/-/g, '').slice(0, 28)}`
    const { data: inserted, error } = await supabase
      .from('approval_docs')
      .insert({
        doc_no: docNo,
        doc_type: docType,
        title: titleForRow,
        content: contentForRow,
        writer_id: writerId,
        dept_id: writerDeptId,
        execution_start_date: executionStartDate || null,
        execution_end_date: executionEndDate || null,
        cooperation_dept: cooperationDept?.trim() || null,
        agreement_text: agreementText?.trim() || null,
        status: 'draft',
        current_line_no: null,
        drafted_at: now,
        submitted_at: null,
        remarks: remarksTag,
      })
      .select('id')
      .single()
    if (error || !inserted) throw error || new Error('임시저장 문서 생성 실패')
    docId = inserted.id as number
  } else {
    const { error: upErr } = await supabase
      .from('approval_docs')
      .update({
        doc_type: docType,
        title: titleForRow,
        content: contentForRow,
        dept_id: writerDeptId,
        execution_start_date: executionStartDate || null,
        execution_end_date: executionEndDate || null,
        cooperation_dept: cooperationDept?.trim() || null,
        agreement_text: agreementText?.trim() || null,
        remarks: remarksTag,
      })
      .eq('id', docId)
      .eq('writer_id', writerId)
      .eq('status', 'draft')
      .eq('remarks', remarksTag)
    if (upErr) throw upErr
  }

  const { error: delLines } = await supabase.from('approval_lines').delete().eq('approval_doc_id', docId)
  if (delLines) throw delLines
  const { error: delParts } = await supabase.from('approval_participants').delete().eq('approval_doc_id', docId)
  if (delParts) throw delParts

  const linesBuilt = buildApprovalLines(docId, participants)
  if (linesBuilt.length > 0) {
    const { error: linesError } = await supabase.from('approval_lines').insert(linesBuilt)
    if (linesError) throw linesError
  }
  const participantRows = buildApprovalParticipantsRows(docId, participants)
  if (participantRows.length > 0) {
    const { error: participantsError } = await supabase.from('approval_participants').insert(participantRows)
    if (participantsError) throw participantsError
  }

  return { draftDocId: docId }
}

export async function deleteWebGeneralDraft(
  supabase: SupabaseLike,
  draftDocId: number,
  writerId: string,
  remarksTag: string = WEB_GENERAL_DRAFT_REMARKS
) {
  const { error } = await supabase
    .from('approval_docs')
    .delete()
    .eq('id', draftDocId)
    .eq('writer_id', writerId)
    .eq('status', 'draft')
    .eq('remarks', remarksTag)
  if (error) throw error
}

export async function listWebGeneralDrafts(
  supabase: SupabaseLike,
  writerId: string,
  remarksTag: string = WEB_GENERAL_DRAFT_REMARKS
) {
  const { data, error } = await supabase
    .from('approval_docs')
    .select('id, title, drafted_at, doc_type')
    .eq('writer_id', writerId)
    .eq('status', 'draft')
    .eq('remarks', remarksTag)
    .order('drafted_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export async function fetchWebGeneralDraftBundle(
  supabase: SupabaseLike,
  draftDocId: number,
  writerId: string,
  remarksTag: string = WEB_GENERAL_DRAFT_REMARKS
): Promise<{ doc: Record<string, unknown>; participants: Array<{ user_id: string; role: string; line_no: number }> }> {
  const { data: doc, error } = await supabase
    .from('approval_docs')
    .select('*')
    .eq('id', draftDocId)
    .eq('writer_id', writerId)
    .eq('status', 'draft')
    .eq('remarks', remarksTag)
    .single()
  if (error || !doc) throw error || new Error('임시 문서를 불러올 수 없습니다')

  const { data: parts, error: pErr } = await supabase
    .from('approval_participants')
    .select('user_id, role, line_no')
    .eq('approval_doc_id', draftDocId)
    .order('line_no')
  if (pErr) throw pErr

  return { doc: doc as Record<string, unknown>, participants: (parts ?? []) as Array<{ user_id: string; role: string; line_no: number }> }
}
