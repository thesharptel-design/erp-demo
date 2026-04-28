'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MessageAnchorPanel } from '@/components/inbox/MessageAnchorPanel'
import { NotificationAnchorPanel } from '@/components/inbox/NotificationAnchorPanel'
import type { MessageInboxRow, MessageInboxThreadRow, MessagePanelTab, NotificationInboxRow, SentMessageRow } from '@/components/inbox/types'
import { mergeInboxByCreatedDesc, normalizeMessageRow, normalizeNotificationRow } from '@/lib/inbox-normalize'
import {
  getArrivalSoundEnabled,
  getArrivalToastEnabled,
} from '@/lib/inbox-arrival-alarm-prefs'
import { playInboxArrivalChime } from '@/lib/inbox-arrival-chime'
import { notificationNavigateHref } from '@/lib/notification-inbox-tabs'
import { toast } from 'sonner'

const MSG_SELECT = `
  id,
  message_id,
  user_id,
  read_at,
  archived_at,
  created_at,
  private_messages (
    id,
    thread_id,
    sender_id,
    subject,
    body,
    kind,
    created_at,
    sender:app_users!private_messages_sender_id_fkey ( user_name, employee_no )
  )
`

const INBOX_PAGE_SIZE = 30
const INBOX_MAX_FETCH = 200

const NOTIF_SELECT = `
  id,
  user_id,
  event_id,
  read_at,
  archived_at,
  created_at,
  notification_events (
    id,
    title,
    target_url,
    category,
    type,
    payload,
    created_at,
    actor:app_users!notification_events_actor_id_fkey ( user_name )
  )
`

type Panel = 'messages' | 'notifications' | null

type Props = {
  userId: string
  canSendBroadcast?: boolean
  /** 패널 우측을 페이지(상단 크롬) 콘텐츠 우측에 맞출 기준 요소 */
  contentAlignRef?: RefObject<HTMLElement | null>
}

function mapSentRpcRow(raw: Record<string, unknown>): SentMessageRow {
  const pr = raw.primary_recipient_name
  return {
    message_id: String(raw.message_id),
    thread_id: (() => {
      const t = raw.thread_id
      if (t == null || String(t).trim() === '') return null
      return String(t)
    })(),
    subject: String(raw.subject ?? ''),
    body: String(raw.body ?? ''),
    kind: String(raw.kind ?? ''),
    created_at: String(raw.created_at ?? ''),
    recipient_total: Number(raw.recipient_total ?? 0) || 0,
    recipient_read: Number(raw.recipient_read ?? 0) || 0,
    primary_recipient_name: pr == null || pr === '' ? null : String(pr),
    primary_recipient_employee_no: (() => {
      const e = raw.primary_recipient_employee_no
      if (e == null || String(e).trim() === '') return null
      return String(e)
    })(),
    primary_recipient_user_id: (() => {
      const u = raw.primary_recipient_user_id
      if (u == null || String(u).trim() === '') return null
      return String(u)
    })(),
  }
}

