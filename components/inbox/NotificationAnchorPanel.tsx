'use client'

import { useEffect, useId, useMemo, useState, type RefObject } from 'react'
import { AnchorPanelPortal } from '@/components/inbox/AnchorPanelPortal'
import type { NotificationInboxRow } from '@/components/inbox/types'
import {
  filterNotificationsByInboxTab,
  type NotificationInboxTab,
  unreadNotificationsInTab,
} from '@/lib/notification-inbox-tabs'

type Props = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  contentAlignRef?: RefObject<HTMLElement | null>
  onClose: () => void
  items: NotificationInboxRow[]
  loading: boolean
  onRowClick: (row: NotificationInboxRow) => void
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function categoryLabel(category: string) {
  if (category === 'board') return '게시판'
  if (category === 'work') return '업무'
  return category
}

const TAB_DEFS: { id: NotificationInboxTab; label: string }[] = [
  { id: 'work', label: '업무알림' },
  { id: 'board_comment', label: '댓글 알림' },
  { id: 'board_reply', label: '대댓글 알림' },
]

function tabHint(tab: NotificationInboxTab): string {
  if (tab === 'work') return '결재·참조·협조 등 업무 알림입니다. 클릭 시 읽음 처리 후 기안 문서로 이동합니다.'
  if (tab === 'board_comment') return '내 게시글에 달린 댓글입니다. 클릭 시 읽음 처리 후 해당 글·댓글 위치로 이동합니다.'
  return '내 댓글에 달린 답글입니다. 클릭 시 읽음 처리 후 해당 글·답글 위치로 이동합니다.'
}

export function NotificationAnchorPanel({ open, anchorRef, contentAlignRef, onClose, items, loading, onRowClick }: Props) {
  const titleId = useId()
  const [tab, setTab] = useState<NotificationInboxTab>('work')

  useEffect(() => {
    if (open) setTab('work')
  }, [open])

  const filtered = useMemo(() => filterNotificationsByInboxTab(items, tab), [items, tab])

  return (
    <AnchorPanelPortal anchorRef={anchorRef} contentAlignRef={contentAlignRef} open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex max-h-[inherit] flex-col overflow-hidden rounded-2xl">
        <div className="shrink-0 border-b-2 border-black px-3 py-2.5">
          <h2 id={titleId} className="text-sm font-black text-gray-900">
            알림
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border-2 border-gray-200 bg-gray-50 p-1">
            {TAB_DEFS.map((t) => {
              const unread = unreadNotificationsInTab(items, t.id)
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative rounded-lg px-0.5 py-1.5 text-[9px] font-black leading-tight transition-colors sm:text-[10px] ${
                    active ? 'bg-white text-sky-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <span className="block">{t.label}</span>
                  {unread > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[14px] items-center justify-center rounded-full border border-black bg-rose-500 px-0.5 text-[8px] font-black text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11px] font-bold text-gray-500">{tabHint(tab)}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">이 탭에 표시할 알림이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-sky-200">
              {filtered.map((row) => {
                const ev = row.notification_events
                const actorName = ev?.app_users?.user_name?.trim() || '시스템'
                const unread = !row.read_at
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      className={`flex w-full min-h-[48px] flex-col items-start gap-0.5 px-3 py-3 text-left transition-colors hover:bg-sky-50 active:bg-sky-100 ${
                        unread ? 'bg-sky-50/60' : ''
                      }`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className={`text-xs font-black ${unread ? 'text-sky-900' : 'text-gray-700'}`}>
                          {ev?.title ?? '알림'}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold text-gray-400">{formatWhen(row.created_at)}</span>
                      </span>
                      <span className="text-[11px] font-bold text-gray-500">
                        {categoryLabel(ev?.category ?? '')} · {actorName}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </AnchorPanelPortal>
  )
}
