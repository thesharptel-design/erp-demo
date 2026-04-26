'use client'

import { useId, type RefObject } from 'react'
import { AnchorPanelPortal } from '@/components/inbox/AnchorPanelPortal'
import type { NotificationInboxRow } from '@/components/inbox/types'

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

export function NotificationAnchorPanel({ open, anchorRef, contentAlignRef, onClose, items, loading, onRowClick }: Props) {
  const titleId = useId()

  return (
    <AnchorPanelPortal anchorRef={anchorRef} contentAlignRef={contentAlignRef} open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex max-h-[inherit] flex-col overflow-hidden rounded-2xl">
        <div className="shrink-0 border-b-2 border-black px-3 py-2.5">
          <h2 id={titleId} className="text-sm font-black text-gray-900">
            알림
          </h2>
          <p className="text-[11px] font-bold text-gray-500">클릭 시 읽음 후 이동</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">새 알림이 없습니다.</p>
          ) : (
            <ul className="divide-y-2 divide-gray-100">
              {items.map((row) => {
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
