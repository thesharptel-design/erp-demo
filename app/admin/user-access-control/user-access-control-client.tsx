'use client'

import { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { supabase } from '@/lib/supabase'

type UserKind = 'student' | 'teacher' | 'staff'
type PermissionKey =
  | 'can_manage_master'
  | 'can_sales_manage'
  | 'can_material_manage'
  | 'can_production_manage'
  | 'can_qc_manage'
  | 'can_admin_manage'
  | 'can_manage_permissions'
  | 'can_approval_participate'
  | 'can_outbound_view'
  | 'can_outbound_execute_self'
  | 'can_outbound_assign_handler'
  | 'can_outbound_reassign_recall'
  | 'can_outbound_execute_any'

type OutboundRole = 'none' | 'viewer' | 'worker' | 'master'

type AppUser = {
  id: string
  employee_no: string | null
  user_name: string | null
  email: string | null
  role_name: string | null
  user_kind: UserKind
  can_approval_participate: boolean
  can_manage_master: boolean | null
  can_sales_manage: boolean | null
  can_material_manage: boolean | null
  can_production_manage: boolean | null
  can_qc_manage: boolean | null
  can_admin_manage: boolean | null
  can_manage_permissions: boolean | null
  outbound_role?: OutboundRole | null
  can_outbound_view: boolean | null
  can_outbound_execute_self: boolean | null
  can_outbound_assign_handler: boolean | null
  can_outbound_reassign_recall: boolean | null
  can_outbound_execute_any: boolean | null
}

type Warehouse = {
  id: number
  code: string | null
  name: string
}

const PERMISSION_FIELDS: { key: PermissionKey; label: string; disabled?: boolean }[] = [
  { key: 'can_manage_master', label: '기준정보' },
  { key: 'can_sales_manage', label: '영업/구매' },
  { key: 'can_material_manage', label: '자재/재고' },
  { key: 'can_production_manage', label: '생산/BOM' },
  { key: 'can_qc_manage', label: '품질(QC)' },
  { key: 'can_admin_manage', label: '경영/관리 (미사용)', disabled: true },
  { key: 'can_manage_permissions', label: '시스템관리' },
  { key: 'can_approval_participate', label: '결재권권한' },
]

const BASE_PERMISSION_FIELDS = PERMISSION_FIELDS

function parseUserKind(value: unknown): UserKind {
  if (value === 'student' || value === 'teacher' || value === 'staff') return value
  return 'staff'
}

function getKindLabel(kind: UserKind) {
  if (kind === 'student') return '학생'
  if (kind === 'teacher') return '교사'
  return '직원'
}

function isSystemAdmin(user: AppUser) {
  return String(user.role_name ?? '').toLowerCase() === 'admin' || user.can_manage_permissions === true
}

function normalizeOutboundRole(input: unknown): OutboundRole | null {
  const v = String(input ?? '').trim().toLowerCase()
  if (v === 'none' || v === 'viewer' || v === 'worker' || v === 'master') return v
  return null
}

function inferOutboundRole(user: Pick<
  AppUser,
  | 'outbound_role'
  | 'can_outbound_view'
  | 'can_outbound_execute_self'
  | 'can_outbound_assign_handler'
  | 'can_outbound_reassign_recall'
  | 'can_outbound_execute_any'
>): OutboundRole {
  const explicit = normalizeOutboundRole(user.outbound_role)
  if (explicit) return explicit
  if (
    user.can_outbound_execute_any === true ||
    user.can_outbound_assign_handler === true ||
    user.can_outbound_reassign_recall === true
  ) return 'master'
  if (user.can_outbound_execute_self === true) return 'worker'
  if (user.can_outbound_view === true) return 'viewer'
  return 'none'
}

function outboundRoleLabel(role: OutboundRole): string {
  if (role === 'viewer') return '출고조회'
  if (role === 'worker') return '출고권'
  if (role === 'master') return '출고마스터'
  return '권한없음'
}

type OutboundCheckboxKey = 'viewer' | 'worker' | 'master'

function roleToOutboundChecks(role: OutboundRole): Record<OutboundCheckboxKey, boolean> {
  return {
    viewer: role === 'viewer' || role === 'worker' || role === 'master',
    worker: role === 'worker' || role === 'master',
    master: role === 'master',
  }
}

function checksToOutboundRole(checks: Record<OutboundCheckboxKey, boolean>): OutboundRole {
  if (checks.master) return 'master'
  if (checks.worker) return 'worker'
  if (checks.viewer) return 'viewer'
  return 'none'
}

export default function UserAccessControlClient() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [userWarehouseMap, setUserWarehouseMap] = useState<Record<string, number[]>>({})
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | UserKind>('all')

  const filteredUsers = useMemo(() => {
    const keyword = nameFilter.trim().toLowerCase()
    return users.filter((user) => {
      if (kindFilter !== 'all' && user.user_kind !== kindFilter) return false
      if (!keyword) return true
      const haystack = [user.user_name ?? '', user.employee_no ?? '', user.email ?? ''].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  }, [users, kindFilter, nameFilter])

  useEffect(() => {
    void fetchData()
  }, [])

  /** `soft`: 권한 토글 후 갱신용 — 로딩 배너를 켜지 않아 상세(Accordion)가 닫히지 않음 */
  const fetchData = async (mode: 'full' | 'soft' = 'full') => {
    if (mode === 'full') setLoading(true)
    try {
    const usersSelectBase = `
      id, employee_no, user_name, email, role_name, user_kind,
      can_approval_participate, can_manage_master, can_sales_manage, can_material_manage,
      can_production_manage, can_qc_manage, can_admin_manage, can_manage_permissions
    `
    const usersSelectOutbound = `
      outbound_role,
      can_outbound_view, can_outbound_execute_self, can_outbound_assign_handler,
      can_outbound_reassign_recall, can_outbound_execute_any
    `

    const usersWithOutbound = await supabase
      .from('app_users')
      .select(`${usersSelectBase}, ${usersSelectOutbound}`)
      .neq('role_name', 'pending')
      .order('user_name', { ascending: true })

    const userQueryFailedByMissingOutboundColumns =
      usersWithOutbound.error &&
      /outbound_role|can_outbound_(view|execute_self|assign_handler|reassign_recall|execute_any)/i.test(usersWithOutbound.error.message)

    const usersResult = userQueryFailedByMissingOutboundColumns
      ? await supabase
          .from('app_users')
          .select(usersSelectBase)
          .neq('role_name', 'pending')
          .order('user_name', { ascending: true })
      : usersWithOutbound

    // DB migration 반영 전 환경에서도 권한관리 화면이 깨지지 않도록 구버전 컬럼셋으로 재조회한다.

    const [warehousesResult, mappingsResult] = await Promise.all([
      supabase.from('warehouses').select('id, code, name').order('sort_order', { ascending: true }),
      supabase.from('app_user_warehouses').select('user_id, warehouse_id'),
    ])

    if (usersResult.error) alert(`사용자 조회 실패: ${usersResult.error.message}`)
    if (warehousesResult.error) alert(`창고 조회 실패: ${warehousesResult.error.message}`)
    if (mappingsResult.error) alert(`창고 권한 조회 실패: ${mappingsResult.error.message}`)

    const nextUsers = ((usersResult.data ?? []).map((row) => {
      const rowAny = row as Record<string, unknown>
      return {
        ...rowAny,
        user_kind: parseUserKind(rowAny.user_kind),
        can_approval_participate: rowAny.can_approval_participate === true,
        outbound_role: normalizeOutboundRole(rowAny.outbound_role),
        can_outbound_view: rowAny.can_outbound_view === true,
        can_outbound_execute_self: rowAny.can_outbound_execute_self === true,
        can_outbound_assign_handler: rowAny.can_outbound_assign_handler === true,
        can_outbound_reassign_recall: rowAny.can_outbound_reassign_recall === true,
        can_outbound_execute_any: rowAny.can_outbound_execute_any === true,
      }
    }) as AppUser[]).sort((a, b) => String(a.user_name ?? '').localeCompare(String(b.user_name ?? ''), 'ko'))
    setUsers(nextUsers)
    setWarehouses((warehousesResult.data ?? []) as Warehouse[])

    const nextMap: Record<string, number[]> = {}
    for (const row of mappingsResult.data ?? []) {
      const userId = String(row.user_id ?? '')
      const warehouseId = Number(row.warehouse_id)
      if (!userId || !Number.isInteger(warehouseId) || warehouseId <= 0) continue
      if (!nextMap[userId]) nextMap[userId] = []
      nextMap[userId].push(warehouseId)
    }
    setUserWarehouseMap(nextMap)
    } finally {
      if (mode === 'full') setLoading(false)
    }
  }

  const getAuthHeaders = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }
  }

  const postUserUpdate = async (id: string, payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ id, ...payload }),
    })
    const result = await res.json()
    if (!res.ok || !result.success) throw new Error(result.error ?? '저장 실패')
  }

  const togglePermission = async (user: AppUser, key: PermissionKey) => {
    if (key === 'can_admin_manage') return
    setSavingUserId(user.id)
    try {
      const nextPermissions: Record<PermissionKey, boolean> = {
        can_manage_master: user.can_manage_master === true,
        can_sales_manage: user.can_sales_manage === true,
        can_material_manage: user.can_material_manage === true,
        can_production_manage: user.can_production_manage === true,
        can_qc_manage: user.can_qc_manage === true,
        can_admin_manage: user.can_admin_manage === true,
        can_manage_permissions: user.can_manage_permissions === true,
        can_approval_participate: user.can_approval_participate === true,
        can_outbound_view: user.can_outbound_view === true,
        can_outbound_execute_self: user.can_outbound_execute_self === true,
        can_outbound_assign_handler: user.can_outbound_assign_handler === true,
        can_outbound_reassign_recall: user.can_outbound_reassign_recall === true,
        can_outbound_execute_any: user.can_outbound_execute_any === true,
      }
      nextPermissions[key] = !nextPermissions[key]
      await postUserUpdate(user.id, nextPermissions)
      await fetchData('soft')
    } catch (error) {
      alert(error instanceof Error ? error.message : '권한 수정 실패')
    } finally {
      setSavingUserId(null)
    }
  }

  const updateOutboundRole = async (user: AppUser, role: OutboundRole) => {
    setSavingUserId(user.id)
    try {
      await postUserUpdate(user.id, { outbound_role: role })
      await fetchData('soft')
    } catch (error) {
      alert(error instanceof Error ? error.message : '출고 권한 수정 실패')
    } finally {
      setSavingUserId(null)
    }
  }

  const toggleOutboundPermission = async (user: AppUser, key: OutboundCheckboxKey) => {
    const currentRole = inferOutboundRole(user)
    const nextChecks = roleToOutboundChecks(currentRole)
    nextChecks[key] = !nextChecks[key]
    const nextRole = checksToOutboundRole(nextChecks)
    if (nextRole === currentRole) return
    await updateOutboundRole(user, nextRole)
  }

  const toggleWarehouseForUser = async (userId: string, warehouseId: number, checked: boolean) => {
    setSavingUserId(userId)
    try {
      const current = userWarehouseMap[userId] ?? []
      const next = checked ? Array.from(new Set([...current, warehouseId])) : current.filter((id) => id !== warehouseId)
      await postUserUpdate(userId, { warehouse_ids: next })
      setUserWarehouseMap((prev) => ({ ...prev, [userId]: next }))
    } catch (error) {
      alert(error instanceof Error ? error.message : '창고 권한 수정 실패')
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
      <PageHeader
        title="사용자 권한 관리"
        description="시스템관리자와 admin 전용 관리 화면입니다."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchData()} disabled={loading}>
            새로고침
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="이름/사번/이메일 검색"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as 'all' | UserKind)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">전체 유형</option>
              <option value="staff">직원</option>
              <option value="teacher">교사</option>
              <option value="student">학생</option>
            </select>
            <div className="flex items-center text-sm text-muted-foreground">조회 결과 {filteredUsers.length}명</div>
          </div>
        </CardContent>
      </Card>

      <div className="hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-3">사용자</th>
                <th className="px-3 py-3">유형</th>
                <th className="px-3 py-3">권한 요약</th>
                <th className="px-3 py-3">창고 요약</th>
                <th className="px-3 py-3">상세 관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    불러오는 중...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    조회된 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const assignedWarehouseIds = userWarehouseMap[user.id] ?? []
                  const activePermissionCount = PERMISSION_FIELDS.filter((field) =>
                    field.key === 'can_approval_participate' ? user.can_approval_participate : user[field.key] === true
                  ).length + (inferOutboundRole(user) !== 'none' ? 1 : 0)
                  const outboundRole = inferOutboundRole(user)
                  return (
                    <tr key={user.id} className="border-b align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold">{user.user_name ?? '(이름 없음)'}</p>
                        <p className="text-xs text-muted-foreground">
                          <span>{user.employee_no ?? '-'}</span>
                          <span className="mx-1">/</span>
                          <span className="inline-block max-w-[170px] truncate align-bottom" title={user.email ?? '-'}>
                            {user.email ?? '-'}
                          </span>
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{getKindLabel(user.user_kind)}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">활성 권한 {activePermissionCount}개</p>
                        {isSystemAdmin(user) ? (
                          <p className="text-xs text-blue-600">시스템 관리자 권한 포함</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">할당 창고 {assignedWarehouseIds.length}개</p>
                        {isSystemAdmin(user) ? (
                          <p className="text-xs text-blue-600">모든 창고 접근 가능</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="controls" className="border rounded-md px-2">
                            <AccordionTrigger className="py-2 text-xs">권한수정</AccordionTrigger>
                            <AccordionContent>
                              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground">권한 상세</p>
                                  {BASE_PERMISSION_FIELDS.map((field) => {
                                    const checked =
                                      field.key === 'can_approval_participate'
                                        ? user.can_approval_participate
                                        : user[field.key] === true
                                    return (
                                      <label key={field.key} className="flex items-center justify-between gap-2 text-xs">
                                        <span>{field.label}</span>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={savingUserId === user.id || field.disabled}
                                          onChange={() => void togglePermission(user, field.key)}
                                          className="h-4 w-4"
                                        />
                                      </label>
                                    )
                                  })}
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground">출고권한</p>
                                  <label className="flex items-center justify-between gap-2 text-xs">
                                    <span>출고조회</span>
                                    <input
                                      type="checkbox"
                                      checked={roleToOutboundChecks(outboundRole).viewer}
                                      disabled={savingUserId === user.id}
                                      onChange={() => void toggleOutboundPermission(user, 'viewer')}
                                      className="h-4 w-4"
                                    />
                                  </label>
                                  <label className="flex items-center justify-between gap-2 text-xs">
                                    <span>출고권</span>
                                    <input
                                      type="checkbox"
                                      checked={roleToOutboundChecks(outboundRole).worker}
                                      disabled={savingUserId === user.id}
                                      onChange={() => void toggleOutboundPermission(user, 'worker')}
                                      className="h-4 w-4"
                                    />
                                  </label>
                                  <label className="flex items-center justify-between gap-2 text-xs">
                                    <span>출고마스터</span>
                                    <input
                                      type="checkbox"
                                      checked={roleToOutboundChecks(outboundRole).master}
                                      disabled={savingUserId === user.id}
                                      onChange={() => void toggleOutboundPermission(user, 'master')}
                                      className="h-4 w-4"
                                    />
                                  </label>
                                  <p className="text-[11px] text-muted-foreground">
                                    중복 선택 시 가장 강한 권한으로 저장됩니다.
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">현재: {outboundRoleLabel(outboundRole)}</p>
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground">창고 권한</p>
                                  <div className="max-h-56 space-y-2 overflow-auto pr-1">
                                    {warehouses.map((warehouse) => (
                                      <label key={warehouse.id} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="truncate">
                                          {warehouse.code ? `[${warehouse.code}] ` : ''}
                                          {warehouse.name}
                                        </span>
                                        <input
                                          type="checkbox"
                                          checked={assignedWarehouseIds.includes(warehouse.id)}
                                          disabled={savingUserId === user.id}
                                          onChange={(e) =>
                                            void toggleWarehouseForUser(user.id, warehouse.id, e.target.checked)
                                          }
                                          className="h-4 w-4"
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">불러오는 중...</CardContent>
          </Card>
        ) : filteredUsers.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">조회된 사용자가 없습니다.</CardContent>
          </Card>
        ) : (
          filteredUsers.map((user) => {
            const assignedWarehouseIds = userWarehouseMap[user.id] ?? []
            const activePermissionCount = PERMISSION_FIELDS.filter((field) =>
              field.key === 'can_approval_participate' ? user.can_approval_participate : user[field.key] === true
            ).length + (inferOutboundRole(user) !== 'none' ? 1 : 0)
            const outboundRole = inferOutboundRole(user)
            return (
              <Card key={user.id}>
                <CardContent className="space-y-3 pt-4">
                  <div>
                    <p className="font-semibold">{user.user_name ?? '(이름 없음)'}</p>
                    <p className="text-xs text-muted-foreground">
                      <span>{user.employee_no ?? '-'}</span>
                      <span className="mx-1">/</span>
                      <span className="inline-block max-w-[170px] truncate align-bottom" title={user.email ?? '-'}>
                        {user.email ?? '-'}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{getKindLabel(user.user_kind)}</Badge>
                    <Badge variant="secondary">권한 {activePermissionCount}개</Badge>
                    <Badge variant="secondary">창고 {assignedWarehouseIds.length}개</Badge>
                  </div>
                  {isSystemAdmin(user) ? (
                    <p className="text-xs text-blue-600">시스템 관리자: 모든 창고 접근 가능</p>
                  ) : null}
                  <Accordion type="single" collapsible>
                    <AccordionItem value={`mobile-controls-${user.id}`} className="border rounded-md px-3">
                      <AccordionTrigger className="py-2 text-sm">권한수정</AccordionTrigger>
                      <AccordionContent className="space-y-3">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">권한 상세</p>
                          {BASE_PERMISSION_FIELDS.map((field) => {
                            const checked =
                              field.key === 'can_approval_participate'
                                ? user.can_approval_participate
                                : user[field.key] === true
                            return (
                              <label key={field.key} className="flex min-h-9 items-center justify-between gap-2 text-sm">
                                <span>{field.label}</span>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={savingUserId === user.id || field.disabled}
                                  onChange={() => void togglePermission(user, field.key)}
                                  className="h-4 w-4"
                                />
                              </label>
                            )
                          })}
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">출고권한</p>
                          <label className="flex min-h-9 items-center justify-between gap-2 text-sm">
                            <span>출고조회</span>
                            <input
                              type="checkbox"
                              checked={roleToOutboundChecks(outboundRole).viewer}
                              disabled={savingUserId === user.id}
                              onChange={() => void toggleOutboundPermission(user, 'viewer')}
                              className="h-4 w-4"
                            />
                          </label>
                          <label className="flex min-h-9 items-center justify-between gap-2 text-sm">
                            <span>출고권</span>
                            <input
                              type="checkbox"
                              checked={roleToOutboundChecks(outboundRole).worker}
                              disabled={savingUserId === user.id}
                              onChange={() => void toggleOutboundPermission(user, 'worker')}
                              className="h-4 w-4"
                            />
                          </label>
                          <label className="flex min-h-9 items-center justify-between gap-2 text-sm">
                            <span>출고마스터</span>
                            <input
                              type="checkbox"
                              checked={roleToOutboundChecks(outboundRole).master}
                              disabled={savingUserId === user.id}
                              onChange={() => void toggleOutboundPermission(user, 'master')}
                              className="h-4 w-4"
                            />
                          </label>
                          <p className="text-[11px] text-muted-foreground">중복 선택 시 가장 강한 권한으로 저장됩니다.</p>
                          <p className="text-[11px] text-muted-foreground">현재: {outboundRoleLabel(outboundRole)}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground">창고 권한</p>
                          <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-2">
                            {warehouses.map((warehouse) => (
                              <label key={warehouse.id} className="flex min-h-9 items-center justify-between gap-2 text-sm">
                                <span className="truncate">
                                  {warehouse.code ? `[${warehouse.code}] ` : ''}
                                  {warehouse.name}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={assignedWarehouseIds.includes(warehouse.id)}
                                  disabled={savingUserId === user.id}
                                  onChange={(e) => void toggleWarehouseForUser(user.id, warehouse.id, e.target.checked)}
                                  className="h-4 w-4"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