export function TopInboxStrip({ userId, canSendBroadcast, contentAlignRef }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const msgBtnRef = useRef<HTMLButtonElement>(null)
  const notifBtnRef = useRef<HTMLButtonElement>(null)
  const prevOpenRef = useRef<Panel>(null)
  const [open, setOpen] = useState<Panel>(null)
  const [messages, setMessages] = useState<MessageInboxRow[]>([])
  const [notifications, setNotifications] = useState<NotificationInboxRow[]>([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [msgLoadingMore, setMsgLoadingMore] = useState(false)
  const [notifLoading, setNotifLoading] = useState(true)
  const [msgTab, setMsgTab] = useState<MessagePanelTab>('inbox')
  const [sentMessages, setSentMessages] = useState<SentMessageRow[]>([])
  const [sentLoading, setSentLoading] = useState(false)
  const [sentLoadingMore, setSentLoadingMore] = useState(false)
  const [inboxLimit, setInboxLimit] = useState(INBOX_PAGE_SIZE)
  const [sentLimit, setSentLimit] = useState(INBOX_PAGE_SIZE)

  const fetchMessages = useCallback(async () => {
    const lim = Math.min(Math.max(inboxLimit, 1), INBOX_MAX_FETCH)
    const { data, error } = await supabase
      .from('private_message_recipients')
      .select(MSG_SELECT)
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(lim)
    if (error) {
      console.warn('inbox messages fetch', error.message)
      setMessages([])
      return
    }
    const rows = ((data as Record<string, unknown>[]) ?? []).map(normalizeMessageRow)
    setMessages(rows)
  }, [userId, inboxLimit])

  const fetchSentMessages = useCallback(async () => {
    const lim = Math.min(Math.max(sentLimit, 1), INBOX_MAX_FETCH)
    const { data, error } = await supabase.rpc('list_sent_private_messages_with_stats', { p_limit: lim })
    if (error) {
      console.warn('sent messages rpc', error.message)
      setSentMessages([])
      return
    }
    const rows = ((data as Record<string, unknown>[]) ?? []).map(mapSentRpcRow)
    setSentMessages(rows)
  }, [sentLimit])

  useEffect(() => {
    setInboxLimit(INBOX_PAGE_SIZE)
    setSentLimit(INBOX_PAGE_SIZE)
  }, [userId])

  useEffect(() => {
    if (prevOpenRef.current === 'messages' && open !== 'messages') {
      setInboxLimit(INBOX_PAGE_SIZE)
      setSentLimit(INBOX_PAGE_SIZE)
    }
    prevOpenRef.current = open
  }, [open])

  useEffect(() => {
    const requestedPanel = searchParams.get('openInbox')
    if (requestedPanel !== 'notifications') return
    setOpen('notifications')

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('openInbox')
    const nextQuery = nextParams.toString()
    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname
    router.replace(nextHref, { scroll: false })
  }, [pathname, router, searchParams])

  const fetchNotifications = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_notifications')
      .select(NOTIF_SELECT)
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.warn('inbox notifications fetch', error.message)
      setNotifications([])
      return
    }
    const rows = ((data as Record<string, unknown>[]) ?? []).map(normalizeNotificationRow)
    setNotifications(rows)
  }, [userId])

  const fetchMessageByRecipientId = useCallback(async (recipientId: string) => {
    const { data, error } = await supabase
      .from('private_message_recipients')
      .select(MSG_SELECT)
      .eq('id', recipientId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return null
    return normalizeMessageRow(data as Record<string, unknown>)
  }, [userId])

  const fetchNotificationById = useCallback(async (nid: string) => {
    const { data, error } = await supabase.from('user_notifications').select(NOTIF_SELECT).eq('id', nid).eq('user_id', userId).maybeSingle()
    if (error || !data) return null
    return normalizeNotificationRow(data as Record<string, unknown>)
  }, [userId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setNotifLoading(true)
      await fetchNotifications()
      if (!cancelled) setNotifLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [fetchNotifications])

  useEffect(() => {
    let cancelled = false
    const isPaging = inboxLimit > INBOX_PAGE_SIZE
    void (async () => {
      if (isPaging) setMsgLoadingMore(true)
      else setMsgLoading(true)
      await fetchMessages()
      if (!cancelled) {
        setMsgLoading(false)
        setMsgLoadingMore(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchMessages, inboxLimit])

  useEffect(() => {
    if (msgTab !== 'sent') return
    let cancelled = false
    const isPaging = sentLimit > INBOX_PAGE_SIZE
    void (async () => {
      if (isPaging) setSentLoadingMore(true)
      else setSentLoading(true)
      await fetchSentMessages()
      if (!cancelled) {
        setSentLoading(false)
        setSentLoadingMore(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchSentMessages, msgTab, sentLimit])

  useEffect(() => {
    const channel = supabase
      .channel(`inbox-top:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'private_message_recipients',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const ev = payload.eventType
          const id =
            ((payload.new as { id?: string } | undefined)?.id as string | undefined) ??
            ((payload.old as { id?: string } | undefined)?.id as string | undefined)
          if (!id) return
          if (ev === 'DELETE') {
            setMessages((prev) => prev.filter((r) => r.id !== id))
            return
          }
          if (ev === 'INSERT' && getArrivalSoundEnabled('message')) {
            playInboxArrivalChime()
          }
          const row = await fetchMessageByRecipientId(id)
          if (!row) {
            setMessages((prev) => prev.filter((r) => r.id !== id))
            return
          }
          if (row.archived_at) {
            setMessages((prev) => prev.filter((r) => r.id !== id))
            return
          }
          if (ev === 'INSERT' && getArrivalToastEnabled('message')) {
            const sub = row.private_messages?.subject?.trim() || '(제목 없음)'
            const from = row.private_messages?.app_users?.user_name?.trim()
            toast.info('새 쪽지', {
              description: from ? `${from} · ${sub}` : sub,
              duration: 5000,
            })
          }
          setMessages((prev) => mergeInboxByCreatedDesc(prev, row))
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const ev = payload.eventType
          const id =
            ((payload.new as { id?: string } | undefined)?.id as string | undefined) ??
            ((payload.old as { id?: string } | undefined)?.id as string | undefined)
          if (!id) return
          if (ev === 'DELETE') {
            setNotifications((prev) => prev.filter((r) => r.id !== id))
            return
          }
          if (ev === 'INSERT' && getArrivalSoundEnabled('notification')) {
            playInboxArrivalChime()
          }
          const row = await fetchNotificationById(id)
          if (!row) {
            setNotifications((prev) => prev.filter((r) => r.id !== id))
            return
          }
          if (row.archived_at) {
            setNotifications((prev) => prev.filter((r) => r.id !== id))
            return
          }
          if (ev === 'INSERT' && getArrivalToastEnabled('notification')) {
            const title = row.notification_events?.title?.trim() || '알림'
            const actor = row.notification_events?.app_users?.user_name?.trim()
            toast.info('새 알림', {
              description: actor ? `${title} · ${actor}` : title,
              duration: 5000,
            })
          }
          setNotifications((prev) => mergeInboxByCreatedDesc(prev, row))
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, fetchMessageByRecipientId, fetchNotificationById])

  const unreadMsg = useMemo(() => messages.filter((m) => !m.read_at).length, [messages])
  const unreadNotif = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications])
  const messageThreads = useMemo<MessageInboxThreadRow[]>(() => {
    const directMap = new Map<string, MessageInboxThreadRow>()
    const rows: MessageInboxThreadRow[] = []
    for (const row of messages) {
      const msg = row.private_messages
      if (!msg) continue
      if (msg.kind === 'broadcast') {
        rows.push({
          thread_key: `broadcast:${row.id}`,
          kind: 'broadcast',
          thread_id: null,
          counterpart_user_id: null,
          counterpart_name: '시스템 공지',
          counterpart_employee_no: null,
          latest_recipient_id: row.id,
          latest_message_id: row.message_id,
          latest_subject: msg.subject ?? '',
          latest_body: msg.body ?? '',
          latest_created_at: row.created_at,
          unread_count: row.read_at ? 0 : 1,
        })
        continue
      }
      const sid = msg.sender_id?.trim()
      const tid = msg.thread_id?.trim()
      if (!sid || !tid) continue
      const got = directMap.get(tid)
      if (got) {
        if (!row.read_at) got.unread_count += 1
        continue
      }
      const name = msg.app_users?.user_name?.trim() || null
      const no = msg.app_users?.employee_no?.trim() || null
      const item: MessageInboxThreadRow = {
        thread_key: `direct:${tid}`,
        kind: 'direct',
        counterpart_user_id: sid,
        counterpart_name: name,
        counterpart_employee_no: no,
        thread_id: tid,
        latest_recipient_id: row.id,
        latest_message_id: row.message_id,
        latest_subject: msg.subject ?? '',
        latest_body: msg.body ?? '',
        latest_created_at: row.created_at,
        unread_count: row.read_at ? 0 : 1,
      }
      directMap.set(tid, item)
      rows.push(item)
    }
    rows.sort((a, b) => new Date(b.latest_created_at).getTime() - new Date(a.latest_created_at).getTime())
    return rows
  }, [messages])
  const sentThreadItems = useMemo<SentMessageRow[]>(() => {
    const directMap = new Map<string, SentMessageRow>()
    const rows: SentMessageRow[] = []
    for (const row of sentMessages) {
      if (row.kind !== 'direct') {
        rows.push(row)
        continue
      }
      const tid = row.thread_id?.trim()
      if (!tid) {
        rows.push(row)
        continue
      }
      if (directMap.has(tid)) {
        continue
      }
      directMap.set(tid, row)
      rows.push(row)
    }
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return rows
  }, [sentMessages])

  const inboxHasMore = messages.length > 0 && messages.length === inboxLimit && inboxLimit < INBOX_MAX_FETCH
  const sentHasMore = sentMessages.length > 0 && sentMessages.length === sentLimit && sentLimit < INBOX_MAX_FETCH

  function toggle(panel: Exclude<Panel, null>) {
    setOpen((prev) => {
      const next = prev === panel ? null : panel
      if (next === null) setMsgTab('inbox')
      return next
    })
  }

  const markInboxThreadRead = useCallback(async (row: MessageInboxThreadRow) => {
    if (row.unread_count <= 0) return
    const now = new Date().toISOString()
    const ids =
      row.kind === 'broadcast'
        ? [row.latest_recipient_id]
        : messages
            .filter(
              (m) =>
                !m.read_at &&
                m.private_messages?.kind === 'direct' &&
                m.private_messages?.thread_id?.trim() === row.thread_id
            )
            .map((m) => m.id)
    if (ids.length === 0) return
    const { error } = await supabase.from('private_message_recipients').update({ read_at: now }).in('id', ids).eq('user_id', userId)
    if (error) {
      console.warn('mark message read', error.message)
      return
    }
    const set = new Set(ids)
    setMessages((prev) => prev.map((r) => (set.has(r.id) ? { ...r, read_at: now } : r)))
  }, [messages, userId])

  const markNotificationReadAndGo = useCallback(
    async (row: NotificationInboxRow) => {
      const target = notificationNavigateHref(row)
      if (!row.read_at) {
        const now = new Date().toISOString()
        const { error } = await supabase.from('user_notifications').update({ read_at: now }).eq('id', row.id).eq('user_id', userId)
        if (error) {
          console.warn('mark notification read', error.message)
          return
        }
        setNotifications((prev) => prev.map((r) => (r.id === row.id ? { ...r, read_at: now } : r)))
      }
      setOpen(null)
      if (target && target.startsWith('/')) {
        router.push(target)
      }
    },
    [userId, router]
  )

  function badge(n: number) {
    if (n <= 0) return null
    const label = n > 99 ? '99+' : String(n)
    return (
      <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full border border-black bg-rose-500 px-0.5 text-[9px] font-black leading-none text-white">
        {label}
      </span>
    )
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-1.5 overflow-visible border-t-2 border-dashed border-gray-200 pt-1.5 pr-1 sm:pr-2 lg:inline-flex lg:w-auto lg:max-w-full lg:flex-nowrap">
      <div className="relative">
        <button
          ref={msgBtnRef}
          type="button"
          onClick={() => toggle('messages')}
          className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-sm font-black text-gray-700 transition-colors hover:bg-gray-50"
          aria-label="쪽지"
          aria-expanded={open === 'messages'}
        >
          ✉️
          {badge(unreadMsg)}
        </button>
      </div>
      <div className="relative">
        <button
          ref={notifBtnRef}
          type="button"
          onClick={() => toggle('notifications')}
          className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-gray-300 bg-white text-sm font-black text-gray-700 transition-colors hover:bg-gray-50"
          aria-label="알림"
          aria-expanded={open === 'notifications'}
        >
          🔔
          {badge(unreadNotif)}
        </button>
      </div>

      <MessageAnchorPanel
        open={open === 'messages'}
        anchorRef={msgBtnRef}
        contentAlignRef={contentAlignRef}
        senderUserId={userId}
        onClose={() => {
          setMsgTab('inbox')
          setOpen(null)
        }}
        tab={msgTab}
        onTabChange={(t) => setMsgTab(t)}
        items={messageThreads}
        loading={msgLoading}
        inboxHasMore={inboxHasMore}
        onLoadMoreInbox={() => setInboxLimit((n) => Math.min(n + INBOX_PAGE_SIZE, INBOX_MAX_FETCH))}
        inboxLoadingMore={msgLoadingMore}
        sentHasMore={sentHasMore}
        onLoadMoreSent={() => setSentLimit((n) => Math.min(n + INBOX_PAGE_SIZE, INBOX_MAX_FETCH))}
        sentLoadingMore={sentLoadingMore}
        onRowClick={(row) => {
          void markInboxThreadRead(row)
        }}
        sentItems={sentThreadItems}
        sentLoading={sentLoading}
        onRefreshSent={() => {
          void fetchSentMessages()
        }}
        canSendBroadcast={canSendBroadcast === true}
        onAfterDirectSend={() => {
          void fetchMessages()
          void fetchSentMessages()
        }}
        onSendBroadcast={
          canSendBroadcast
            ? async ({ subject, body }) => {
                const {
                  data: { session },
                } = await supabase.auth.getSession()
                const token = session?.access_token
                if (!token) return { ok: false, error: '로그인 세션이 없습니다.' }
                const res = await fetch('/api/messages/broadcast', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ subject, body }),
                })
                const json = (await res.json()) as { success?: boolean; error?: string }
                if (!res.ok || !json.success) {
                  return { ok: false, error: json.error ?? `요청 실패 (${res.status})` }
                }
                return { ok: true }
              }
            : undefined
        }
      />
      <NotificationAnchorPanel
        open={open === 'notifications'}
        anchorRef={notifBtnRef}
        contentAlignRef={contentAlignRef}
        onClose={() => setOpen(null)}
        items={notifications}
        loading={notifLoading}
        onRowClick={(row) => {
          void markNotificationReadAndGo(row)
        }}
      />
    </div>
  )
}
