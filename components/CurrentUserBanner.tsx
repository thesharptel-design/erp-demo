'use client'

import { useEffect, useState } from 'react'
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

function getEnabledPermissions(user: CurrentUserPermissions) {
  const result: string[] = []

  if (user.can_quote_create) result.push('견적 등록')
  if (user.can_po_create) result.push('발주 등록')
  if (user.can_receive_stock) result.push('입고 처리')
  if (user.can_prod_complete) result.push('생산 완료')
  if (user.can_approve) result.push('승인 / 반려')
  if (user.can_manage_permissions) result.push('권한 관리')

  return result
}

export default function CurrentUserBanner() {
  const [user, setUser] = useState<CurrentUserPermissions | null>(null)

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUserPermissions()
      setUser(currentUser)
    }
    loadUser()
  }, [])

  if (!user) return null

  const enabledPermissions = getEnabledPermissions(user)

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Current User
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">{user.user_name}</h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {user.login_id}
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              {getRoleLabel(user.role_name)}
            </span>
          </div>
        </div>

        <div className="xl:max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Enabled Permissions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {enabledPermissions.length === 0 ? (
              <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                부여된 처리 권한 없음
              </span>
            ) : (
              enabledPermissions.map((permission) => (
                <span
                  key={permission}
                  className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                >
                  {permission}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}