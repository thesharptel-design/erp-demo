'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  current_path: string | null
  last_seen_at: string
  is_online: boolean
}

const ONLINE_WINDOW_MS = 90_000

export default function LoginAuditPage() {
  const [rows, setRows] = useState<LoginAuditRow[]>([])
  const [activeSessions, setActiveSessions] = useState<ActiveSessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const normalizeRows = (data: unknown): LoginAuditRow[] => {
    const rows = Array.isArray(data) ? (data as Array<LoginAuditRow & { app_users?: { user_name: string | null }[] | null }>) : []
    return rows.map((row) => {
      const appUsers = Array.isArray(row.app_users) ? row.app_users[0] ?? null : row.app_users ?? null
      return { ...row, app_users: appUsers }
    })
  }

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('login_audit_logs')
        .select('id, email, success, login_at, ip, user_agent, app_users:user_id(user_name)')
        .order('login_at', { ascending: false })
        .limit(200)
      setRows(normalizeRows(data))
      const { data: sessionData } = await supabase
        .from('active_user_sessions')
        .select('id, session_id, user_name, email, ip, current_path, last_seen_at, is_online')
        .order('last_seen_at', { ascending: false })
        .limit(300)
      setActiveSessions((sessionData as ActiveSessionRow[]) ?? [])
      setLoading(false)
    }
    void fetchLogs()

    const channel = supabase
      .channel('login-audit-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'login_audit_logs' }, async () => {
        const { data } = await supabase
          .from('login_audit_logs')
          .select('id, email, success, login_at, ip, user_agent, app_users:user_id(user_name)')
          .order('login_at', { ascending: false })
          .limit(200)
        setRows(normalizeRows(data))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'active_user_sessions' }, async () => {
        const { data } = await supabase
          .from('active_user_sessions')
          .select('id, session_id, user_name, email, ip, current_path, last_seen_at, is_online')
          .order('last_seen_at', { ascending: false })
          .limit(300)
        setActiveSessions((data as ActiveSessionRow[]) ?? [])
      })
      .subscribe()

    const fallbackTimer = setInterval(() => {
      void fetchLogs()
    }, 20_000)

    return () => {
      clearInterval(fallbackTimer)
      void supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [])

  const stats = useMemo(() => {
    const successCount = rows.filter((r) => r.success).length
    const failCount = rows.length - successCount
    return { successCount, failCount }
  }, [rows])

  const visibleActiveSessions = useMemo(() => {
    return activeSessions.filter((s) => {
      if (!s.is_online) return false
      const ageMs = nowMs - new Date(s.last_seen_at).getTime()
      return ageMs <= ONLINE_WINDOW_MS
    })
  }, [activeSessions, nowMs])

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900">로그인 감사 모니터링</h1>
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
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-blue-50 border-b border-blue-100 text-[11px] font-black text-blue-700 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">사용자</th>
              <th className="px-4 py-3 text-left">이메일</th>
              <th className="px-4 py-3 text-left">IP</th>
              <th className="px-4 py-3 text-left">현재 메뉴</th>
              <th className="px-4 py-3 text-left">마지막 heartbeat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-50">
            {visibleActiveSessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center font-bold text-gray-400">
                  실시간 접속자가 없습니다.
                </td>
              </tr>
            ) : (
              visibleActiveSessions.map((session) => (
                <tr key={session.id} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-bold text-gray-900">{session.user_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{session.email ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{session.ip ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700">{session.current_path ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(session.last_seen_at).toLocaleTimeString()}</td>
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
                  <td className="px-4 py-3 font-bold text-gray-700">{new Date(row.login_at).toLocaleString()}</td>
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
