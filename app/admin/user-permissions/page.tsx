'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type AppUserPermissionRow = {
  id: string
  login_id: string
  user_name: string
  role_name: string
  can_quote_create: boolean
  can_po_create: boolean
  can_receive_stock: boolean
  can_prod_complete: boolean
  can_approve: boolean
  can_manage_permissions: boolean
}

type PermissionField =
  | 'can_quote_create'
  | 'can_po_create'
  | 'can_receive_stock'
  | 'can_prod_complete'
  | 'can_approve'
  | 'can_manage_permissions'

function getPermissionLabel(field: PermissionField) {
  switch (field) {
    case 'can_quote_create':
      return '견적 등록'
    case 'can_po_create':
      return '발주 등록'
    case 'can_receive_stock':
      return '입고 처리'
    case 'can_prod_complete':
      return '생산 완료'
    case 'can_approve':
      return '승인 / 반려'
    case 'can_manage_permissions':
      return '권한 관리'
    default:
      return field
  }
}

const permissionFields: PermissionField[] = [
  'can_quote_create',
  'can_po_create',
  'can_receive_stock',
  'can_prod_complete',
  'can_approve',
  'can_manage_permissions',
]

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<AppUserPermissionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingId, setIsSavingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    async function loadUsers() {
      const { data, error } = await supabase
        .from('app_users')
        .select(`
          id,
          login_id,
          user_name,
          role_name,
          can_quote_create,
          can_po_create,
          can_receive_stock,
          can_prod_complete,
          can_approve,
          can_manage_permissions
        `)
        .order('user_name')

      if (error) {
        setErrorMessage('사용자 권한 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      setUsers((data as AppUserPermissionRow[]) ?? [])
      setIsLoading(false)
    }

    loadUsers()
  }, [])

  function handleCheckboxChange(
    userId: string,
    field: PermissionField,
    checked: boolean
  ) {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, [field]: checked } : user
      )
    )
  }

  async function handleSave(user: AppUserPermissionRow) {
    setErrorMessage('')
    setSuccessMessage('')
    setIsSavingId(user.id)

    const { error } = await supabase
      .from('app_users')
      .update({
        can_quote_create: user.can_quote_create,
        can_po_create: user.can_po_create,
        can_receive_stock: user.can_receive_stock,
        can_prod_complete: user.can_prod_complete,
        can_approve: user.can_approve,
        can_manage_permissions: user.can_manage_permissions,
      })
      .eq('id', user.id)

    setIsSavingId(null)

    if (error) {
      setErrorMessage('권한 저장 중 오류가 발생했습니다.')
      return
    }

    setSuccessMessage(`${user.user_name} 사용자의 권한이 저장되었습니다.`)
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white p-8 shadow">
        <p className="text-gray-500">사용자 권한 정보를 불러오는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">사용자권한관리</h1>
        <p className="mt-1 text-gray-600">
          체크박스로 사용자별 기능 권한을 설정합니다.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="space-y-4">
        {users.map((user) => (
          <div key={user.id} className="rounded-2xl bg-white p-6 shadow">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{user.user_name}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  로그인ID: {user.login_id} / 역할: {user.role_name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleSave(user)}
                disabled={isSavingId === user.id}
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSavingId === user.id ? '저장 중...' : '저장'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {permissionFields.map((field) => (
                <label
                  key={field}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={user[field]}
                    onChange={(e) =>
                      handleCheckboxChange(user.id, field, e.target.checked)
                    }
                  />
                  {getPermissionLabel(field)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}