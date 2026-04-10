'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { getCurrentUserPermissions, type CurrentUserPermissions } from '@/lib/permissions'

type Props = {
  onMenuClick?: () => void
}

export default function Header({ onMenuClick }: Props) {
  const router = useRouter()
  const [user, setUser] = useState<CurrentUserPermissions | null>(null)

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUserPermissions()
      setUser(currentUser)
    }

    loadUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-lg text-gray-700 lg:hidden"
            aria-label="메뉴 열기"
          >
            ☰
          </button>

          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            교육용 ERP
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            홈
          </Link>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-gray-900">
              {user?.user_name ?? '사용자'}
            </p>
            <p className="text-xs text-gray-500">
              {user?.role_name ?? '-'} / {user?.login_id ?? '-'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  )
}