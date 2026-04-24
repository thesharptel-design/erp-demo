'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserPermissions, isSystemAdminUser } from '@/lib/permissions'

type LoginAuditRow = {
  id: number
  email: string | null
  success: boolean
  login_at: string
  ip: string | null
  user_agent: string | null
  app_users?: { user_name: string | null } | null
}

type ActiveSessionRow = {
  id: number
  session_id: string
  user_name: string | null
  email: string | null
  ip: string | null
  last_seen_at: string
  is_online: boolean
  total_active_seconds: number
  today_active_seconds: number
  today_first_login_at: string | null
}

const ONLINE_WINDOW_MS = 150_000

function formatDwellSeconds(raw: number | string | null | undefined): string {
  const sec = Math.max(0, Math.floor(Number(raw ?? 0)))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}시간 ${m}분 ${s}초`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}

function sortActiveDescending(a: ActiveSessionRow, b: ActiveSessionRow) {
  const diff = Number(b.total_active_seconds ?? 0) - Number(a.total_active_seconds ?? 0)
  if (diff !== 0) return diff
  return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
}

export default function LoginAuditPage() {
  const [allowed, setAllowed] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [rows, setRows] = useState<LoginAuditRow[]>([])
  const [activeSessions, setActiveSessions] = useState<ActiveSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [wallClockMs, setWallClockMs] = useState(() => Date.now())

  const normalizeRows = useCallback((data: unknown): LoginAuditRow[] => {
    const arr = Array.isArray(data) ? (data as Array<LoginAuditRow & { app_users?: { user_name: string | null }[] | null }>) : []
    return arr.map((row) => {
      const appUsers = Array.isArray(row.app_users) ? row.app_users[0] ?? null : row.app_users ?? null
      return { ...row, app_users: appUsers }
    })
  }, [])

  const normalizeSessionRow = useCallback((row: Record<string, unknown>): ActiveSessionRow => {
    return {
      id: Number(row.id),
      session_id: String(row.session_id ?? ''),
      user_name: (row.user_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      ip: (row.ip as string | null) ?? null,
      last_seen_at: String(row.last_seen_at ?? ''),
      is_online: Boolean(row.is_online),
      total_active_seconds: Number(row.total_active_seconds ?? 0),
      today_active_seconds: Number(row.today_active_seconds ?? 0),
      today_first_login_at: (row.today_first_login_at as string | null) ?? null,
    }
  }, [])

  const mergeActiveFromPayload = useCallback(
    (prev: ActiveSessionRow[], payload: { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const ev = payload.eventType
      if (ev === 'DELETE') {
        const id = Number((payload.old as { id?: number })?.id)
        if (!Number.isFinite(id)) return prev
        return prev.filter((s) => s.id !== id)
      }
      if (ev === 'INSERT' || ev === 'UPDATE') {
        const raw = payload.new
        if (!raw || raw.id == null) return prev
        const row = normalizeSessionRow(raw)
        const others = prev.filter((s) => s.id !== row.id)
        return [...others, row].sort(sortActiveDescending)
      }
      return prev
    },
    [normalizeSessionRow]
  )

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUserPermissions()
      setAllowed(isSystemAdminUser(user))
      setPermissionChecked(true)
    })()
  }, [])

  useEffect(() => {
    if (!permissionChecked || !allowed) return
    let cancelled = false

    const fetchInitial = async () => {
      setLoading(true)
      const [auditRes, sessionRes] = await Promise.all([
        supabase
          .from('login_audit_logs')
          .select('id, email, success, login_at, ip, user_agent, app_users:user_id(user_name)')
          .order('login_at', { ascending: false })
          .limit(200),
        supabase
          .from('active_user_sessions')
          .select(
            'id, session_id, user_name, email, ip, last_seen_at, is_online, total_active_seconds, today_active_seconds, today_first_login_at'
          )
          .order('total_active_seconds', { ascending: false })
          .order('last_seen_at', { ascending: false })
          .limit(300),
      ])

      if (cancelled) return

      if (!auditRes.error) setRows(normalizeRows(auditRes.data))
      if (!sessionRes.error) {
        const list = ((sessionRes.data as Record<string, unknown>[]) ?? []).map(normalizeSessionRow)
        setActiveSessions([...list].sort(sortActiveDescending))
      }
      setLoading(false)
    }

    void fetchInitial()

    const channel = supabase
      .channel('login-audit-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'login_audit_logs' }, async (payload) => {
        const id = Number((payload.new as { id?: number })?.id)
        if (!Number.isFinite(id)) return
        const { data, error } = await supabase
          .from('login_audit_logs')
          .select('id, email, success, login_at, ip, user_agent, app_users:user_id(user_name)')
          .eq('id', id)
          .single()
        if (error || !data) return
        const row = normalizeRows([data])[0]
        setRows((prev) => {
          const rest = prev.filter((r) => r.id !== row.id)
          return [row, ...rest].slice(0, 200)
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_user_sessions' }, (payload) => {
        setActiveSessions((prev) => mergeActiveFromPayload(prev, payload as { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }))
      })
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [allowed, permissionChecked, mergeActiveFromPayload, normalizeRows, normalizeSessionRow])

  useEffect(() => {
    const onlineTimer = setInterval(() => setNowMs(Date.now()), 30_000)
    const clockTimer = setInterval(() => setWallClockMs(Date.now()), 1000)
    return () => {
      clearInterval(onlineTimer)
      clearInterval(clockTimer)
    }
  }, [])

  const stats = useMemo(() => {
    const successCount = rows.filter((r) => r.success).length
    const failCount = rows.length - successCount
    return { successCount, failCount }
  }, [rows])

  const visibleActiveSessions = useMemo(() => {
    return activeSessions
      .filter((s) => {
        if (!s.is_online) return false
        const ageMs = nowMs - new Date(s.last_seen_at).getTime()
        return ageMs <= ONLINE_WINDOW_MS
      })
      .sort(sortActiveDescending)
  }, [activeSessions, nowMs])

  if (!permissionChecked) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm font-bold text-slate-500">
          권한 확인 중...
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm font-bold text-red-700">
          시스템 관리자만 로그인 모니터 화면을 볼 수 있습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900">로그인 모니터</h1>
        <p className="text-xs text-gray-500 font-bold mt-1">실시간 로그인 성공/실패 감사 로그</p>
      </div>

      <div className="flex gap-3 text-xs font-black">
        <span className="px-3 py-2 rounded-lg bg-green-50 text-green-700 border border-green-200">
          성공 {stats.successCount}
        </span>
        <span className="px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200">
          실패 {stats.failCount}
        </span>
        <span className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
          실시간 접속 {visibleActiveSessions.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-blue-200 bg-white">
        <div className="px-4 py-3 text-sm font-black text-blue-700 border-b border-blue-100">실시간 접속자 모니터</div>
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-blue-50 border-b border-blue-100 text-[11px] font-black text-blue-700 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">사용자</th>
              <th className="px-4 py-3 text-left">이메일</th>
              <th className="px-4 py-3 text-left">IP</th>
              <th className="px-4 py-3 text-left">접속시간</th>
              <th className="px-4 py-3 text-left">현재시간(종료시간)</th>
              <th className="px-4 py-3 text-left">하루총접속시간</th>
              <th className="px-4 py-3 text-left">누적접속시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-50">
            {visibleActiveSessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-bold text-gray-400">
                  실시간 접속자가 없습니다.
                </td>
              </tr>
            ) : (
              visibleActiveSessions.map((session) => (
                <tr key={session.id} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-bold text-gray-900">{session.user_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{session.email ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{session.ip ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {session.today_first_login_at ? new Date(session.today_first_login_at).toLocaleString('ko-KR') : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="text-gray-800 font-medium">{new Date(wallClockMs).toLocaleString('ko-KR')}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      마지막 활동 {new Date(session.last_seen_at).toLocaleString('ko-KR')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-800">{formatDwellSeconds(session.today_active_seconds)}</td>
                  <td className="px-4 py-3 text-gray-800 font-semibold">{formatDwellSeconds(session.total_active_seconds)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-[11px] font-black text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">시각</th>
              <th className="px-4 py-3 text-left">사용자</th>
              <th className="px-4 py-3 text-left">이메일</th>
              <th className="px-4 py-3 text-left">결과</th>
              <th className="px-4 py-3 text-left">IP</th>
              <th className="px-4 py-3 text-left">UA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center font-bold text-gray-400">
                  로딩 중...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center font-bold text-gray-400">
                  로그가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-gray-700">{new Date(row.login_at).toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{row.app_users?.user_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{row.email ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 rounded text-[11px] font-black border ${
                        row.success
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {row.success ? 'SUCCESS' : 'FAIL'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.ip ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[360px] truncate">{row.user_agent ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
