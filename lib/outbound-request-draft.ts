import { generateNextDroDocNo } from '@/lib/approval-doc-no'
import {
  deleteWebGeneralDraft,
  deleteWebGeneralDraftWithRetry,
  getApprovalCreateErrorMessage,
} from '@/lib/approval-draft'
import type { ApprovalRole } from '@/lib/approval-roles'
import {
  buildApprovalLines,
  buildApprovalParticipantsRows,
  normalizeParticipants,
} from '@/lib/approval-participants'
import { plainTextFromHtml } from '@/lib/html-content'
import {
  approvalDocumentInboxPath,
  fanoutWorkApprovalNotificationQuiet,
  workApprovalSubmitDedupeKey,
  type WorkFanoutRpcClient,
} from '@/lib/work-approval-notifications'

type SupabaseLike = {
  from: (table: string) => any
} & WorkFanoutRpcClient

/** 출고요청 웹 임시저장(approval_docs.remarks + status=draft) 구분 */
export const WEB_OUTBOUND_DRAFT_REMARKS = 'web_outbound_draft_v1'

export { getApprovalCreateErrorMessage as getOutboundApprovalCreateErrorMessage }

export type OutboundRequestLineInput = {
  item_id: number
  qty: number
  selected_lot?: string | null
  selected_exp?: string | null
  selected_sn?: string | null
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
  /** `mode: 'submit'`일 때 임시 행을 신규 insert 대신 승격 */
  promoteDraftDocId?: number | null
  /** `promoteDraftDocId` 검증용 — `syncOutboundWebDraft`의 `remarksTag`와 동일 */
  draftRemarksTag?: string
  /** 통합함 「수정·재상신」으로 기존 회수/반려 출고문서를 같은 행에서 재상신 */
  resubmitFromDocId?: number | null
}

export type CreateOutboundRequestApprovalResult = {
  docId: number
  docNo: string
  outboundRequestId: number
  leftoverDraftIdToDelete: number | null
}

/** `lib/approval-status` `APPROVAL_RECALL_REMARK_MARKER`와 동일 — 순환 import 방지 */
const APPROVAL_RECALL_REMARK_MARKER = '기안 회수됨'

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

async function insertNewOutboundRequestApprovalBundle(
  input: CreateOutboundRequestApprovalInput
): Promise<{ docId: number; docNo: string; outboundRequestId: number }> {
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
      remarks:
        row.selected_lot || row.selected_exp || row.selected_sn
          ? JSON.stringify({
              selected_lot: row.selected_lot ?? null,
              selected_exp: row.selected_exp ?? null,
              selected_sn: row.selected_sn ?? null,
            })
          : null,
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
    fanoutWorkApprovalNotificationQuiet(supabase, {
      actorId: writerId,
      approvalDocId: docId,
      recipientMode: 'pending_lines',
      type: 'outbound_request_submit',
      title: `출고요청 결재 대기: ${title.trim()}`,
      targetUrl: approvalDocumentInboxPath(docId),
      dedupeKey: workApprovalSubmitDedupeKey(docId, docNo),
      payload: { approval_doc_id: docId, doc_type: 'outbound_request' },
    })
  }

  return { docId, docNo, outboundRequestId: reqId }
}

