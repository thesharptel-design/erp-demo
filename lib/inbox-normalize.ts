import type { MessageInboxRow, NotificationInboxRow } from '@/components/inbox/types'

export function asObject<T extends Record<string, unknown>>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export function normalizeMessageRow(raw: Record<string, unknown>): MessageInboxRow {
  const pm = asObject(raw.private_messages as Record<string, unknown> | Record<string, unknown>[] | null | undefined)
  let senderWrap = pm?.sender as { user_name?: string | null; employee_no?: string | null } | null | undefined
  if (!senderWrap && pm?.app_users) {
    const au = pm.app_users as
      | { user_name?: string | null; employee_no?: string | null }
      | { user_name?: string | null; employee_no?: string | null }[]
      | undefined
    senderWrap = Array.isArray(au) ? au[0] ?? null : au ?? null
  }
  return {
    id: String(raw.id),
    message_id: String(raw.message_id),
    user_id: String(raw.user_id),
    read_at: (raw.read_at as string | null) ?? null,
    archived_at: (raw.archived_at as string | null) ?? null,
    created_at: String(raw.created_at),
    private_messages: pm
      ? {
          id: String(pm.id),
          sender_id: (() => {
            const s = pm.sender_id
            if (s == null || String(s).trim() === '') return null
            return String(s)
          })(),
          subject: String(pm.subject ?? ''),
          body: String(pm.body ?? ''),
          kind: String(pm.kind ?? ''),
          created_at: String(pm.created_at ?? ''),
          app_users: senderWrap
            ? {
                user_name: senderWrap.user_name ?? null,
                employee_no: senderWrap.employee_no != null && String(senderWrap.employee_no).trim() !== '' ? String(senderWrap.employee_no) : null,
              }
            : null,
        }
      : null,
  }
}

export function normalizeNotificationRow(raw: Record<string, unknown>): NotificationInboxRow {
  const ev = asObject(raw.notification_events as Record<string, unknown> | Record<string, unknown>[] | null | undefined)
  let actorWrap = ev?.actor as { user_name?: string | null } | null | undefined
  if (!actorWrap && ev?.app_users) {
    const au = ev.app_users as { user_name?: string | null } | { user_name?: string | null }[] | undefined
    actorWrap = Array.isArray(au) ? au[0] ?? null : au ?? null
  }
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    event_id: String(raw.event_id),
    read_at: (raw.read_at as string | null) ?? null,
    archived_at: (raw.archived_at as string | null) ?? null,
    created_at: String(raw.created_at),
    notification_events: ev
      ? {
          id: String(ev.id),
          title: String(ev.title ?? ''),
          target_url: (ev.target_url as string | null) ?? null,
          category: String(ev.category ?? ''),
          type: String(ev.type ?? ''),
          created_at: String(ev.created_at ?? ''),
          payload: (() => {
            const p = ev.payload
            if (p == null) return null
            if (typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
            return null
          })(),
          app_users: actorWrap ? { user_name: actorWrap.user_name ?? null } : null,
        }
      : null,
  }
}

export function mergeInboxByCreatedDesc<T extends { id: string; created_at: string }>(prev: T[], row: T): T[] {
  const rest = prev.filter((r) => r.id !== row.id)
  return [row, ...rest].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
