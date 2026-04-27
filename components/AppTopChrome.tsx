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
  isSystemAdminUser,
  type CurrentUserPermissions,
} from '@/lib/permissions'
import { TopInboxStrip } from '@/components/inbox/TopInboxStrip'

type Props = {
  onMenuClick?: () => void
}

function formatRemainingMs(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function resolveStaffIconByDepartment(department: string | null | undefined): string {
  const dept = String(department ?? '').trim()
  if (!dept) return '👔'
  if (dept.includes('영업') || dept.includes('구매')) return '💼'
  if (dept.includes('여과')) return '🫗'
  if (dept.includes('자재')) return '📦'
  if (dept.includes('생산')) return '🏭'
  if (dept.includes('품질') || dept.toUpperCase().includes('QC')) return '🧪'
  return '👔'
}

function resolveUserIcon(user: CurrentUserPermissions | null): string {
  if (!user) return '👤'
  if (Boolean(user.can_manage_permissions)) return '🛡️'
  if (user.user_kind === 'student') return '🎓'
  if (user.user_kind === 'teacher') return '🧑‍🏫'
  return resolveStaffIconByDepartment(user.department)
}

export default function AppTopChrome({ onMenuClick }: Props) {
  const router = useRouter()
  const { remainingMs, extendSession, isWarning } = useIdleSession()
  const [user, setUser] = useState<CurrentUserPermissions | null>(null)
  const wasWarningRef = useRef(isWarning)
  /** 쪽지/알림 패널을 메인 콘텐츠 우측 라인에 맞출 때 사용 */
  const topChromeAlignRef = useRef<HTMLElement | null>(null)

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
    user?.user_kind === 'student' ? '학생' : user?.user_kind === 'teacher' ? '교사' : '직원'
  const userIcon = resolveUserIcon(user)

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
      ref={topChromeAlignRef}
      className={`mb-3 rounded-2xl border-2 bg-white p-2 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] sm:mb-4 sm:p-2.5 ${
        isWarning ? 'border-amber-500' : 'border-black'
      }`}
      aria-live="polite"
    >
      <div className="flex w-full flex-col gap-2">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          {/* 좌측: 1줄 이름·메타 → 그 아래 활성 권한 */}
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <button
              type="button"
              onClick={onMenuClick}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-white text-base font-black text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] lg:hidden"
              aria-label="메뉴 열기"
            >
              ☰
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-base font-black tracking-tight text-gray-900 sm:text-lg">
                  {userIcon} {user?.user_name ?? '사용자'}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  {userKindLabel}
                </span>
                {userMetaLabels.map((label) => (
                  <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                    {label}
                  </span>
                ))}
                <span className="max-w-full break-all rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
                  {user?.email ?? '이메일 없음'}
                </span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                  사번 {user?.employee_no ?? '-'}
                </span>
              </div>
              {user ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">활성 권한</span>
                  <div className="flex flex-wrap gap-1.5">
                    {permissionLabels.length === 0 ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">권한 없음</span>
                    ) : (
                      permissionLabels.map((label) => (
                        <span key={label} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                          {label}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 우측: 1줄 홈·로그아웃·타이머 → 점선 아래 쪽지·알림 */}
          <div className="flex w-full shrink-0 flex-col items-stretch gap-0 lg:w-auto lg:items-end">
            <div className="flex flex-nowrap items-center justify-end gap-1.5 overflow-x-auto pb-0.5">
              <Link
                href="/dashboard"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-3.5 text-xs font-black text-gray-700 hover:bg-gray-50 sm:px-4 sm:text-sm"
              >
                홈
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border-2 border-gray-300 bg-white px-3.5 text-xs font-black text-gray-700 hover:bg-gray-50 sm:px-4 sm:text-sm"
              >
                로그아웃
              </button>
              <div className="inline-flex h-9 min-w-[140px] shrink-0 items-center justify-between gap-1.5 rounded-lg border-2 border-gray-300 bg-gray-50 px-2.5">
                <div className="leading-none">
                  <p className="text-[8px] font-black uppercase tracking-wide text-gray-500">AUTO LOGOUT</p>
                  <p className={`text-xs font-black tracking-tight sm:text-sm ${isWarning ? 'text-amber-700' : 'text-gray-900'}`}>
                    {formatRemainingMs(remainingMs)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={extendSession}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-black bg-white text-[10px] font-black text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-gray-50 active:translate-y-0.5 active:shadow-none"
                  aria-label="세션 연장"
                  title="세션 연장"
                >
                  ↻
                </button>
              </div>
            </div>
            {user?.id ? (
              <TopInboxStrip
                userId={user.id}
                canSendBroadcast={isSystemAdminUser(user)}
                contentAlignRef={topChromeAlignRef}
              />
            ) : null}
          </div>
        </div>

        {isWarning ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700">
            곧 유휴 로그아웃됩니다. 마우스/키보드 입력 또는 세션 연장 버튼으로 시간을 갱신하세요.
          </p>
        ) : null}
      </div>
    </section>
  )
}
