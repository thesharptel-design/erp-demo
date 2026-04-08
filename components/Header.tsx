'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentUserPermissions, type CurrentUserPermissions } from '@/lib/permissions'

function getRoleLabel(roleName: string) {
  switch (roleName) {
    case 'admin':
      return '관리자'
    case 'sales':
      return '영업'
    case 'purchase':
      return '구매'
    case 'production':
      return '생산'
    case 'approval':
      return '결재'
    default:
      return roleName || '-'
  }
}

function getDeptLabel(roleName: string) {
  switch (roleName) {
    case 'admin':
      return '관리부'
    case 'sales':
      return '영업부'
    case 'purchase':
      return '구매부'
    case 'production':
      return '생산부'
    case 'approval':
      return '결재부'
    default:
      return '부서미정'
  }
}

export default function Header() {
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
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <div>
          <h1 className="text-base font-semibold text-gray-900">교육용 ERP</h1>
          <p className="text-xs text-gray-500">실습용 데모 시스템</p>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="text-right">
              <p className="text-sm font-medium text-gray-800">
                {user.user_name}
              </p>
              <p className="text-xs text-gray-500">
                {getDeptLabel(user.role_name)} / {getRoleLabel(user.role_name)} / {user.login_id}
              </p>
            </div>
          ) : (
            <div className="text-sm text-gray-500">사용자 정보 없음</div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="erp-btn-secondary"
          >
            로그아웃
          </button>
        </div>
      </div>
    </header>
  )
}