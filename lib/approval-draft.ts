import { generateNextAppDocNo } from '@/lib/approval-doc-no'
import { APPROVAL_ROLES, normalizeApprovalRole, type ApprovalRole } from '@/lib/approval-roles'

/** `lib/approval-status` `APPROVAL_RECALL_REMARK_MARKER` 와 동일 — 순환 import 방지 */
const APPROVAL_RECALL_REMARK_MARKER = '기안 회수됨'
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
  /** 있으면 새 행을 만들지 않고 해당 임시 행을 상신 상태로 승격합니다. */
  promoteDraftDocId?: number | null
  /** `promoteDraftDocId` 검증용 — `syncWebGeneralDraft`에 쓴 `remarksTag`와 동일해야 합니다. */
  draftRemarksTag?: string
  /** 회수·반려 등 기존 행을 작성 화면에서 수정 후 그대로 상신(APP 번호)으로 승격 */
  resubmitFromDocId?: number | null
}

export type CreateApprovalDraftResult = {
  docId: number
  docNo: string
  /** 상신은 신규 insert로 끝났고 예전 임시 행 id가 남아 있으면 삭제 재시도 대상 */
  leftoverDraftIdToDelete: number | null
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 상신 직후 임시 행 삭제가 네트워크 등으로 실패할 때 짧게 재시도합니다.
 */
export async function deleteWebGeneralDraftWithRetry(
  supabase: SupabaseLike,
  draftDocId: number,
  writerId: string,
  remarksTag: string = WEB_GENERAL_DRAFT_REMARKS,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const maxAttempts = options?.maxAttempts ?? 3
  const baseDelayMs = options?.baseDelayMs ?? 400
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await deleteWebGeneralDraft(supabase, draftDocId, writerId, remarksTag)
      return { ok: true }
    } catch (e) {
      lastError = e
      if (attempt < maxAttempts - 1) {
        await sleep(baseDelayMs * 2 ** attempt)
      }
    }
  }
  return { ok: false, error: lastError }
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

async function insertNewApprovalDocument(
  input: Omit<CreateApprovalDraftInput, 'promoteDraftDocId' | 'draftRemarksTag'>
): Promise<{ docId: number; docNo: string }> {
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

/**
 * 임시 `approval_docs` 행을 그대로 상신(APP 번호)으로 전환합니다. 조건이 맞지 않으면 `null`.
 */
async function promoteWebGeneralDraftToSubmitted(
  input: CreateApprovalDraftInput & { promoteDraftDocId: number; draftRemarksTag: string }
): Promise<{ docId: number; docNo: string } | null> {
  const {
    supabase,
    promoteDraftDocId,
    draftRemarksTag,
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

  const { data: updated, error: upErr } = await supabase
    .from('approval_docs')
    .update({
      doc_no: docNo,
      doc_type: docType,
      title: title.trim(),
      content: content.trim(),
      dept_id: writerDeptId,
      execution_start_date: executionStartDate || null,
      execution_end_date: executionEndDate || null,
      cooperation_dept: cooperationDept?.trim() || null,
      agreement_text: agreementText?.trim() || null,
      status: 'submitted',
      current_line_no: 1,
      submitted_at: now,
      remarks,
    })
    .eq('id', promoteDraftDocId)
    .eq('writer_id', writerId)
    .eq('status', 'draft')
    .eq('remarks', draftRemarksTag)
    .neq('doc_type', 'outbound_request')
    .select('id')
    .maybeSingle()

  if (upErr) throw upErr
  if (!updated?.id) return null

  const docId = updated.id as number

  const { error: delLines } = await supabase.from('approval_lines').delete().eq('approval_doc_id', docId)
  if (delLines) throw delLines
  const { error: delParts } = await supabase.from('approval_participants').delete().eq('approval_doc_id', docId)
  if (delParts) throw delParts

  const participants = normalizeParticipants(
    approvalOrder.map((line) => ({ role: line.role, userId: line.userId }))
  )
  const linesToInsert = buildApprovalLines(docId, participants)
  const participantRows = buildApprovalParticipantsRows(docId, participants)

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
    approval_doc_id: docId,
    actor_id: writerId,
    action_type: 'submit',
    action_comment: '기안서 상신',
    action_at: now,
  })

  return { docId, docNo }
}

/**
 * 통합함에서 「수정·재상신」용: 회수 draft / 반려 문서를 새 APP 번호로 상신 상태로 갱신하고 결재선을 교체합니다.
 */
