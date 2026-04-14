'use client'

import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type AppUserPermissionRow = {
  id: string
  login_id: string | null
  user_name: string
  role_name: string
  email: string | null
  is_active: boolean
  can_quote_create: boolean
  can_po_create: boolean
  can_receive_stock: boolean
  can_prod_complete: boolean
  can_approve: boolean
  can_manage_permissions: boolean
  can_qc_manage: boolean
}

type PermissionField =
  | 'can_quote_create'
  | 'can_po_create'
  | 'can_receive_stock'
  | 'can_prod_complete'
  | 'can_approve'
  | 'can_manage_permissions'
  | 'can_qc_manage'

type RoleName =
  | 'admin'
  | 'sales'
  | 'purchase'
  | 'production'
  | 'approval'
  | 'qc'
  | 'user'

type CreateUserForm = {
  login_id: string
  user_name: string
  email: string
  password: string
  role_name: RoleName
  is_active: boolean
  can_quote_create: boolean
  can_po_create: boolean
  can_receive_stock: boolean
  can_prod_complete: boolean
  can_approve: boolean
  can_manage_permissions: boolean
  can_qc_manage: boolean
}

type BulkPreviewRow = {
  login_id: string
  user_name: string
  email: string
  password: string
  role_name: string
  is_active: string
  can_quote_create: string
  can_po_create: string
  can_receive_stock: string
  can_prod_complete: string
  can_approve: string
  can_manage_permissions: string
  can_qc_manage: string
}

type BulkCreateResultRow = {
  row_no: number
  login_id: string
  email: string
  success: boolean
  message: string
}

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
    case 'can_qc_manage':
      return 'QC 관리'
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
  'can_qc_manage',
]

const roleOptions: RoleName[] = [
  'admin',
  'sales',
  'purchase',
  'production',
  'approval',
  'qc',
  'user',
]

const bulkHeaders = [
  'login_id',
  'user_name',
  'email',
  'password',
  'role_name',
  'is_active',
  'can_quote_create',
  'can_po_create',
  'can_receive_stock',
  'can_prod_complete',
  'can_approve',
  'can_manage_permissions',
  'can_qc_manage',
]

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
    case 'qc':
      return 'QC'
    case 'user':
      return '일반'
    default:
      return roleName
  }
}

function getDefaultPermissionsByRole(roleName: RoleName) {
  switch (roleName) {
    case 'admin':
      return {
        can_quote_create: true,
        can_po_create: true,
        can_receive_stock: true,
        can_prod_complete: true,
        can_approve: true,
        can_manage_permissions: true,
        can_qc_manage: true,
      }
    case 'sales':
      return {
        can_quote_create: true,
        can_po_create: false,
        can_receive_stock: false,
        can_prod_complete: false,
        can_approve: false,
        can_manage_permissions: false,
        can_qc_manage: false,
      }
    case 'purchase':
      return {
        can_quote_create: false,
        can_po_create: true,
        can_receive_stock: true,
        can_prod_complete: false,
        can_approve: false,
        can_manage_permissions: false,
        can_qc_manage: true,
      }
    case 'production':
      return {
        can_quote_create: false,
        can_po_create: false,
        can_receive_stock: false,
        can_prod_complete: true,
        can_approve: false,
        can_manage_permissions: false,
        can_qc_manage: true,
      }
    case 'approval':
      return {
        can_quote_create: false,
        can_po_create: false,
        can_receive_stock: false,
        can_prod_complete: false,
        can_approve: true,
        can_manage_permissions: false,
        can_qc_manage: false,
      }
    case 'qc':
      return {
        can_quote_create: false,
        can_po_create: false,
        can_receive_stock: false,
        can_prod_complete: false,
        can_approve: false,
        can_manage_permissions: false,
        can_qc_manage: true,
      }
    case 'user':
    default:
      return {
        can_quote_create: false,
        can_po_create: false,
        can_receive_stock: false,
        can_prod_complete: false,
        can_approve: false,
        can_manage_permissions: false,
        can_qc_manage: false,
      }
  }
}

