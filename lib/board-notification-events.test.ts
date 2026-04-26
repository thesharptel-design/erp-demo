import { describe, expect, it } from 'vitest'
import { boardCommentNotificationDedupeKey } from '@/lib/board-notification-events'

describe('boardCommentNotificationDedupeKey', () => {
  it('matches DB fan-out format board:comment:{id}', () => {
    expect(boardCommentNotificationDedupeKey(42)).toBe('board:comment:42')
    expect(boardCommentNotificationDedupeKey(0)).toBe('board:comment:0')
  })
})