async function promoteResubmitFromComposeDoc(
  input: CreateApprovalDraftInput & { resubmitFromDocId: number }
): Promise<{ docId: number; docNo: string } | null> {
  const {
    supabase,
    resubmitFromDocId,
    writerId,
    docType,
    title,
    content,
    writerDeptId,
    approvalOrder,
    executionStartDate,
    executionEndDate,
    cooperationDept,
    agreementText,
    remarks = '웹 등록 문서',
  } = input

  const { data: head, error: selErr } = await supabase
    .from('approval_docs')
    .select('id, status, remarks, doc_type, writer_id')
    .eq('id', resubmitFromDocId)
    .eq('writer_id', writerId)
    .single()
  if (selErr || !head) return null
  if (head.doc_type === 'outbound_request') return null

  const remarksStr = String(head.remarks ?? '')
  const eligible =
    head.status === 'rejected' ||
    (head.status === 'draft' &&
      (remarksStr.includes(APPROVAL_RECALL_REMARK_MARKER) ||
        remarksStr === WEB_GENERAL_DRAFT_REMARKS ||
        remarksStr === WEB_MODAL_DRAFT_REMARKS ||
        remarksStr === '웹 수정 문서'))
  if (!eligible) return null

  const docNo = await generateNextAppDocNo(supabase as any)
  const now = new Date().toISOString()

  const { data: updated, error: upErr } = await supabase
    .from('approval_docs')
    .update({
      doc_no: docNo,
      doc_type: docType,
      title: title.trim(),
      content: content.trim(),
      dept_id: writerDeptId,
      execution_start_date: executionStartDate || null,
      execution_end_date: executionEndDate || null,
      cooperation_dept: cooperationDept?.trim() || null,
      agreement_text: agreementText?.trim() || null,
      status: 'submitted',
      current_line_no: 1,
      submitted_at: now,
      remarks,
      completed_at: null,
    })
    .eq('id', resubmitFromDocId)
    .eq('writer_id', writerId)
    .in('status', ['draft', 'rejected'])
    .neq('doc_type', 'outbound_request')
    .select('id')
    .maybeSingle()

  if (upErr) throw upErr
  if (!updated?.id) return null

  const docId = updated.id as number

  const { error: delLines } = await supabase.from('approval_lines').delete().eq('approval_doc_id', docId)
  if (delLines) throw delLines
  const { error: delParts } = await supabase.from('approval_participants').delete().eq('approval_doc_id', docId)
  if (delParts) throw delParts

  const participants = normalizeParticipants(
    approvalOrder.map((line) => ({ role: line.role, userId: line.userId }))
  )
  const linesToInsert = buildApprovalLines(docId, participants)
  const participantRows = buildApprovalParticipantsRows(docId, participants)

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
    approval_doc_id: docId,
    actor_id: writerId,
    action_type: 'submit',
    action_comment: '기안서 재상신',
    action_at: now,
  })

  return { docId, docNo }
}