function makeInitialCreateUserForm(): CreateUserForm {
  return {
    login_id: '',
    user_name: '',
    email: '',
    password: '',
    role_name: 'user',
    is_active: true,
    ...getDefaultPermissionsByRole('user'),
  }
}

function parseCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

function parseCsvText(text: string): BulkPreviewRow[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []

  const headerRow = parseCsvLine(lines[0]).map((h) => h.trim())
  const headerMatches =
    bulkHeaders.length === headerRow.length &&
    bulkHeaders.every((header, index) => header === headerRow[index])

  if (!headerMatches) {
    throw new Error(
      `CSV 헤더가 올바르지 않습니다. 필요한 헤더: ${bulkHeaders.join(', ')}`
    )
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)

    const rowObject = Object.fromEntries(
      bulkHeaders.map((header, index) => [header, values[index] ?? ''])
    )

    return rowObject as BulkPreviewRow
  })
}

export default function UserPermissionsPage() {
  const [users, setUsers] = useState<AppUserPermissionRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingId, setIsSavingId] = useState<string | null>(null)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [createUserForm, setCreateUserForm] = useState<CreateUserForm>(
    makeInitialCreateUserForm()
  )
  const [bulkPreviewRows, setBulkPreviewRows] = useState<BulkPreviewRow[]>([])
  const [bulkFileName, setBulkFileName] = useState('')
  const [bulkResults, setBulkResults] = useState<BulkCreateResultRow[]>([])

  async function reloadUsers() {
    const { data, error } = await supabase
      .from('app_users')
      .select(`
        id,
        login_id,
        user_name,
        role_name,
        email,
        is_active,
        can_quote_create,
        can_po_create,
        can_receive_stock,
        can_prod_complete,
        can_approve,
        can_manage_permissions,
        can_qc_manage
      `)
      .order('user_name')

    if (!error) {
      setUsers((data as AppUserPermissionRow[]) ?? [])
    }
  }

  useEffect(() => {
    async function loadUsers() {
      const { data, error } = await supabase
        .from('app_users')
        .select(`
          id,
          login_id,
          user_name,
          role_name,
          email,
          is_active,
          can_quote_create,
          can_po_create,
          can_receive_stock,
          can_prod_complete,
          can_approve,
          can_manage_permissions,
          can_qc_manage
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

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.user_name.localeCompare(b.user_name))
  }, [users])

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

  function handleRoleChange(userId: string, nextRole: RoleName) {
    const nextPermissions = getDefaultPermissionsByRole(nextRole)

    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? {
              ...user,
              role_name: nextRole,
              ...nextPermissions,
            }
          : user
      )
    )
  }

  function handleIsActiveChange(userId: string, checked: boolean) {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, is_active: checked } : user
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
        role_name: user.role_name,
        is_active: user.is_active,
        can_quote_create: user.can_quote_create,
        can_po_create: user.can_po_create,
        can_receive_stock: user.can_receive_stock,
        can_prod_complete: user.can_prod_complete,
        can_approve: user.can_approve,
        can_manage_permissions: user.can_manage_permissions,
        can_qc_manage: user.can_qc_manage,
      })
      .eq('id', user.id)

    setIsSavingId(null)

    if (error) {
      setErrorMessage('권한 저장 중 오류가 발생했습니다.')
      return
    }

    setSuccessMessage(`${user.user_name} 사용자의 권한이 저장되었습니다.`)
  }

  function handleCreateFormChange<K extends keyof CreateUserForm>(
    field: K,
    value: CreateUserForm[K]
  ) {
    setCreateUserForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  function handleCreateFormRoleChange(nextRole: RoleName) {
    setCreateUserForm((prev) => ({
      ...prev,
      role_name: nextRole,
      ...getDefaultPermissionsByRole(nextRole),
    }))
  }

  async function handleCreateUser() {
    setErrorMessage('')
    setSuccessMessage('')

    if (!createUserForm.login_id.trim()) {
      setErrorMessage('로그인ID를 입력하십시오.')
      return
    }

    if (!createUserForm.user_name.trim()) {
      setErrorMessage('사용자명을 입력하십시오.')
      return
    }

    if (!createUserForm.email.trim()) {
      setErrorMessage('이메일을 입력하십시오.')
      return
    }

    if (!createUserForm.password.trim()) {
      setErrorMessage('초기 비밀번호를 입력하십시오.')
      return
    }

    setIsCreatingUser(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify(createUserForm),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result?.error ?? '사용자 생성 중 오류가 발생했습니다.')
        return
      }

      setSuccessMessage('사용자가 생성되었습니다.')
      await reloadUsers()
      setCreateUserForm(makeInitialCreateUserForm())
    } catch (error) {
      console.error(error)
      setErrorMessage('사용자 생성 중 오류가 발생했습니다.')
    } finally {
      setIsCreatingUser(false)
    }
  }

  async function handleBulkFileChange(e: ChangeEvent<HTMLInputElement>) {
    setErrorMessage('')
    setSuccessMessage('')
    setBulkResults([])

    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const rows = parseCsvText(text)
      setBulkPreviewRows(rows)
      setBulkFileName(file.name)
    } catch (error) {
      console.error(error)
      setBulkPreviewRows([])
      setBulkFileName('')
      setErrorMessage(
        error instanceof Error ? error.message : 'CSV 파일을 읽는 중 오류가 발생했습니다.'
      )
    }
  }

  async function handleBulkCreateUsers() {
    setErrorMessage('')
    setSuccessMessage('')
    setBulkResults([])

    if (bulkPreviewRows.length === 0) {
      setErrorMessage('먼저 CSV 파일을 업로드하십시오.')
      return
    }

    setIsBulkUploading(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch('/api/admin/create-users-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          rows: bulkPreviewRows,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result?.error ?? '일괄 생성 중 오류가 발생했습니다.')
        setIsBulkUploading(false)
        return
      }

      const results = (result?.results ?? []) as BulkCreateResultRow[]
      setBulkResults(results)

      const successCount = results.filter((row) => row.success).length
      const failCount = results.length - successCount

      setSuccessMessage(
        `일괄 생성 완료: 성공 ${successCount}건 / 실패 ${failCount}건`
      )

      await reloadUsers()
    } catch (error) {
      console.error(error)
      setErrorMessage('일괄 생성 중 오류가 발생했습니다.')
    } finally {
      setIsBulkUploading(false)
    }
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
          사용자 등록, CSV 일괄 등록, 역할 설정, 권한 부여를 한 화면에서 관리합니다.
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

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">사용자 등록</h2>
          <p className="mt-1 text-sm text-gray-500">
            신규 사용자 계정을 생성하고 기본 역할 및 권한을 설정합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              로그인ID
            </label>
            <input
              value={createUserForm.login_id}
              onChange={(e) => handleCreateFormChange('login_id', e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="예: kim01"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              사용자명
            </label>
            <input
              value={createUserForm.user_name}
              onChange={(e) => handleCreateFormChange('user_name', e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="예: 김구매"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              이메일
            </label>
            <input
              type="email"
              value={createUserForm.email}
              onChange={(e) => handleCreateFormChange('email', e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="예: kim01@company.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              초기 비밀번호
            </label>
            <input
              type="text"
              value={createUserForm.password}
              onChange={(e) => handleCreateFormChange('password', e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="예: Temp1234!"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              역할
            </label>
            <select
              value={createUserForm.role_name}
              onChange={(e) => handleCreateFormRoleChange(e.target.value as RoleName)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={createUserForm.is_active}
              onChange={(e) => handleCreateFormChange('is_active', e.target.checked)}
            />
            사용여부
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {permissionFields.map((field) => (
            <label
              key={field}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm"
            >
              <input
                type="checkbox"
                checked={createUserForm[field]}
                onChange={(e) => handleCreateFormChange(field, e.target.checked)}
              />
              {getPermissionLabel(field)}
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCreateUser}
            disabled={isCreatingUser}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isCreatingUser ? '생성 중...' : '사용자 생성'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">CSV 일괄 등록</h2>
          <p className="mt-1 text-sm text-gray-500">
            엑셀에서 CSV UTF-8로 저장한 파일을 업로드해 사용자 계정을 일괄 생성합니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(
              'login_id,user_name,email,password,role_name,is_active,can_quote_create,can_po_create,can_receive_stock,can_prod_complete,can_approve,can_manage_permissions,can_qc_manage\nkim01,김구매,kim01@company.com,Temp1234!,purchase,true,false,true,true,false,false,false,true'
            )}`}
            download="user_import_template.csv"
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            템플릿 다운로드
          </a>

          <label className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 cursor-pointer">
            CSV 파일 선택
            <input
              type="file"
              accept=".csv"
              onChange={handleBulkFileChange}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleBulkCreateUsers}
            disabled={isBulkUploading || bulkPreviewRows.length === 0}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isBulkUploading ? '일괄 생성 중...' : '일괄 생성 실행'}
          </button>
        </div>

        {bulkFileName && (
          <p className="mt-3 text-sm text-gray-500">선택 파일: {bulkFileName}</p>
        )}

        {bulkPreviewRows.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">
              업로드 미리보기 ({bulkPreviewRows.length}건)
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    {bulkHeaders.map((header) => (
                      <th key={header} className="px-4 py-3 whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bulkPreviewRows.slice(0, 20).map((row, index) => (
                    <tr key={`${row.email}-${index}`} className="border-t border-gray-100">
                      {bulkHeaders.map((header) => (
                        <td key={header} className="px-4 py-3 whitespace-nowrap">
                          {row[header as keyof BulkPreviewRow] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {bulkPreviewRows.length > 20 && (
              <p className="mt-2 text-xs text-gray-500">
                미리보기는 처음 20건만 표시합니다.
              </p>
            )}
          </div>
        )}

        {bulkResults.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">일괄 생성 결과</p>

            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">행번호</th>
                    <th className="px-4 py-3">로그인ID</th>
                    <th className="px-4 py-3">이메일</th>
                    <th className="px-4 py-3">결과</th>
                    <th className="px-4 py-3">메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResults.map((row) => (
                    <tr key={`${row.row_no}-${row.email}`} className="border-t border-gray-100">
                      <td className="px-4 py-3">{row.row_no}</td>
                      <td className="px-4 py-3">{row.login_id}</td>
                      <td className="px-4 py-3">{row.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            row.success
                              ? 'rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700'
                              : 'rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700'
                          }
                        >
                          {row.success ? '성공' : '실패'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-pre-wrap break-words">
                        {row.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">사용자 목록 / 권한 수정</h2>
          <p className="mt-1 text-sm text-gray-500">
            역할, 사용여부, 기능 권한을 수정한 뒤 사용자별로 저장합니다.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">사용자명</th>
                <th className="px-4 py-3">로그인ID</th>
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">역할</th>
                <th className="px-4 py-3">사용</th>
                {permissionFields.map((field) => (
                  <th key={field} className="px-4 py-3 whitespace-nowrap">
                    {getPermissionLabel(field)}
                  </th>
                ))}
                <th className="px-4 py-3">저장</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6 + permissionFields.length}
                    className="px-4 py-10 text-center text-sm text-gray-400"
                  >
                    사용자 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <tr key={user.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{user.user_name}</td>
                    <td className="px-4 py-3">{user.login_id ?? '-'}</td>
                    <td className="px-4 py-3">{user.email ?? '-'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role_name}
                        onChange={(e) =>
                          handleRoleChange(user.id, e.target.value as RoleName)
                        }
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={user.is_active}
                        onChange={(e) =>
                          handleIsActiveChange(user.id, e.target.checked)
                        }
                      />
                    </td>

                    {permissionFields.map((field) => (
                      <td key={field} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={user[field]}
                          onChange={(e) =>
                            handleCheckboxChange(user.id, field, e.target.checked)
                          }
                        />
                      </td>
                    ))}

                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleSave(user)}
                        disabled={isSavingId === user.id}
                        className="rounded-xl bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {isSavingId === user.id ? '저장 중...' : '저장'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}