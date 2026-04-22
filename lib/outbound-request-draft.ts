import { generateNextDroDocNo } from '@/lib/approval-doc-no'
import { deleteWebGeneralDraft, getApprovalCreateErrorMessage } from '@/lib/approval-draft'
import type { ApprovalRole } from '@/lib/approval-roles'
import {
  buildApprovalLines,
  buildApprovalParticipantsRows,
  normalizeParticipants,
} from '@/lib/approval-participants'
import { plainTextFromHtml } from '@/lib/html-content'

type SupabaseLike = {
  from: (table: string) => any
}

/** 출고요청 웹 임시저장(approval_docs.remarks + status=draft) 구분 */
export const WEB_OUTBOUND_DRAFT_REMARKS = 'web_outbound_draft_v1'

export { getApprovalCreateErrorMessage as getOutboundApprovalCreateErrorMessage }

export type OutboundRequestLineInput = {
  item_id: number
  qty: number
}

export type CreateOutboundRequestApprovalInput = {
  supabase: SupabaseLike
  title: string
  content: string
  writerId: string
  writerDeptId: number | null
  warehouseId: number
  itemLines: OutboundRequestLineInput[]
  approvalOrder: Array<{ role: ApprovalRole; userId: string }>
  executionStartDate?: string
  executionEndDate?: string
  cooperationDept?: string
  agreementText?: string
  mode: 'draft' | 'submit'
  /** approval_docs.remarks */
  remarks?: string
}

export type SyncOutboundWebDraftInput = {
  supabase: SupabaseLike
  draftDocId: number | null
  title: string
  content: string
  writerId: string
  writerDeptId: number | null
  warehouseId: number
  itemLines: OutboundRequestLineInput[]
  approvalOrder: Array<{ role: ApprovalRole; userId: string }>
  executionStartDate?: string
  executionEndDate?: string
  cooperationDept?: string
  agreementText?: string
  remarksTag?: string
}

/**
 * 출고요청 + 결재 마스터(approval_docs doc_type=outbound_request) + 결재선 + 품목행을 한 번에 생성합니다.
 */
export async function createOutboundRequestApproval(input: CreateOutboundRequestApprovalInput) {
  const {
    supabase,
    title,
    content,
    writerId,
    writerDeptId,
    warehouseId,
    itemLines,
    approvalOrder,
    executionStartDate,
    executionEndDate,
    cooperationDept,
    agreementText,
    mode,
    remarks = '웹 출고요청',
  } = input

  const docNo = await generateNextDroDocNo(supabase as any)
  const now = new Date().toISOString()
  const isSubmit = mode === 'submit'
  const purposePlain = plainTextFromHtml(content).slice(0, 4000) || title.trim()

  const { data: docData, error: docError } = await supabase
    .from('approval_docs')
    .insert({
      doc_no: docNo,
      doc_type: 'outbound_request',
      title: title.trim(),
      content: content.trim(),
      writer_id: writerId,
      dept_id: writerDeptId,
      execution_start_date: executionStartDate || null,
      execution_end_date: executionEndDate || null,
      cooperation_dept: cooperationDept?.trim() || null,
      agreement_text: agreementText?.trim() || null,
      status: isSubmit ? 'submitted' : 'draft',
      current_line_no: isSubmit ? 1 : null,
      drafted_at: now,
      submitted_at: isSubmit ? now : null,
      remarks,
    })
    .select('id')
    .single()

  if (docError || !docData) throw docError || new Error('문서 생성 실패')

  const docId = docData.id as number

  const participants = normalizeParticipants(
    approvalOrder.map((line) => ({ role: line.role, userId: line.userId }))
  )
  let linesToInsert = buildApprovalLines(docId, participants)
  if (!isSubmit) {
    linesToInsert = linesToInsert.map((line) => ({ ...line, status: 'waiting' as const }))
  }
  const participantRows = buildApprovalParticipantsRows(docId, participants)

  if (linesToInsert.length > 0) {
    const { error: linesError } = await supabase.from('approval_lines').insert(linesToInsert)
    if (linesError) throw linesError
  }
  if (participantRows.length > 0) {
    const { error: participantsError } = await supabase.from('approval_participants').insert(participantRows)
    if (participantsError) throw participantsError
  }

  const reqDate = now.slice(0, 10)
  const { data: reqRow, error: reqError } = await supabase
    .from('outbound_requests')
    .insert({
      req_no: docNo,
      req_date: reqDate,
      requester_id: writerId,
      purpose: purposePlain,
      remarks: null,
      status: isSubmit ? 'submitted' : 'draft',
      approval_doc_id: docId,
      warehouse_id: warehouseId,
      outbound_completed: false,
    })
    .select('id')
    .single()

  if (reqError || !reqRow) throw reqError || new Error('출고요청 본문 생성 실패')

  const reqId = reqRow.id as number
  if (itemLines.length > 0) {
    const itemInserts = itemLines.map((row, idx) => ({
      outbound_request_id: reqId,
      line_no: idx + 1,
      item_id: row.item_id,
      qty: row.qty,
    }))
    const { error: itemError } = await supabase.from('outbound_request_items').insert(itemInserts)
    if (itemError) throw itemError
  }

  if (isSubmit) {
    await supabase.from('approval_histories').insert({
      approval_doc_id: docId,
      actor_id: writerId,
      action_type: 'submit',
      action_comment: '출고요청 상신',
      action_at: now,
    })
  }

  return { docId, docNo, outboundRequestId: reqId }
}

