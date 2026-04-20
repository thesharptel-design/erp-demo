import { describe, expect, it } from 'vitest'
import { buildApprovalLines, normalizeParticipants } from '@/lib/approval-participants'

describe('normalizeParticipants', () => {
  it('normalizes legacy role aliases and removes duplicates', () => {
    const participants = normalizeParticipants([
      { userId: 'u1', role: 'review' },
      { userId: 'u1', role: 'reviewer' },
      { userId: 'u2', role: 'approve' },
    ])
    expect(participants).toEqual([
      { userId: 'u1', role: 'reviewer' },
      { userId: 'u2', role: 'final_approver' },
    ])
  })
})

describe('buildApprovalLines', () => {
  it('builds actionable sequence with first pending', () => {
    const lines = buildApprovalLines(10, [
      { userId: 'u1', role: 'reviewer' },
      { userId: 'u2', role: 'reference' },
      { userId: 'u3', role: 'final_approver' },
    ])
    expect(lines).toEqual([
      {
        approval_doc_id: 10,
        line_no: 1,
        approver_id: 'u1',
        approver_role: 'reviewer',
        status: 'pending',
      },
      {
        approval_doc_id: 10,
        line_no: 2,
        approver_id: 'u3',
        approver_role: 'final_approver',
        status: 'waiting',
      },
    ])
  })
})