async function promoteOutboundWebDraftToSubmitted(
  input: CreateOutboundRequestApprovalInput & { promoteDraftDocId: number; draftRemarksTag: string }
): Promise<{ docId: number; docNo: string; outboundRequestId: number } | null> {
  const {
    supabase,
    promoteDraftDocId,
    draftRemarksTag,
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
    remarks = '웹 출고요청',
  } = input

  const docNo = await generateNextDroDocNo(supabase as any)
  const now = new Date().toISOString()
  const purposePlain = plainTextFromHtml(content).slice(0, 4000) || title.trim()
  const reqDate = now.slice(0, 10)

  const { data: updated, error: upErr } = await supabase
    .from('approval_docs')
    .update({
      doc_no: docNo,
      doc_type: 'outbound_request',
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
    .eq('doc_type', 'outbound_request')
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
    const { error: participantsError } = await supabase.from('approval_participants').insert(participantRows)
    if (participantsError) throw participantsError
  }

  const { data: reqRow, error: reqFetchErr } = await supabase
    .from('outbound_requests')
    .select('id')
    .eq('approval_doc_id', docId)
    .maybeSingle()
  if (reqFetchErr) throw reqFetchErr
  if (!reqRow?.id) throw new Error('연결된 출고요청 행을 찾을 수 없습니다.')

  const reqId = reqRow.id as number

  const { error: reqUp } = await supabase
    .from('outbound_requests')
    .update({
      req_no: docNo,
      req_date: reqDate,
      purpose: purposePlain,
      status: 'submitted',
      warehouse_id: warehouseId,
    })
    .eq('id', reqId)
  if (reqUp) throw reqUp

  await upsertOutboundRequestItems(supabase, reqId, itemLines)

  await supabase.from('approval_histories').insert({
    approval_doc_id: docId,
    actor_id: writerId,
    action_type: 'submit',
    action_comment: '출고요청 상신',
    action_at: now,
  })

  fanoutWorkApprovalNotificationQuiet(supabase, {
    actorId: writerId,
    approvalDocId: docId,
    recipientMode: 'pending_lines',
    type: 'outbound_request_submit',
    title: `출고요청 결재 대기: ${title.trim()}`,
    targetUrl: approvalDocumentInboxPath(docId),
    dedupeKey: workApprovalSubmitDedupeKey(docId, docNo),
    payload: { approval_doc_id: docId, doc_type: 'outbound_request' },
  })

  return { docId, docNo, outboundRequestId: reqId }
}

async function promoteOutboundResubmitFromComposeDoc(
  input: CreateOutboundRequestApprovalInput & { resubmitFromDocId: number }
): Promise<{ docId: number; docNo: string; outboundRequestId: number } | null> {
  const {
    supabase,
    resubmitFromDocId,
    writerId,
    title,
    content,
    writerDeptId,
    warehouseId,
    itemLines,
    approvalOrder,
    executionStartDate,
    executionEndDate,
    cooperationDept,
    agreementText,
    remarks = '웹 출고요청',
  } = input

  const { data: head, error: selErr } = await supabase
    .from('approval_docs')
    .select('id, status, remarks, doc_type, writer_id')
    .eq('id', resubmitFromDocId)
    .eq('writer_id', writerId)
    .single()
  if (selErr || !head) return null
  if (head.doc_type !== 'outbound_request') return null

  const remarksStr = String(head.remarks ?? '')
  const eligible =
    head.status === 'rejected' ||
    (head.status === 'draft' &&
      (remarksStr.includes(APPROVAL_RECALL_REMARK_MARKER) ||
        remarksStr === WEB_OUTBOUND_DRAFT_REMARKS ||
        remarksStr === '웹 출고요청'))
  if (!eligible) return null

  const docNo = await generateNextDroDocNo(supabase as any)
  const now = new Date().toISOString()
  const purposePlain = plainTextFromHtml(content).slice(0, 4000) || title.trim()
  const reqDate = now.slice(0, 10)

  const { data: updated, error: upErr } = await supabase
    .from('approval_docs')
    .update({
      doc_no: docNo,
      doc_type: 'outbound_request',
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
    .eq('doc_type', 'outbound_request')
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
    const { error: participantsError } = await supabase.from('approval_participants').insert(participantRows)
    if (participantsError) throw participantsError
  }

  const { data: reqRow, error: reqFetchErr } = await supabase
    .from('outbound_requests')
    .select('id')
    .eq('approval_doc_id', docId)
    .maybeSingle()
  if (reqFetchErr) throw reqFetchErr
  if (!reqRow?.id) throw new Error('연결된 출고요청 행을 찾을 수 없습니다.')

  const reqId = reqRow.id as number

  const { error: reqUp } = await supabase
    .from('outbound_requests')
    .update({
      req_no: docNo,
      req_date: reqDate,
      purpose: purposePlain,
      status: 'submitted',
      warehouse_id: warehouseId,
    })
    .eq('id', reqId)
  if (reqUp) throw reqUp

  await upsertOutboundRequestItems(supabase, reqId, itemLines)

  await supabase.from('approval_histories').insert({
    approval_doc_id: docId,
    actor_id: writerId,
    action_type: 'submit',
    action_comment: '출고요청 재상신',
    action_at: now,
  })

  fanoutWorkApprovalNotificationQuiet(supabase, {
    actorId: writerId,
    approvalDocId: docId,
    recipientMode: 'pending_lines',
    type: 'outbound_request_resubmit',
    title: `출고요청 결재 대기: ${title.trim()}`,
    targetUrl: approvalDocumentInboxPath(docId),
    dedupeKey: workApprovalSubmitDedupeKey(docId, docNo),
    payload: { approval_doc_id: docId, doc_type: 'outbound_request' },
  })

  return { docId, docNo, outboundRequestId: reqId }
}

/**
 * 출고요청 + 결재 마스터(approval_docs doc_type=outbound_request) + 결재선 + 품목행을 한 번에 생성합니다.
 */
export async function createOutboundRequestApproval(
  input: CreateOutboundRequestApprovalInput
): Promise<CreateOutboundRequestApprovalResult> {
  const {
    mode,
    promoteDraftDocId,
    resubmitFromDocId,
    draftRemarksTag = WEB_OUTBOUND_DRAFT_REMARKS,
  } = input

  if (mode === 'submit' && resubmitFromDocId != null) {
    const resubmitted = await promoteOutboundResubmitFromComposeDoc({
      ...input,
      resubmitFromDocId,
    })
    if (resubmitted) {
      return { ...resubmitted, leftoverDraftIdToDelete: null }
    }
    throw new Error('재상신에 실패했습니다. 문서 상태를 확인한 뒤 다시 시도하세요.')
  }

  if (mode === 'submit' && promoteDraftDocId != null) {
    const promoted = await promoteOutboundWebDraftToSubmitted({
      ...input,
      promoteDraftDocId,
      draftRemarksTag,
    })
    if (promoted) {
      return { ...promoted, leftoverDraftIdToDelete: null }
    }
  }

  const inserted = await insertNewOutboundRequestApprovalBundle(input)
  const leftoverDraftIdToDelete = mode === 'submit' && promoteDraftDocId != null ? promoteDraftDocId : null
  return { ...inserted, leftoverDraftIdToDelete }
}

export async function deleteWebOutboundDraftWithRetry(
  supabase: SupabaseLike,
  draftDocId: number,
  writerId: string,
  remarksTag: string = WEB_OUTBOUND_DRAFT_REMARKS,
  options?: { maxAttempts?: number; baseDelayMs?: number }
) {
  return deleteWebGeneralDraftWithRetry(supabase, draftDocId, writerId, remarksTag, options)
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
    remarks:
      row.selected_lot || row.selected_exp || row.selected_sn
        ? JSON.stringify({
            selected_lot: row.selected_lot ?? null,
            selected_exp: row.selected_exp ?? null,
            selected_sn: row.selected_sn ?? null,
          })
        : null,
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
    .select('item_id, qty, line_no, remarks')
    .eq('outbound_request_id', reqId)
    .order('line_no')
  if (iErr) throw iErr

  const itemLines: OutboundRequestLineInput[] = (itemRows ?? []).map(
    (r: { item_id: number; qty: number; remarks?: string | null }) => {
      let selectedLot: string | null = null
      let selectedExp: string | null = null
      let selectedSn: string | null = null
      try {
        if (r.remarks) {
          const parsed = JSON.parse(r.remarks) as {
            selected_lot?: unknown
            selected_exp?: unknown
            selected_sn?: unknown
          }
          selectedLot = typeof parsed.selected_lot === 'string' ? parsed.selected_lot : null
          selectedExp = typeof parsed.selected_exp === 'string' ? parsed.selected_exp : null
          selectedSn = typeof parsed.selected_sn === 'string' ? parsed.selected_sn : null
        }
      } catch {
        // ignore legacy/non-JSON remarks
      }
      return {
        item_id: Number(r.item_id),
        qty: Number(r.qty),
        selected_lot: selectedLot,
        selected_exp: selectedExp,
        selected_sn: selectedSn,
      }
    }
  )

  return {
    doc: doc as Record<string, unknown>,
    participants: (parts ?? []) as Array<{ user_id: string; role: string; line_no: number }>,
    outboundRequestId: reqId,
    warehouseId: whId,
    itemLines,
  }
}

export async function fetchOutboundResubmitBundle(
  supabase: SupabaseLike,
  resubmitDocId: number,
  writerId: string
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
    .eq('id', resubmitDocId)
    .eq('writer_id', writerId)
    .eq('doc_type', 'outbound_request')
    .single()
  if (error || !doc) throw error || new Error('재상신 문서를 불러올 수 없습니다')

  const status = String((doc as { status?: string }).status ?? '')
  const remarks = String((doc as { remarks?: string | null }).remarks ?? '')
  const eligible =
    status === 'rejected' ||
    (status === 'draft' &&
      (remarks.includes(APPROVAL_RECALL_REMARK_MARKER) ||
        remarks === WEB_OUTBOUND_DRAFT_REMARKS ||
        remarks === '웹 출고요청'))
  if (!eligible) {
    throw new Error('회수·반려된 출고 문서만 수정·재상신할 수 있습니다.')
  }

  const { data: parts, error: pErr } = await supabase
    .from('approval_participants')
    .select('user_id, role, line_no')
    .eq('approval_doc_id', resubmitDocId)
    .order('line_no')
  if (pErr) throw pErr

  const { data: reqRow, error: rErr } = await supabase
    .from('outbound_requests')
    .select('id, warehouse_id')
    .eq('approval_doc_id', resubmitDocId)
    .maybeSingle()
  if (rErr) throw rErr
  if (!reqRow?.id) throw new Error('출고요청 본문을 찾을 수 없습니다.')

  const reqId = reqRow.id as number
  const whId = Number((reqRow as { warehouse_id: number }).warehouse_id)

  const { data: itemRows, error: iErr } = await supabase
    .from('outbound_request_items')
    .select('item_id, qty, line_no, remarks')
    .eq('outbound_request_id', reqId)
    .order('line_no')
  if (iErr) throw iErr

  const itemLines: OutboundRequestLineInput[] = (itemRows ?? []).map(
    (r: { item_id: number; qty: number; remarks?: string | null }) => {
      let selectedLot: string | null = null
      let selectedExp: string | null = null
      let selectedSn: string | null = null
      try {
        if (r.remarks) {
          const parsed = JSON.parse(r.remarks) as {
            selected_lot?: unknown
            selected_exp?: unknown
            selected_sn?: unknown
          }
          selectedLot = typeof parsed.selected_lot === 'string' ? parsed.selected_lot : null
          selectedExp = typeof parsed.selected_exp === 'string' ? parsed.selected_exp : null
          selectedSn = typeof parsed.selected_sn === 'string' ? parsed.selected_sn : null
        }
      } catch {
        // ignore legacy/non-JSON remarks
      }
      return {
        item_id: Number(r.item_id),
        qty: Number(r.qty),
        selected_lot: selectedLot,
        selected_exp: selectedExp,
        selected_sn: selectedSn,
      }
    }
  )

  return {
    doc: doc as Record<string, unknown>,
    participants: (parts ?? []) as Array<{ user_id: string; role: string; line_no: number }>,
    outboundRequestId: reqId,
    warehouseId: whId,
    itemLines,
  }
}
