import type { NotificationInboxRow } from '@/components/inbox/types'

/** 알림 패널 상단 탭 (쪽지 패널의 MessagePanelTab 과 구분) */
export type NotificationInboxTab = 'work' | 'board_comment' | 'board_reply'

export function notificationMatchesInboxTab(row: NotificationInboxRow, tab: NotificationInboxTab): boolean {
  const ev = row.notification_events
  if (!ev) return false
  if (tab === 'work') return ev.category === 'work'
  if (tab === 'board_comment') return ev.category === 'board' && ev.type === 'board_comment'
  if (tab === 'board_reply') return ev.category === 'board' && ev.type === 'board_reply'
  return false
}

export function filterNotificationsByInboxTab(rows: NotificationInboxRow[], tab: NotificationInboxTab): NotificationInboxRow[] {
  return rows.filter((r) => notificationMatchesInboxTab(r, tab))
}

export function unreadNotificationsInTab(rows: NotificationInboxRow[], tab: NotificationInboxTab): number {
  return filterNotificationsByInboxTab(rows, tab).filter((r) => !r.read_at).length
}

/**
 * 알림 클릭 후 이동할 경로. 업무는 `target_url` 그대로, 게시판 댓글/답글은 `payload.comment_id` 로 앵커.
 */
export function notificationNavigateHref(row: NotificationInboxRow): string | null {
  const ev = row.notification_events
  const raw = (ev?.target_url ?? '').trim()
  if (!raw.startsWith('/')) return null
  if (ev?.category !== 'board') return raw

  const payload = ev.payload
  if (!payload || typeof payload !== 'object') return raw
  const cid = (payload as Record<string, unknown>).comment_id
  const num = typeof cid === 'number' ? cid : typeof cid === 'string' ? parseInt(String(cid), 10) : NaN
  if (!Number.isFinite(num)) return raw

  const path = raw.split('#')[0] ?? raw
  return `${path}#board-comment-${num}`
}
