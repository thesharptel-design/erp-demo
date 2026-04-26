import { describe, expect, it } from 'vitest'
import type { NotificationInboxRow } from '@/components/inbox/types'
import {
  filterNotificationsByInboxTab,
  notificationMatchesInboxTab,
  notificationNavigateHref,
  unreadNotificationsInTab,
} from '@/lib/notification-inbox-tabs'

function row(ev: Partial<NonNullable<NotificationInboxRow['notification_events']>> | null): NotificationInboxRow {
  return {
    id: 'n1',
    user_id: 'u1',
    event_id: 'e1',
    read_at: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    notification_events: ev
      ? {
          id: 'e1',
          title: 't',
          target_url: ev.target_url ?? null,
          category: ev.category ?? '',
          type: ev.type ?? '',
          created_at: '2026-01-01T00:00:00Z',
          payload: ev.payload ?? null,
          app_users: null,
        }
      : null,
  }
}

describe('notificationMatchesInboxTab', () => {
  it('classifies work', () => {
    expect(notificationMatchesInboxTab(row({ category: 'work', type: 'approval_submit' }), 'work')).toBe(true)
    expect(notificationMatchesInboxTab(row({ category: 'board', type: 'board_comment' }), 'work')).toBe(false)
  })

  it('classifies board comment vs reply', () => {
    const c = row({ category: 'board', type: 'board_comment' })
    const r = row({ category: 'board', type: 'board_reply' })
    expect(notificationMatchesInboxTab(c, 'board_comment')).toBe(true)
    expect(notificationMatchesInboxTab(c, 'board_reply')).toBe(false)
    expect(notificationMatchesInboxTab(r, 'board_reply')).toBe(true)
    expect(notificationMatchesInboxTab(r, 'board_comment')).toBe(false)
  })
})

describe('filterNotificationsByInboxTab', () => {
  it('filters by tab', () => {
    const rows = [
      row({ category: 'work', type: 'x' }),
      row({ category: 'board', type: 'board_comment' }),
      row({ category: 'board', type: 'board_reply' }),
    ]
    expect(filterNotificationsByInboxTab(rows, 'work')).toHaveLength(1)
    expect(filterNotificationsByInboxTab(rows, 'board_comment')).toHaveLength(1)
    expect(filterNotificationsByInboxTab(rows, 'board_reply')).toHaveLength(1)
  })
})

describe('unreadNotificationsInTab', () => {
  it('counts unread in tab', () => {
    const a = row({ category: 'work', type: 'a' })
    const b = { ...row({ category: 'work', type: 'b' }), read_at: '2026-01-02T00:00:00Z' } as NotificationInboxRow
    expect(unreadNotificationsInTab([a, b], 'work')).toBe(1)
  })
})

describe('notificationNavigateHref', () => {
  it('returns target_url for work', () => {
    expect(
      notificationNavigateHref(
        row({ category: 'work', type: 'approval_submit', target_url: '/approvals/12' })
      )
    ).toBe('/approvals/12')
  })

  it('appends board-comment hash for board with payload', () => {
    expect(
      notificationNavigateHref(
        row({
          category: 'board',
          type: 'board_reply',
          target_url: '/groupware/board/99',
          payload: { post_id: 99, comment_id: 42, parent_id: 7 },
        })
      )
    ).toBe('/groupware/board/99#board-comment-42')
  })

  it('strips existing hash before appending', () => {
    expect(
      notificationNavigateHref(
        row({
          category: 'board',
          type: 'board_comment',
          target_url: '/groupware/board/1#old',
          payload: { comment_id: 5 },
        })
      )
    ).toBe('/groupware/board/1#board-comment-5')
  })
})
