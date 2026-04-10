'use client'

import { useEffect, useState } from 'react'
import { getCurrentUserPermissions, type CurrentUserPermissions } from '@/lib/permissions'

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

  const permissionLabels: string[] = []
  if (user.can_quote_create) permissionLabels.push('견적 등록')
  if (user.can_po_create) permissionLabels.push('발주 등록')
  if (user.can_receive_stock) permissionLabels.push('입고 처리')
  if (user.can_prod_complete) permissionLabels.push('생산 완료')
  if (user.can_approve) permissionLabels.push('승인 / 반려')
  if (user.can_manage_permissions) permissionLabels.push('권한 관리')

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:mb-6 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Current User
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-gray-900">
              {user.user_name}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {user.login_id}
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              {user.role_name}
            </span>
          </div>
        </div>

        <div className="min-w-0 lg:max-w-[60%]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Enabled Permissions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {permissionLabels.length === 0 ? (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                권한 없음
              </span>
            ) : (
              permissionLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                >
                  {label}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}