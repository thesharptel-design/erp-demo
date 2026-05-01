import { describe, expect, it } from 'vitest'
import {
  findLastApproverLineForUser,
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
})
