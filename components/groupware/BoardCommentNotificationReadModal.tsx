'use client'

import { boardCommentNotificationDedupeKey } from '@/lib/board-notification-events'
import { boardAnonymousDisplayName } from '@/lib/groupware-board'
import { notificationReadSummary } from '@/lib/notification-read-stats'
import { supabase } from '@/lib/supabase'
import { useCallback, useEffect, useId, useState } from 'react'

export type NotificationReadStatRow = {
  user_id: string
  user_name: string | null
  read_at: string | null
  notified_at: string
}

type Props = {
  open: boolean
  commentId: number | null
  actorId: string
  postId: string
  anonymousBoard: boolean
  onClose: () => void
}

function formatWhen(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function BoardCommentNotificationReadModal({
  open,
  commentId,
  actorId,
  postId,
  anonymousBoard,
  onClose,
}: Props) {
  const titleId = useId()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<NotificationReadStatRow[]>([])

  const load = useCallback(async () => {
    if (commentId == null) return
    setLoading(true)
    setError('')
    setRows([])
    const dedupe = boardCommentNotificationDedupeKey(commentId)
    const { data: ev, error: evErr } = await supabase
      .from('notification_events')
      .select('id')
      .eq('dedupe_key', dedupe)
      .eq('actor_id', actorId)
      .maybeSingle()
    if (evErr) {
      setError(evErr.message)
      setLoading(false)
      return
    }
    if (!ev?.id) {
      setError('이 댓글로 보낸 알림이 없습니다. (수신 대상이 없으면 알림이 생성되지 않습니다.)')
      setLoading(false)
      return
    }
    const { data, error: rpcErr } = await supabase.rpc('get_notification_event_read_stats', {
      p_event_id: ev.id,
    })
    if (rpcErr) {
      setError(rpcErr.message)
      setLoading(false)
      return
    }
    const list = (data ?? []) as NotificationReadStatRow[]
    setRows(list)
    setLoading(false)
  }, [actorId, commentId])

  useEffect(() => {
    if (!open || commentId == null) return
    void load()
  }, [open, commentId, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || commentId == null) return null

  const { readCount, total } = notificationReadSummary(rows)

  function displayName(row: NotificationReadStatRow) {
    if (anonymousBoard) return boardAnonymousDisplayName(row.user_id, postId)
    return row.user_name?.trim() || '이름 없음'
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b-2 border-black px-4 py-3">
          <div>
            <h2 id={titleId} className="text-sm font-black text-gray-900">
              알림 읽음 확인
            </h2>
            <p className="mt-0.5 text-[11px] font-bold text-gray-500">이 댓글로 발송된 알림 수신자 기준입니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border-2 border-black bg-white px-2 py-1 text-xs font-black text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-50 active:translate-y-0.5 active:shadow-none"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain px-4 py-3">
          {loading ? (
            <p className="py-6 text-center text-xs font-bold text-gray-400">불러오는 중…</p>
          ) : error ? (
            <p className="py-4 text-center text-xs font-bold text-red-700">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-xs font-bold text-gray-400">수신자 정보가 없습니다.</p>
          ) : (
            <>
              <p className="mb-3 text-xs font-black text-gray-700">
                읽음 {readCount} / {total}
              </p>
              <ul className="divide-y-2 divide-gray-100 rounded-xl border-2 border-gray-200">
                {rows.map((row) => (
                  <li key={row.user_id} className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-black text-gray-900">{displayName(row)}</span>
                    <span className={`text-[11px] font-bold ${row.read_at ? 'text-sky-800' : 'text-amber-700'}`}>
                      {row.read_at ? `읽음 ${formatWhen(row.read_at)}` : '미읽음'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
