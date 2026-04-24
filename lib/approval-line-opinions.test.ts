import { describe, expect, it } from 'vitest'
import { selectApprovalOpinionRows } from '@/lib/approval-line-opinions'

describe('selectApprovalOpinionRows', () => {
  const names = new Map<string, string | null | undefined>([
    ['u1', '김결재'],
    ['u2', null],
  ])

  it('keeps only lines with non-empty trimmed opinion, sorted by line_no', () => {
    const rows = selectApprovalOpinionRows(
      [
        {
          id: 2,
          line_no: 2,
          approver_id: 'u1',
          approver_role: 'approver',
          status: 'approved',
          opinion: '  최종 동의합니다. ',
          acted_at: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 1,
          line_no: 1,
          approver_id: 'u2',
          approver_role: 'cooperator',
          status: 'approved',
          opinion: '   ',
          acted_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 3,
          line_no: 3,
          approver_id: 'u1',
          approver_role: 'approver',
          status: 'waiting',
          opinion: null,
          acted_at: null,
        },
      ],
      names
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].lineNo).toBe(2)
    expect(rows[0].body).toBe('최종 동의합니다.')
    expect(rows[0].name).toBe('김결재')
    expect(rows[0].statusLabel).toBe('승인')
  })

  it('uses em dash when user name is missing', () => {
    const rows = selectApprovalOpinionRows(
      [
        {
          id: 1,
          line_no: 1,
          approver_id: 'u2',
          approver_role: 'reviewer',
          status: 'approved',
          opinion: '검토했습니다',
          acted_at: null,
        },
      ],
      names
    )
    expect(rows[0].name).toBe('—')
  })
})
