import { describe, expect, it } from 'vitest'
import {
  APPROVAL_DOC_STATUSES,
  APPROVAL_LINE_STATUSES,
  findLastApproverLineForUser,
  getApprovalActionAvailability,
  getApprovalActionLines,
  getApprovalRejectTargets,
  getNextWaitingBeforePost,
  getPendingApprovalWorkflowLine,
  getPostCooperatorWorkflowLines,
  isApprovalActiveDoc,
  isApprovalEffectiveDoc,
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
  })

  it('shows post-confirm only after effective status and marks references as read-only', () => {
    const postConfirm = getApprovalActionAvailability({
      doc: { status: 'effective', writer_id: 'writer' },
      lines,
      currentUserId: 'post',
    })
    expect(postConfirm.canPostConfirm).toBe(true)

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
  })
})
