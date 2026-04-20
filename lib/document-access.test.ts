import { describe, expect, it } from 'vitest'
import { canViewApprovalDocument } from '@/lib/document-access'

describe('canViewApprovalDocument', () => {
  it('allows admin', () => {
    expect(
      canViewApprovalDocument({
        userId: 'u1',
        isAdmin: true,
      })
    ).toBe(true)
  })

  it('allows writer', () => {
    expect(
      canViewApprovalDocument({
        userId: 'writer',
        isAdmin: false,
        writerId: 'writer',
      })
    ).toBe(true)
  })

  it('allows participant ids', () => {
    expect(
      canViewApprovalDocument({
        userId: 'u2',
        isAdmin: false,
        writerId: 'u1',
        participantUserIds: ['u2'],
      })
    ).toBe(true)
  })

  it('blocks unrelated users', () => {
    expect(
      canViewApprovalDocument({
        userId: 'u9',
        isAdmin: false,
        writerId: 'u1',
        approvalLineApproverIds: ['u2'],
        participantUserIds: ['u3'],
      })
    ).toBe(false)
  })
})
