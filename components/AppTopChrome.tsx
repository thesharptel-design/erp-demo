'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useIdleSession } from '@/components/IdleSessionContext'
import {
  getCurrentUserPermissions,
  hasManagePermission,
  type CurrentUserPermissions,
} from '@/lib/permissions'

type Props = {
  onMenuClick?: () => void
}

function formatRemainingMs(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function AppTopChrome({ onMenuClick }: Props) {
  const router = useRouter()
  const { remainingMs, extendSession, isWarning } = useIdleSession()
  const [user, setUser] = useState<CurrentUserPermissions | null>(null)
  const wasWarningRef = useRef(isWarning)

  useEffect(() => {
    async function loadCurrentUser() {
      const currentUser = await getCurrentUserPermissions()
      setUser(currentUser)
    }
    void loadCurrentUser()
  }, [])

  useEffect(() => {
    if (isWarning && !wasWarningRef.current) {
      toast.warning('곧 유휴 로그아웃됩니다', {
        description: '마우스/키보드 입력 또는 세션 연장 버튼으로 시간을 갱신하세요.',
      })
    }
    wasWarningRef.current = isWarning
  }, [isWarning])

  const permissionLabels = useMemo(() => {
    if (!user) return []
    const labels: string[] = []
    if (hasManagePermission(user, 'can_sales_manage')) labels.push('영업/구매')
    if (hasManagePermission(user, 'can_material_manage')) labels.push('자재/재고')
    if (hasManagePermission(user, 'can_production_manage')) labels.push('생산')
    if (hasManagePermission(user, 'can_qc_manage')) labels.push('품질')
    if (hasManagePermission(user, 'can_manage_master')) labels.push('기준정보')
    if (hasManagePermission(user, 'can_manage_permissions')) labels.push('권한 관리')
    return labels
  }, [user])

  const userKindLabel =
    user?.user_kind === 'student' ? '학생' : user?.user_kind === 'teacher' ? '선생' : '직원'

  const userMetaLabels = useMemo(() => {
    if (!user) return []

    if (user.user_kind === 'student') {
      return [
        user.school_name ? `학교 ${user.school_name}` : null,
        user.grade_level ? `학년 ${user.grade_level}` : null,
        user.major ? `전공 ${user.major}` : null,
      ].filter((label): label is string => Boolean(label))
    }

    if (user.user_kind === 'teacher') {
      return [
        user.school_name ? `학교 ${user.school_name}` : null,
        user.teacher_subject ? `과목 ${user.teacher_subject}` : null,
      ].filter((label): label is string => Boolean(label))
    }

    return [
      user.department ?? null,
      user.job_rank ?? null,
    ].filter((label): label is string => Boolean(label))
  }, [user])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <section
      className={`mb-4 rounded-2xl border-2 bg-white p-2.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:mb-6 sm:p-3 ${
        isWarning ? 'border-amber-500' : 'border-black'
      }`}
      aria-live="polite"
    >
      <div className="flex w-full flex-col gap-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onMenuClick}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-black bg-white text-lg font-black text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] lg:hidden"
                aria-label="메뉴 열기"
              >
                ☰
              </button>
            </div>
            <div className="min-w-0">
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="truncate text-lg font-black tracking-tight text-gray-900 sm:text-xl">
                  {user?.user_name ?? '사용자'}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  {userKindLabel}
                </span>
                {userMetaLabels.map((label) => (
                  <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                    {label}
                  </span>
                ))}
                <span className="max-w-full break-all rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                  {user?.email ?? '이메일 없음'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-4 text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                홈
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-4 text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                로그아웃
              </button>
              <div className="inline-flex h-10 min-w-[156px] items-center justify-between gap-2 rounded-xl border-2 border-gray-300 bg-gray-50 px-3">
                <div className="leading-none">
                  <p className="text-[9px] font-black uppercase tracking-wide text-gray-500">AUTO LOGOUT</p>
                  <p className={`text-sm font-black tracking-tight ${isWarning ? 'text-amber-700' : 'text-gray-900'}`}>
                    {formatRemainingMs(remainingMs)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={extendSession}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-black bg-white text-xs font-black text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-gray-50 active:translate-y-0.5 active:shadow-none"
                  aria-label="세션 연장"
                  title="세션 연장"
                >
                  ↻
                </button>
              </div>
            </div>
          </div>
        </div>

        {isWarning ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
            곧 유휴 로그아웃됩니다. 마우스/키보드 입력 또는 세션 연장 버튼으로 시간을 갱신하세요.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">활성 권한</p>
          <div className="flex flex-wrap gap-2">
            {permissionLabels.length === 0 ? (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">권한 없음</span>
            ) : (
              permissionLabels.map((label) => (
                <span key={label} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                  {label}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
