import { describe, expect, it } from 'vitest'
import { notificationReadSummary } from '@/lib/notification-read-stats'

describe('notificationReadSummary', () => {
  it('counts only non-empty read_at', () => {
    expect(
      notificationReadSummary([
        { read_at: '2026-01-01T00:00:00Z' },
        { read_at: null },
        { read_at: '' },
      ]),
    ).toEqual({ readCount: 1, total: 3 })
  })

  it('handles empty list', () => {
    expect(notificationReadSummary([])).toEqual({ readCount: 0, total: 0 })
  })
})
