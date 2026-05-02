import { describe, expect, it } from 'vitest'
import {
  APPROVAL_DOC_STATUSES,
  APPROVAL_LINE_STATUSES,
  findLastApproverLineForUser,
  getApprovalActionAvailability,
  getApprovalCancelRequestRecipient,
  getApprovalActionLines,
  getApprovalRejectTargets,
  getFinalApprovalCompletion,
  getNextWaitingBeforePost,
  getPendingApprovalWorkflowLine,
  getPostCooperatorWorkflowLines,
  isApprovalActiveDoc,
  isApprovalEffectiveDoc,
  isApprovalPostConfirmableDoc,
  isApprovalProcessedLine,
  sameApprovalUser,
} from './approval-workflow-v2'

const lines = [
  { id: 1, line_no: 1, approver_id: 'pre', approver_role: 'pre_cooperator', status: 'confirmed' },
  { id: 2, line_no: 2, approver_id: 'a1', approver_role: 'approver', status: 'approved' },
  { id: 3, line_no: 3, approver_id: 'a2', approver_role: 'approver', status: 'pending' },
  { id: 4, line_no: 4, approver_id: 'a3', approver_role: 'approver', status: 'waiting' },
  { id: 5, line_no: 5, approver_id: 'post', approver_role: 'post_cooperator', status: 'waiting' },
  { id: 6, line_no: 6, approver_id: 'ref', approver_role: 'reference', status: 'waiting' },
]

