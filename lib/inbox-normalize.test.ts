import { describe, expect, it } from 'vitest'
import { asObject, mergeInboxByCreatedDesc, normalizeMessageRow, normalizeNotificationRow } from '@/lib/inbox-normalize'

describe('asObject', () => {
  it('returns first element when given a non-empty array', () => {
    expect(asObject([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 })
  })
  it('returns null for empty array', () => {
    expect(asObject([])).toBeNull()
  })
  it('returns the object when given a single object', () => {
    expect(asObject({ x: 1 })).toEqual({ x: 1 })
  })
})

describe('normalizeMessageRow', () => {
  it('maps sender alias to app_users', () => {
    const row = normalizeMessageRow({
      id: 'r1',
      message_id: 'm1',
      user_id: 'u1',
      read_at: null,
      archived_at: null,
      created_at: '2026-01-02T00:00:00Z',
      private_messages: {
        id: 'm1',
        subject: '제목',
        body: '본문',
        kind: 'direct',
        created_at: '2026-01-01T00:00:00Z',
        sender: { user_name: '홍길동' },
      },
    })
    expect(row.private_messages?.app_users?.user_name).toBe('홍길동')
    expect(row.private_messages?.subject).toBe('제목')
  })

  it('accepts app_users instead of sender', () => {
    const row = normalizeMessageRow({
      id: 'r1',
      message_id: 'm1',
      user_id: 'u1',
      read_at: null,
      archived_at: null,
      created_at: '2026-01-02T00:00:00Z',
      private_messages: {
        id: 'm1',
        subject: '',
        body: '',
        kind: 'broadcast',
        created_at: '2026-01-01T00:00:00Z',
        app_users: { user_name: '관리자' },
      },
    })
    expect(row.private_messages?.app_users?.user_name).toBe('관리자')
    expect(row.private_messages?.kind).toBe('broadcast')
  })

  it('handles private_messages as single-element array', () => {
    const row = normalizeMessageRow({
      id: 'r1',
      message_id: 'm1',
      user_id: 'u1',
      read_at: null,
      archived_at: null,
      created_at: '2026-01-02T00:00:00Z',
      private_messages: [{ id: 'm1', subject: 'S', body: 'B', kind: 'direct', created_at: '2026-01-01T00:00:00Z', sender: { user_name: 'A' } }],
    })
    expect(row.private_messages?.id).toBe('m1')
    expect(row.private_messages?.app_users?.user_name).toBe('A')
  })

  it('returns null private_messages when missing', () => {
    const row = normalizeMessageRow({
      id: 'r1',
      message_id: 'm1',
      user_id: 'u1',
      read_at: null,
      archived_at: null,
      created_at: '2026-01-02T00:00:00Z',
    })
    expect(row.private_messages).toBeNull()
  })
})

describe('normalizeNotificationRow', () => {
  it('maps notification_events from single-element array', () => {
    const row = normalizeNotificationRow({
      id: 'n1',
      user_id: 'u1',
      event_id: 'e1',
      read_at: null,
      archived_at: null,
      created_at: '2026-01-03T00:00:00Z',
      notification_events: [
        {
          id: 'e1',
          title: 't',
          target_url: '/x',
          category: 'board',
          type: 'board_reply',
          created_at: '2026-01-03T00:00:00Z',
          app_users: { user_name: 'Actor' },
        },
      ],
    })
    expect(row.notification_events?.type).toBe('board_reply')
    expect(row.notification_events?.app_users?.user_name).toBe('Actor')
  })

  it('maps actor alias to app_users on nested event', () => {
    const row = normalizeNotificationRow({
      id: 'n1',
      user_id: 'u1',
      event_id: 'e1',
      read_at: null,
      archived_at: null,
      created_at: '2026-01-03T00:00:00Z',
      notification_events: {
        id: 'e1',
        title: '게시글에 새 댓글이 있습니다.',
        target_url: '/groupware/board/99',
        category: 'board',
        type: 'board_comment',
        created_at: '2026-01-03T00:00:00Z',
        actor: { user_name: '댓글작성' },
      },
    })
    expect(row.notification_events?.title).toContain('댓글')
    expect(row.notification_events?.target_url).toBe('/groupware/board/99')
    expect(row.notification_events?.app_users?.user_name).toBe('댓글작성')
  })
})

describe('mergeInboxByCreatedDesc', () => {
  it('inserts or replaces and sorts newest first', () => {
    const a = { id: 'a', created_at: '2026-01-01T00:00:00Z' }
    const b = { id: 'b', created_at: '2026-01-03T00:00:00Z' }
    const c = { id: 'c', created_at: '2026-01-02T00:00:00Z' }
    const merged = mergeInboxByCreatedDesc([a, c], b)
    expect(merged.map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('updates existing id in place order', () => {
    const v1 = { id: 'x', created_at: '2026-01-01T00:00:00Z' }
    const v2 = { id: 'x', created_at: '2026-01-05T00:00:00Z' }
    const merged = mergeInboxByCreatedDesc([v1], v2)
    expect(merged).toHaveLength(1)
    expect(merged[0].created_at).toBe('2026-01-05T00:00:00Z')
  })

  /** P4: Realtime UPDATE keeps same inbox id; merge must replace row so unread badge matches read_at. */
  it('replaces same id when only read_at changes (created_at unchanged)', () => {
    type Row = { id: string; created_at: string; read_at: string | null }
    const before: Row = { id: 'n1', created_at: '2026-01-01T12:00:00Z', read_at: null }
    const after: Row = { id: 'n1', created_at: '2026-01-01T12:00:00Z', read_at: '2026-01-01T12:05:00Z' }
    const merged = mergeInboxByCreatedDesc([before], after)
    expect(merged).toHaveLength(1)
    expect(merged[0].read_at).toBe('2026-01-01T12:05:00Z')
  })
})
