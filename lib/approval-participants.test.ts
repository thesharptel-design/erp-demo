import { describe, expect, it } from 'vitest'
import {
  buildApprovalLines,
  hasWorkApprovalInboxRecipientPending,
  normalizeParticipants,
} from '@/lib/approval-participants'

describe('normalizeParticipants', () => {
  it('normalizes legacy role aliases, removes duplicates and keeps input order', () => {
    const participants = normalizeParticipants([
      { userId: 'u1', role: 'review' },
      { userId: 'u2', role: 'approve' },
      { userId: 'u1', role: 'reviewer' },
      { userId: 'u3', role: 'post_cooperator' },
    ])
    expect(participants).toEqual([
      { userId: 'u1', role: 'reference' },
      { userId: 'u2', role: 'approver' },
      { userId: 'u3', role: 'post_cooperator' },
    ])
  })
})

describe('buildApprovalLines', () => {
  it('builds actionable sequence with first pending', () => {
    const lines = buildApprovalLines(10, [
      { userId: 'u1', role: 'reference' },
      { userId: 'u2', role: 'pre_cooperator' },
      { userId: 'u3', role: 'approver' },
    ])
    expect(lines).toEqual([
      {
        approval_doc_id: 10,
        line_no: 1,
        approver_id: 'u2',
        approver_role: 'pre_cooperator',
        status: 'pending',
      },
      {
        approval_doc_id: 10,
        line_no: 2,
        approver_id: 'u3',
        approver_role: 'approver',
        status: 'waiting',
      },
    ])
  })
})

describe('hasWorkApprovalInboxRecipientPending', () => {
  it('is false when first pending line is the actor (self first approver)', () => {
    const lines = buildApprovalLines(1, [
      { userId: 'writer', role: 'approver' },
      { userId: 'u2', role: 'approver' },
    ])
    expect(hasWorkApprovalInboxRecipientPending(lines, 'writer')).toBe(false)
  })

  it('is true when first pending line is another user', () => {
    const lines = buildApprovalLines(1, [
      { userId: 'u1', role: 'approver' },
      { userId: 'writer', role: 'approver' },
    ])
    expect(hasWorkApprovalInboxRecipientPending(lines, 'writer')).toBe(true)
  })
})
