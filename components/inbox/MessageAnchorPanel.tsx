'use client'

import { useCallback, useEffect, useId, useState, type RefObject } from 'react'
import { Reply } from 'lucide-react'
import { toast } from 'sonner'
import { AnchorPanelPortal } from '@/components/inbox/AnchorPanelPortal'
import type { MessageInboxRow, MessagePanelTab, MessageRecipientPreview, SentMessageRow } from '@/components/inbox/types'
import {
  searchMessageRecipientCandidates,
  sendDirectPrivateMessage,
  type MessageRecipientPick,
} from '@/lib/private-messages-direct'
import { supabase } from '@/lib/supabase'

type Props = {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  contentAlignRef?: RefObject<HTMLElement | null>
  senderUserId: string
  onClose: () => void
  tab: MessagePanelTab
  onTabChange: (tab: MessagePanelTab) => void
  items: MessageInboxRow[]
  loading: boolean
  onRowClick: (row: MessageInboxRow) => void
  sentItems: SentMessageRow[]
  sentLoading: boolean
  onRefreshSent: () => void
  onAfterDirectSend?: () => void
  canSendBroadcast?: boolean
  onSendBroadcast?: (payload: { subject: string; body: string }) => Promise<{ ok: boolean; error?: string }>
  inboxHasMore?: boolean
  onLoadMoreInbox?: () => void
  inboxLoadingMore?: boolean
  sentHasMore?: boolean
  onLoadMoreSent?: () => void
  sentLoadingMore?: boolean
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

/** 보낸함 제목 한 줄: 1:1 → `제목 to 이름(사번)`, 공지 → 제목만(뱃지는 UI에서) */
function sentHeadline(row: SentMessageRow) {
  const sub = row.subject?.trim() || '(제목 없음)'
  if (row.kind === 'broadcast') return sub
  const name = row.primary_recipient_name?.trim() || '수신자'
  const no = row.primary_recipient_employee_no?.trim()
  return `${sub} to ${name}${no ? `(${no})` : ''}`
}

export function MessageAnchorPanel({
  open,
  anchorRef,
  contentAlignRef,
  senderUserId,
  onClose,
  tab,
  onTabChange,
  items,
  loading,
  onRowClick,
  sentItems,
  sentLoading,
  onRefreshSent,
  onAfterDirectSend,
  canSendBroadcast,
  onSendBroadcast,
  inboxHasMore,
  onLoadMoreInbox,
  inboxLoadingMore,
  sentHasMore,
  onLoadMoreSent,
  sentLoadingMore,
}: Props) {
  const titleId = useId()
  const [expandedSentId, setExpandedSentId] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewRows, setPreviewRows] = useState<MessageRecipientPreview[]>([])
  const [bcSubject, setBcSubject] = useState('')
  const [bcBody, setBcBody] = useState('')
  const [bcBusy, setBcBusy] = useState(false)
  const [bcErr, setBcErr] = useState<string | null>(null)

  const [dmQuery, setDmQuery] = useState('')
  const [dmHits, setDmHits] = useState<MessageRecipientPick[]>([])
  const [dmSearchBusy, setDmSearchBusy] = useState(false)
  const [dmPick, setDmPick] = useState<MessageRecipientPick | null>(null)
  const [dmSubject, setDmSubject] = useState('')
  const [dmBody, setDmBody] = useState('')
  const [dmBusy, setDmBusy] = useState(false)
  const [dmErr, setDmErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setExpandedSentId(null)
      setPreviewRows([])
      setBcErr(null)
      setDmQuery('')
      setDmHits([])
      setDmPick(null)
      setDmSubject('')
      setDmBody('')
      setDmErr(null)
    }
  }, [open])

  useEffect(() => {
    if (tab !== 'sent') {
      setExpandedSentId(null)
      setPreviewRows([])
    }
  }, [tab])

  const beginReplyToInboxSender = useCallback(
    (row: MessageInboxRow) => {
      const pm = row.private_messages
      if (!pm) return
      const sid = pm.sender_id?.trim()
      if (!sid || sid === senderUserId) return
      const name = pm.app_users?.user_name?.trim() || '이름 없음'
      const no = pm.app_users?.employee_no ?? null
      setDmQuery('')
      setDmHits([])
      setDmPick({ id: sid, user_name: name, employee_no: no })
      const sub = (pm.subject ?? '').trim()
      setDmSubject(sub ? `Re: ${sub}` : 'Re: ')
      setDmBody('')
      setDmErr(null)
      onTabChange('compose')
    },
    [senderUserId, onTabChange]
  )

  useEffect(() => {
    if (!open) return
    const q = dmQuery.trim()
    if (q.length < 1) {
      setDmHits([])
      setDmSearchBusy(false)
      return
    }
    setDmSearchBusy(true)
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await searchMessageRecipientCandidates(supabase, q, { excludeUserId: senderUserId, limit: 12 })
        setDmSearchBusy(false)
        if (!res.ok) {
          setDmHits([])
          return
        }
        setDmHits(res.rows)
      })()
    }, 280)
    return () => window.clearTimeout(t)
  }, [dmQuery, open, senderUserId])

  const loadRecipientPreview = useCallback(async (messageId: string) => {
    setPreviewLoading(true)
    setPreviewRows([])
    const { data, error } = await supabase
      .from('private_message_recipients')
      .select(
        `
        id,
        user_id,
        read_at,
        app_users ( user_name, employee_no )
      `
      )
      .eq('message_id', messageId)
      .order('user_id', { ascending: true })
      .limit(100)
    setPreviewLoading(false)
    if (error) {
      console.warn('recipient preview', error.message)
      return
    }
    const rows: MessageRecipientPreview[] = ((data as Record<string, unknown>[]) ?? []).map((raw) => {
      const auRaw = raw.app_users as { user_name?: string | null; employee_no?: string | null } | { user_name?: string | null; employee_no?: string | null }[] | null
      const au = Array.isArray(auRaw) ? auRaw[0] ?? null : auRaw
      return {
        id: String(raw.id),
        user_id: String(raw.user_id),
        read_at: (raw.read_at as string | null) ?? null,
        app_users: au ? { user_name: au.user_name ?? null, employee_no: au.employee_no ?? null } : null,
      }
    })
    setPreviewRows(rows)
  }, [])

  useEffect(() => {
    if (!expandedSentId || tab !== 'sent') return
    const row = sentItems.find((s) => s.message_id === expandedSentId)
    if (row?.kind !== 'broadcast') return
    void loadRecipientPreview(expandedSentId)
  }, [expandedSentId, tab, loadRecipientPreview, sentItems])

  async function handleBroadcastSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!onSendBroadcast) return
    setBcErr(null)
    setBcBusy(true)
    const res = await onSendBroadcast({ subject: bcSubject.trim(), body: bcBody.trim() })
    setBcBusy(false)
    if (!res.ok) {
      setBcErr(res.error ?? '전송에 실패했습니다.')
      return
    }
    setBcSubject('')
    setBcBody('')
    toast.success('전체 공지 쪽지를 보냈습니다.')
    onRefreshSent()
    onTabChange('sent')
  }

  async function handleDirectSubmit(e: React.FormEvent) {
    e.preventDefault()
    setDmErr(null)
    if (!dmPick) {
      setDmErr('받는 사람을 선택하세요.')
      return
    }
    setDmBusy(true)
    const res = await sendDirectPrivateMessage(supabase, {
      senderId: senderUserId,
      recipientUserId: dmPick.id,
      subject: dmSubject,
      body: dmBody,
    })
    setDmBusy(false)
    if (!res.ok) {
      setDmErr(res.message)
      return
    }
    setDmQuery('')
    setDmHits([])
    setDmPick(null)
    setDmSubject('')
    setDmBody('')
    toast.success('쪽지를 보냈습니다.')
    onAfterDirectSend?.()
    onRefreshSent()
    onTabChange('sent')
  }

  function tabHint() {
    if (tab === 'compose') return '1:1 또는 전체 공지(관리자)로 발송합니다.'
    if (tab === 'inbox')
      return '미열람 쪽지는 행을 누르면 내용이 열리고, 보낸 사람에게 읽음으로 표시됩니다.'
    return '내가 보낸 쪽지와 수신자 읽음 현황입니다.'
  }

  const composeForm = (
    <div className="space-y-3 px-3 py-3">
      <form onSubmit={handleDirectSubmit} className="rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 px-3 py-2.5">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-violet-900">1:1 쪽지</p>
        <label className="mb-1 block text-[10px] font-black text-gray-600">받는 사람 검색</label>
        <input
          value={dmQuery}
          onChange={(e) => {
            setDmQuery(e.target.value)
            setDmPick(null)
          }}
          placeholder="이름 또는 사번"
          className="mb-1 w-full rounded-lg border-2 border-black px-2 py-1.5 text-xs font-bold text-gray-900 placeholder:text-gray-400"
          disabled={dmBusy}
          autoComplete="off"
        />
        {dmSearchBusy ? <p className="mb-1 text-[10px] font-bold text-gray-400">검색 중…</p> : null}
        {dmHits.length > 0 && !dmPick ? (
          <ul className="mb-2 max-h-28 overflow-y-auto rounded-lg border border-violet-200 bg-white">
            {dmHits.map((u) => (
              <li key={u.id} className="border-b border-violet-100 last:border-0">
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-2 py-1.5 text-left text-[11px] font-bold hover:bg-violet-100"
                  onClick={() => {
                    setDmPick(u)
                    setDmHits([])
                    setDmQuery('')
                  }}
                >
                  <span className="font-black text-gray-900">{u.user_name?.trim() || '이름 없음'}</span>
                  {u.employee_no ? <span className="text-[10px] text-gray-500">사번 {u.employee_no}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {dmPick ? (
          <p className="mb-2 rounded-lg border border-violet-300 bg-white px-2 py-1 text-[11px] font-black text-violet-900">
            받는 사람: {dmPick.user_name?.trim() || '이름 없음'}
            {dmPick.employee_no ? ` (${dmPick.employee_no})` : ''}
            <button type="button" className="ml-2 text-[10px] font-black text-rose-600 underline" onClick={() => setDmPick(null)}>
              변경
            </button>
          </p>
        ) : null}
        <input
          value={dmSubject}
          onChange={(e) => setDmSubject(e.target.value)}
          placeholder="제목"
          className="mb-1.5 w-full rounded-lg border-2 border-black px-2 py-1.5 text-xs font-bold text-gray-900 placeholder:text-gray-400"
          maxLength={300}
          disabled={dmBusy}
        />
        <textarea
          value={dmBody}
          onChange={(e) => setDmBody(e.target.value)}
          placeholder="내용"
          rows={3}
          className="mb-1.5 w-full resize-none rounded-lg border-2 border-black px-2 py-1.5 text-xs font-bold text-gray-900 placeholder:text-gray-400"
          maxLength={20000}
          disabled={dmBusy}
        />
        {dmErr ? <p className="mb-1 text-[10px] font-black text-rose-600">{dmErr}</p> : null}
        <button
          type="submit"
          disabled={dmBusy}
          className="w-full rounded-xl border-2 border-black bg-violet-200 py-2 text-xs font-black text-violet-950 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-violet-300 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
        >
          {dmBusy ? '전송 중…' : '선택한 사용자에게 보내기'}
        </button>
      </form>

      {canSendBroadcast && onSendBroadcast ? (
        <form onSubmit={handleBroadcastSubmit} className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 px-3 py-2.5">
          <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
            시스템관리자 · 전체 공지 <span className="font-bold normal-case text-amber-800">(전체 전송)</span>
          </p>
          <input
            value={bcSubject}
            onChange={(e) => setBcSubject(e.target.value)}
            placeholder="제목"
            className="mb-1.5 w-full rounded-lg border-2 border-black px-2 py-1.5 text-xs font-bold text-gray-900 placeholder:text-gray-400"
            maxLength={300}
            disabled={bcBusy}
          />
          <textarea
            value={bcBody}
            onChange={(e) => setBcBody(e.target.value)}
            placeholder="내용"
            rows={4}
            className="mb-1.5 w-full resize-none rounded-lg border-2 border-black px-2 py-1.5 text-xs font-bold text-gray-900 placeholder:text-gray-400"
            maxLength={20000}
            disabled={bcBusy}
          />
          {bcErr ? <p className="mb-1 text-[10px] font-black text-rose-600">{bcErr}</p> : null}
          <button
            type="submit"
            disabled={bcBusy}
            className="w-full rounded-xl border-2 border-black bg-amber-200 py-2 text-xs font-black text-amber-950 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-amber-300 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
          >
            {bcBusy ? '전송 중…' : '전체 사용자에게 보내기'}
          </button>
        </form>
      ) : null}
    </div>
  )

  return (
    <AnchorPanelPortal anchorRef={anchorRef} contentAlignRef={contentAlignRef} open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex max-h-[inherit] min-h-0 flex-col overflow-hidden rounded-2xl">
        <div className="shrink-0 border-b-2 border-black px-3 py-2.5">
          <h2 id={titleId} className="text-sm font-black text-gray-900">
            쪽지
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border-2 border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => onTabChange('compose')}
              className={`rounded-lg px-1 py-1.5 text-[10px] font-black leading-tight transition-colors sm:text-[11px] ${
                tab === 'compose' ? 'bg-white text-violet-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              쪽지 보내기
            </button>
            <button
              type="button"
              onClick={() => onTabChange('inbox')}
              className={`rounded-lg px-1 py-1.5 text-[10px] font-black leading-tight transition-colors sm:text-[11px] ${
                tab === 'inbox' ? 'bg-white text-violet-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              받은쪽지
            </button>
            <button
              type="button"
              onClick={() => onTabChange('sent')}
              className={`rounded-lg px-1 py-1.5 text-[10px] font-black leading-tight transition-colors sm:text-[11px] ${
                tab === 'sent' ? 'bg-white text-violet-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              보낸쪽지
            </button>
          </div>
          <p className="mt-1.5 text-[11px] font-bold text-gray-500">{tabHint()}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {tab === 'compose' ? (
            composeForm
          ) : tab === 'inbox' ? (
            <>
              {loading ? (
                <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">불러오는 중…</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">받은 쪽지가 없습니다.</p>
              ) : (
                <ul className="divide-y divide-sky-200">
                  {items.map((row) => {
                    const msg = row.private_messages
                    const senderName = msg?.app_users?.user_name?.trim() || '알 수 없음'
                    const unread = !row.read_at
                    const canReply = Boolean(msg?.sender_id && msg.sender_id !== senderUserId)
                    return (
                      <li key={row.id}>
                        <div
                          className={`flex flex-col gap-1.5 px-3 py-3 transition-colors hover:bg-violet-50/80 active:bg-violet-100 ${
                            unread ? 'bg-violet-50/60' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void Promise.resolve(onRowClick(row))}
                            className="flex w-full flex-col items-start gap-1.5 text-left"
                          >
                            <span className="flex w-full items-center justify-between gap-2">
                              <span className={`text-xs font-black ${unread ? 'text-violet-900' : 'text-gray-700'}`}>
                                {senderName}
                                {msg?.kind === 'broadcast' ? (
                                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                                    공지
                                  </span>
                                ) : null}
                              </span>
                              <span className="shrink-0 text-[10px] font-bold text-gray-400">{formatWhen(row.created_at)}</span>
                            </span>
                            <span className="w-full text-xs font-bold text-gray-800">{msg?.subject?.trim() || '(제목 없음)'}</span>
                            <div className="w-full border-t border-gray-200" aria-hidden />
                          </button>
                          {msg ? (
                            unread ? (
                              <button
                                type="button"
                                onClick={() => void Promise.resolve(onRowClick(row))}
                                className="w-full text-left text-[11px] font-bold leading-relaxed text-sky-800 hover:underline"
                              >
                                클릭하면 내용이 보입니다
                              </button>
                            ) : (
                              <div className="flex w-full items-start gap-2">
                                <button
                                  type="button"
                                  onClick={() => void Promise.resolve(onRowClick(row))}
                                  className="min-w-0 flex-1 whitespace-pre-wrap text-left text-xs font-bold leading-relaxed text-gray-800 hover:underline"
                                >
                                  {msg.body?.trim() ? msg.body : '(내용 없음)'}
                                </button>
                                {canReply ? (
                                  <button
                                    type="button"
                                    title="답장 쓰기"
                                    aria-label="답장 쓰기"
                                    onClick={() => beginReplyToInboxSender(row)}
                                    className="shrink-0 rounded-lg border-2 border-violet-300 bg-violet-50 p-2 text-violet-900 shadow-sm hover:bg-violet-100 active:translate-y-px"
                                  >
                                    <Reply className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                                  </button>
                                ) : null}
                              </div>
                            )
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!loading && items.length > 0 && inboxHasMore && onLoadMoreInbox ? (
                <div className="border-t border-gray-100 px-3 py-2">
                  <button
                    type="button"
                    disabled={inboxLoadingMore}
                    onClick={() => onLoadMoreInbox()}
                    className="w-full rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/50 py-2 text-[11px] font-black text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                  >
                    {inboxLoadingMore ? '불러오는 중…' : '이전 쪽지 더보기'}
                  </button>
                </div>
              ) : null}
            </>
          ) : sentLoading ? (
            <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">불러오는 중…</p>
          ) : sentItems.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs font-bold text-gray-400">보낸 쪽지가 없습니다.</p>
          ) : (
            <>
              <ul className="divide-y divide-sky-200">
                {sentItems.map((row) => {
                  const total = row.recipient_total
                  const read = row.recipient_read
                  const expanded = expandedSentId === row.message_id
                  const isBroadcast = row.kind === 'broadcast'
                  return (
                    <li key={row.message_id} className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 flex-1 text-xs font-black text-gray-900">
                            {isBroadcast ? (
                              <span className="mr-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">
                                공지
                              </span>
                            ) : null}
                            <span className="break-words">{sentHeadline(row)}</span>
                          </span>
                          <span className="shrink-0 text-[10px] font-bold text-gray-400">{formatWhen(row.created_at)}</span>
                        </div>
                        <div className="w-full border-t border-gray-200" aria-hidden />
                        <p className="line-clamp-4 text-[11px] font-bold leading-snug text-gray-700">{row.body || ' '}</p>
                        <p className="text-[10px] font-black text-violet-800">
                          읽음 {read} / 수신 {total}
                          {total > 100 ? ' · 미리보기 최대 100명' : null}
                        </p>
                        {isBroadcast && total > 0 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedSentId(expanded ? null : row.message_id)}
                            className="self-start text-[10px] font-black text-violet-700 underline decoration-2 underline-offset-2 hover:text-violet-900"
                          >
                            {expanded ? '접기' : '수신자 목록'}
                          </button>
                        ) : null}
                        {expanded && isBroadcast ? (
                          previewLoading ? (
                            <p className="py-2 text-[10px] font-bold text-gray-400">불러오는 중…</p>
                          ) : (
                            <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
                              {previewRows.map((pr) => {
                                const name = pr.app_users?.user_name?.trim() || '이름 없음'
                                const no = pr.app_users?.employee_no?.trim()
                                return (
                                  <li key={pr.id} className="flex justify-between gap-2 border-b border-gray-100 py-1 text-[10px] last:border-0">
                                    <span className="min-w-0 truncate font-bold text-gray-800">
                                      {name}
                                      {no ? <span className="ml-1 font-bold text-gray-500">({no})</span> : null}
                                    </span>
                                    <span className={`shrink-0 font-black ${pr.read_at ? 'text-emerald-700' : 'text-rose-600'}`}>
                                      {pr.read_at ? '읽음' : '미확인'}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          )
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {sentHasMore && onLoadMoreSent ? (
                <div className="border-t border-gray-100 px-3 py-2">
                  <button
                    type="button"
                    disabled={sentLoadingMore}
                    onClick={() => onLoadMoreSent()}
                    className="w-full rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/50 py-2 text-[11px] font-black text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                  >
                    {sentLoadingMore ? '불러오는 중…' : '이전 쪽지 더보기'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </AnchorPanelPortal>
  )
}