describe('approval-workflow-v2', () => {
  it('classifies document and line states', () => {
    expect(APPROVAL_DOC_STATUSES).toContain('effective')
    expect(APPROVAL_DOC_STATUSES).toContain('closed')
    expect(APPROVAL_LINE_STATUSES).toContain('confirmed')
    expect(APPROVAL_LINE_STATUSES).toContain('skipped')
    expect(isApprovalActiveDoc('submitted')).toBe(true)
    expect(isApprovalActiveDoc('effective')).toBe(false)
    expect(isApprovalEffectiveDoc('effective')).toBe(true)
    expect(isApprovalEffectiveDoc('closed')).toBe(false)
    expect(isApprovalPostConfirmableDoc('closed')).toBe(false)
    expect(isApprovalProcessedLine('confirmed')).toBe(true)
    expect(isApprovalProcessedLine('waiting')).toBe(false)
  })

  it('normalizes user comparison', () => {
    expect(sameApprovalUser('ABC', 'abc')).toBe(true)
    expect(sameApprovalUser('ABC', 'def')).toBe(false)
  })

  it('returns action lines without references', () => {
    expect(getApprovalActionLines(lines).map((line) => line.id)).toEqual([1, 2, 3, 4, 5])
    expect(getPostCooperatorWorkflowLines(lines).map((line) => line.id)).toEqual([5])
  })

  it('finds the current and next workflow lines', () => {
    expect(getPendingApprovalWorkflowLine(lines)?.id).toBe(3)
    expect(getNextWaitingBeforePost(lines, 3)?.id).toBe(4)
    expect(getNextWaitingBeforePost(lines, 4)).toBeNull()
  })

  it('closes immediately when final approval has no post-cooperator, otherwise waits for post confirmation', () => {
    expect(getFinalApprovalCompletion(lines)).toEqual({
      status: 'effective',
      currentLineNo: 5,
      hasPostCooperators: true,
    })
    expect(getFinalApprovalCompletion(lines.filter((line) => line.approver_role !== 'post_cooperator'))).toEqual({
      status: 'closed',
      currentLineNo: null,
      hasPostCooperators: false,
    })
  })

  it('finds final approver authority and reject targets', () => {
    const last = findLastApproverLineForUser(lines, 'A3')
    expect(last?.id).toBe(4)
    expect(findLastApproverLineForUser(lines, 'a2')).toBeNull()
    expect(getApprovalRejectTargets(lines, last).map((line) => line.id)).toEqual([1, 2])
  })

  it('allows writer recall only before any cooperation or approval action is processed', () => {
    const freshLines = [
      { id: 1, line_no: 1, approver_id: 'pre', approver_role: 'pre_cooperator', status: 'pending' },
      { id: 2, line_no: 2, approver_id: 'a1', approver_role: 'approver', status: 'waiting' },
    ]

    const beforeAction = getApprovalActionAvailability({
      doc: { status: 'in_progress', writer_id: 'writer' },
      lines: freshLines,
      currentUserId: 'writer',
    })
    expect(beforeAction.canRecall).toBe(true)
    expect(beforeAction.canRequestCancel).toBe(false)

    const afterAction = getApprovalActionAvailability({
      doc: { status: 'in_progress', writer_id: 'writer' },
      lines: [{ ...freshLines[0], status: 'confirmed' }, { ...freshLines[1], status: 'pending' }],
      currentUserId: 'writer',
    })
    expect(afterAction.canRecall).toBe(false)
    expect(afterAction.canRequestCancel).toBe(true)
  })

  it('targets cancel requests to the actual pending line before falling back to document current line', () => {
    expect(
      getApprovalCancelRequestRecipient({ status: 'in_progress', current_line_no: 99 }, lines)
    ).toEqual({
      recipientMode: 'pending_lines',
      lineNo: 3,
    })

    expect(
      getApprovalCancelRequestRecipient(
        { status: 'in_progress', current_line_no: 4 },
        lines.map((line) => ({ ...line, status: line.status === 'pending' ? 'waiting' : line.status }))
      )
    ).toEqual({
      recipientMode: 'doc_current_line',
      lineNo: 4,
    })

    expect(
      getApprovalCancelRequestRecipient(
        { status: 'in_progress', current_line_no: null },
        lines.map((line) => ({ ...line, status: line.status === 'pending' ? 'waiting' : line.status }))
      )
    ).toBeNull()
  })

  it('keeps pre-cooperators on confirm only while approvers get approval actions', () => {
    const preTurn = getApprovalActionAvailability({
      doc: { status: 'in_progress', writer_id: 'writer' },
      lines: [
        { id: 1, line_no: 1, approver_id: 'pre', approver_role: 'pre_cooperator', status: 'pending' },
        { id: 2, line_no: 2, approver_id: 'a1', approver_role: 'approver', status: 'waiting' },
      ],
      currentUserId: 'pre',
    })
    expect(preTurn.canPreConfirm).toBe(true)
    expect(preTurn.canApprove).toBe(false)
    expect(preTurn.canReject).toBe(false)

    const approverTurn = getApprovalActionAvailability({
      doc: { status: 'in_progress', writer_id: 'writer' },
      lines,
      currentUserId: 'a2',
    })
    expect(approverTurn.canApprove).toBe(true)
    expect(approverTurn.canReject).toBe(true)
    expect(approverTurn.canPreConfirm).toBe(false)
  })

  it('lets final approver override from an active document and blocks original actions after effective', () => {
    const finalApprover = getApprovalActionAvailability({
      doc: { status: 'in_progress', writer_id: 'writer' },
      lines,
      currentUserId: 'a3',
    })
    expect(finalApprover.canOverrideApprove).toBe(true)
    expect(finalApprover.canReject).toBe(true)

    const afterFinalApproval = getApprovalActionAvailability({
      doc: { status: 'effective', writer_id: 'writer' },
      lines: lines.map((line) => ({ ...line, status: line.id === 5 ? 'pending' : line.status })),
      currentUserId: 'a3',
    })
    expect(afterFinalApproval.canOverrideApprove).toBe(false)
    expect(afterFinalApproval.canReject).toBe(false)
    expect(afterFinalApproval.canApprove).toBe(false)
    expect(afterFinalApproval.hasWorkflowAction).toBe(false)
  })

  it('shows post-confirm only after effective status and marks references as read-only', () => {
    const postConfirm = getApprovalActionAvailability({
      doc: { status: 'effective', writer_id: 'writer' },
      lines,
      currentUserId: 'post',
    })
    expect(postConfirm.canPostConfirm).toBe(true)
    expect(postConfirm.hasWorkflowAction).toBe(true)

    const reference = getApprovalActionAvailability({
      doc: { status: 'in_progress', writer_id: 'writer' },
      lines,
      participants: [{ user_id: 'ref', role: 'reference' }],
      currentUserId: 'ref',
    })
    expect(reference.isReferenceOnly).toBe(true)
    expect(reference.canApprove).toBe(false)
    expect(reference.canReject).toBe(false)
    expect(reference.canPostConfirm).toBe(false)
    expect(reference.hasWorkflowAction).toBe(false)
  })

  it('keeps closed documents locked even if a stale post-confirm line is still waiting', () => {
    const stalePostConfirm = getApprovalActionAvailability({
      doc: { status: 'closed', writer_id: 'writer' },
      lines,
      currentUserId: 'post',
    })

    expect(stalePostConfirm.canPostConfirm).toBe(false)
    expect(stalePostConfirm.canApprove).toBe(false)
    expect(stalePostConfirm.canReject).toBe(false)
    expect(stalePostConfirm.hasWorkflowAction).toBe(false)
  })
})