export async function createApprovalDraft(input: CreateApprovalDraftInput): Promise<CreateApprovalDraftResult> {
  const {
    promoteDraftDocId,
    resubmitFromDocId,
    draftRemarksTag = WEB_GENERAL_DRAFT_REMARKS,
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
    remarks,
  } = input

  const baseInsertInput = {
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
    remarks,
  }

  if (resubmitFromDocId != null) {
    const resubmitted = await promoteResubmitFromComposeDoc({
      ...input,
      resubmitFromDocId,
    })
    if (resubmitted) {
      return { ...resubmitted, leftoverDraftIdToDelete: null }
    }
    throw new Error('재상신에 실패했습니다. 문서 상태를 확인한 뒤 다시 시도하세요.')
  }

  if (promoteDraftDocId != null) {
    const promoted = await promoteWebGeneralDraftToSubmitted({
      ...input,
      promoteDraftDocId,
      draftRemarksTag,
    })
    if (promoted) {
      return { ...promoted, leftoverDraftIdToDelete: null }
    }
  }

  const inserted = await insertNewApprovalDocument(baseInsertInput)
  const leftoverDraftIdToDelete = promoteDraftDocId != null ? promoteDraftDocId : null
  return { ...inserted, leftoverDraftIdToDelete }
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

/** 기안지·용지: `departments.id` FK + `app_users.department` 텍스트 + 학생/교사 보조 */
export type WriterDepartmentDisplayUser = {
  dept_id: number | null
  department?: string | null
  user_kind?: string | null
  training_program?: string | null
  school_name?: string | null
  teacher_subject?: string | null
}

/**
 * 부서 표기 단일 규칙 (통합 결재함 `approval_inbox_query` 와 동일한 우선순위):
 * 1) `departments` FK (`docDeptId` → `dept_name`, 문서에 스냅샷된 값)
 * 2) 작성자/사용자 `dept_id` → `departments.dept_name`
 * 3) `app_users.department` 텍스트(관리 화면에서 선택한 부서 라벨 등)
 * 4) 학생/교사 보조 표기
 */
export function formatWriterDepartmentLabel(
  user: WriterDepartmentDisplayUser | undefined,
  deptMap: Map<number, string>,
  options?: { docDeptId?: number | null }
): string {
  const docId = options?.docDeptId
  if (docId != null && Number.isFinite(Number(docId))) {
    const fromDoc = deptMap.get(Number(docId))
    if (fromDoc?.trim()) return fromDoc.trim()
  }
  if (!user) return '—'
  const fromDept = user.dept_id != null ? deptMap.get(user.dept_id) : undefined
  if (fromDept?.trim()) return fromDept.trim()
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

export function buildReferenceSummaryForDraft(
  approvalOrder: Array<{ role: ApprovalRole; userId: string }>,
  users: Array<{ id: string; user_name: string } & WriterDepartmentDisplayUser>,
  deptMap: Map<number, string>
): string {
  return approvalOrder
    .filter((l) => l.role === 'reviewer' && l.userId.trim())
    .map((l) => {
      const u = users.find((x) => x.id === l.userId)
      if (!u) return ''
      const d = formatWriterDepartmentLabel(u, deptMap)
      if (!d || d === '—') return u.user_name ?? ''
      return `${d} ${u.user_name ?? ''}`.trim()
    })
    .filter(Boolean)
    .join(', ')
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

function linesToResubmitApprovalOrder(
  lines: Array<{ line_no: number; approver_id: string; approver_role: string }>
): Array<{ user_id: string; role: string; line_no: number }> {
  const sorted = [...lines].sort((a, b) => a.line_no - b.line_no)
  return sorted.map((l) => {
    const role = normalizeApprovalRole(l.approver_role) ?? 'approver'
    return { user_id: l.approver_id, role, line_no: l.line_no }
  })
}

/** 회수·반려(및 웹 임시) 문서를 `/approvals/new` 작성 폼으로 불러오기 */
export async function fetchApprovalResubmitBundle(
  supabase: SupabaseLike,
  docId: number,
  writerId: string
): Promise<{ doc: Record<string, unknown>; participants: Array<{ user_id: string; role: string; line_no: number }> }> {
  const { data: doc, error } = await supabase
    .from('approval_docs')
    .select('*')
    .eq('id', docId)
    .eq('writer_id', writerId)
    .single()
  if (error || !doc) throw error || new Error('문서를 불러올 수 없습니다')

  const d = doc as Record<string, unknown>
  if (String(d.doc_type ?? '') === 'outbound_request') {
    throw new Error('출고요청은 이 화면에서 열 수 없습니다.')
  }

  const remarksStr = String(d.remarks ?? '')
  const st = String(d.status ?? '')
  const eligible =
    st === 'rejected' ||
    (st === 'draft' &&
      (remarksStr.includes(APPROVAL_RECALL_REMARK_MARKER) ||
        remarksStr === WEB_GENERAL_DRAFT_REMARKS ||
        remarksStr === WEB_MODAL_DRAFT_REMARKS ||
        remarksStr === '웹 수정 문서'))
  if (!eligible) {
    throw new Error('수정·재상신할 수 있는 상태가 아닙니다.')
  }

  const { data: parts, error: pErr } = await supabase
    .from('approval_participants')
    .select('user_id, role, line_no')
    .eq('approval_doc_id', docId)
    .order('line_no')
  if (pErr) throw pErr

  let participants = (parts ?? []) as Array<{ user_id: string; role: string; line_no: number }>
  if (participants.length === 0) {
    const { data: lines, error: lErr } = await supabase
      .from('approval_lines')
      .select('line_no, approver_id, approver_role')
      .eq('approval_doc_id', docId)
      .order('line_no')
    if (lErr) throw lErr
    participants = linesToResubmitApprovalOrder((lines ?? []) as Array<{ line_no: number; approver_id: string; approver_role: string }>)
  }

  return { doc: d, participants }
}