async function upsertOutboundRequestItems(
  supabase: SupabaseLike,
  outboundRequestId: number,
  itemLines: OutboundRequestLineInput[]
) {
  const { error: del } = await supabase.from('outbound_request_items').delete().eq('outbound_request_id', outboundRequestId)
  if (del) throw del
  if (itemLines.length === 0) return
  const rows = itemLines.map((row, idx) => ({
    outbound_request_id: outboundRequestId,
    line_no: idx + 1,
    item_id: row.item_id,
    qty: row.qty,
  }))
  const { error: ins } = await supabase.from('outbound_request_items').insert(rows)
  if (ins) throw ins
}

/**
 * 출고요청 웹 임시저장: approval_docs(draft) + outbound_requests + 품목 + 결재선 동기화
 */
export async function syncOutboundWebDraft(input: SyncOutboundWebDraftInput): Promise<{ draftDocId: number }> {
  const {
    supabase,
    draftDocId,
    title,
    content,
    writerId,
    writerDeptId,
    warehouseId,
    itemLines,
    approvalOrder,
    executionStartDate,
    executionEndDate,
    cooperationDept,
    agreementText,
    remarksTag = WEB_OUTBOUND_DRAFT_REMARKS,
  } = input

  const participants = normalizeParticipants(
    approvalOrder.map((line) => ({ role: line.role, userId: line.userId }))
  )
  const now = new Date().toISOString()
  const titleForRow = title.trim() || '(제목 없음)'
  const contentForRow = content.trim() || ''
  const purposePlain = plainTextFromHtml(contentForRow).slice(0, 4000) || titleForRow
  const reqDate = now.slice(0, 10)

  let docId = draftDocId

  if (!docId) {
    const docNo = `DRAFT-${crypto.randomUUID().replace(/-/g, '').slice(0, 28)}`
    const { data: inserted, error } = await supabase
      .from('approval_docs')
      .insert({
        doc_no: docNo,
        doc_type: 'outbound_request',
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

    const { data: reqIns, error: reqErr } = await supabase
      .from('outbound_requests')
      .insert({
        req_no: docNo,
        req_date: reqDate,
        requester_id: writerId,
        purpose: purposePlain,
        remarks: null,
        status: 'draft',
        approval_doc_id: docId,
        warehouse_id: warehouseId,
        outbound_completed: false,
      })
      .select('id')
      .single()
    if (reqErr || !reqIns) throw reqErr || new Error('출고요청 임시 본문 생성 실패')

    await upsertOutboundRequestItems(supabase, reqIns.id as number, itemLines)

    const linesBuilt = buildApprovalLines(docId, participants).map((line) => ({
      ...line,
      status: 'waiting' as const,
    }))
    const participantRows = buildApprovalParticipantsRows(docId, participants)
    if (linesBuilt.length > 0) {
      const { error: linesError } = await supabase.from('approval_lines').insert(linesBuilt)
      if (linesError) throw linesError
    }
    if (participantRows.length > 0) {
      const { error: participantsError } = await supabase.from('approval_participants').insert(participantRows)
      if (participantsError) throw participantsError
    }
  } else {
    const { error: upErr } = await supabase
      .from('approval_docs')
      .update({
        doc_type: 'outbound_request',
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

    const { data: reqRow, error: reqFetchErr } = await supabase
      .from('outbound_requests')
      .select('id')
      .eq('approval_doc_id', docId)
      .maybeSingle()
    if (reqFetchErr) throw reqFetchErr
    if (!reqRow?.id) throw new Error('연결된 출고요청 행을 찾을 수 없습니다.')

    const { error: reqUp } = await supabase
      .from('outbound_requests')
      .update({
        purpose: purposePlain,
        warehouse_id: warehouseId,
        req_date: reqDate,
      })
      .eq('id', reqRow.id)
    if (reqUp) throw reqUp

    await upsertOutboundRequestItems(supabase, reqRow.id as number, itemLines)

    const { error: delLines } = await supabase.from('approval_lines').delete().eq('approval_doc_id', docId)
    if (delLines) throw delLines
    const { error: delParts } = await supabase.from('approval_participants').delete().eq('approval_doc_id', docId)
    if (delParts) throw delParts

    const linesBuilt = buildApprovalLines(docId, participants).map((line) => ({
      ...line,
      status: 'waiting' as const,
    }))
    const participantRows = buildApprovalParticipantsRows(docId, participants)
    if (linesBuilt.length > 0) {
      const { error: linesError } = await supabase.from('approval_lines').insert(linesBuilt)
      if (linesError) throw linesError
    }
    if (participantRows.length > 0) {
      const { error: participantsError } = await supabase.from('approval_participants').insert(participantRows)
      if (participantsError) throw participantsError
    }
  }

  return { draftDocId: docId as number }
}

export async function deleteWebOutboundDraft(
  supabase: SupabaseLike,
  draftDocId: number,
  writerId: string,
  remarksTag: string = WEB_OUTBOUND_DRAFT_REMARKS
) {
  await deleteWebGeneralDraft(supabase, draftDocId, writerId, remarksTag)
}

export async function listOutboundWebDrafts(
  supabase: SupabaseLike,
  writerId: string,
  remarksTag: string = WEB_OUTBOUND_DRAFT_REMARKS
) {
  const { data, error } = await supabase
    .from('approval_docs')
    .select('id, title, drafted_at, doc_type')
    .eq('writer_id', writerId)
    .eq('status', 'draft')
    .eq('remarks', remarksTag)
    .eq('doc_type', 'outbound_request')
    .order('drafted_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export async function fetchOutboundWebDraftBundle(
  supabase: SupabaseLike,
  draftDocId: number,
  writerId: string,
  remarksTag: string = WEB_OUTBOUND_DRAFT_REMARKS
): Promise<{
  doc: Record<string, unknown>
  participants: Array<{ user_id: string; role: string; line_no: number }>
  outboundRequestId: number
  warehouseId: number
  itemLines: OutboundRequestLineInput[]
}> {
  const { data: doc, error } = await supabase
    .from('approval_docs')
    .select('*')
    .eq('id', draftDocId)
    .eq('writer_id', writerId)
    .eq('status', 'draft')
    .eq('remarks', remarksTag)
    .single()
  if (error || !doc) throw error || new Error('임시 문서를 불러올 수 없습니다')
  if (String((doc as { doc_type?: string }).doc_type) !== 'outbound_request') {
    throw new Error('출고요청 임시문서가 아닙니다.')
  }

  const { data: parts, error: pErr } = await supabase
    .from('approval_participants')
    .select('user_id, role, line_no')
    .eq('approval_doc_id', draftDocId)
    .order('line_no')
  if (pErr) throw pErr

  const { data: reqRow, error: rErr } = await supabase
    .from('outbound_requests')
    .select('id, warehouse_id')
    .eq('approval_doc_id', draftDocId)
    .maybeSingle()
  if (rErr) throw rErr
  if (!reqRow?.id) throw new Error('출고요청 본문을 찾을 수 없습니다.')

  const reqId = reqRow.id as number
  const whId = Number((reqRow as { warehouse_id: number }).warehouse_id)

  const { data: itemRows, error: iErr } = await supabase
    .from('outbound_request_items')
    .select('item_id, qty, line_no')
    .eq('outbound_request_id', reqId)
    .order('line_no')
  if (iErr) throw iErr

  const itemLines: OutboundRequestLineInput[] = (itemRows ?? []).map((r: { item_id: number; qty: number }) => ({
    item_id: Number(r.item_id),
    qty: Number(r.qty),
  }))

  return {
    doc: doc as Record<string, unknown>,
    participants: (parts ?? []) as Array<{ user_id: string; role: string; line_no: number }>,
    outboundRequestId: reqId,
    warehouseId: whId,
    itemLines,
  }
}
