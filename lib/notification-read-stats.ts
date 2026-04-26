/** Pure helpers for actor read-receipt UI (board modal, etc.). */

export type ReadAtLike = { read_at: string | null }

export function notificationReadSummary(rows: ReadAtLike[]) {
  const total = rows.length
  const readCount = rows.filter((r) => r.read_at != null && String(r.read_at).trim() !== '').length
  return { readCount, total }
}
