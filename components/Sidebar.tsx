'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  getCurrentUserPermissions,
  type CurrentUserPermissions,
} from '@/lib/permissions'

type MenuChild = {
  href: string
  label: string
  visible: (user: CurrentUserPermissions | null) => boolean
}

type MenuGroup = {
  key: string
  label: string
  visible: (user: CurrentUserPermissions | null) => boolean
  children: MenuChild[]
}

function canAccessQc(user: CurrentUserPermissions | null) {
  if (!user) return false
  return (
    user.role_name === 'admin' ||
    user.role_name === 'qc' ||
    user.can_qc_manage === true ||
    user.role_name === 'purchase' ||
    user.role_name === 'production'
  )
}

function canAccessInventory(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'sales', 'purchase', 'production', 'qc'].includes(user.role_name)
}

function canAccessInventoryTransactions(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'purchase', 'production', 'qc'].includes(user.role_name)
}

function canAccessInventoryAdjustments(user: CurrentUserPermissions | null) {
  if (!user) return false
  return (
    ['admin', 'purchase', 'production', 'qc'].includes(user.role_name) ||
    user.can_receive_stock === true ||
    user.can_qc_manage === true
  )
}

function canAccessCustomers(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'sales', 'purchase'].includes(user.role_name)
}

function canAccessItems(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'sales', 'purchase', 'production', 'qc'].includes(user.role_name)
}

function canAccessQuotes(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'sales'].includes(user.role_name)
}

function canAccessPurchaseOrders(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'purchase'].includes(user.role_name)
}

function canAccessProductionOrders(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'production'].includes(user.role_name)
}

function canAccessBoms(user: CurrentUserPermissions | null) {
  if (!user) return false
  return ['admin', 'production'].includes(user.role_name)
}

function canAccessUserPermissions(user: CurrentUserPermissions | null) {
  if (!user) return false
  return user.role_name === 'admin' || user.can_manage_permissions === true
}

function isPathMatch(pathname: string, href: string) {
  if (href === '/dashboard' || href === '/approvals') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

const MENU_GROUPS: MenuGroup[] = [
  {
    key: 'sales',
    label: '영업관리',
    visible: (user) => canAccessQuotes(user),
    children: [
      {
        href: '/quotes',
        label: '견적서관리',
        visible: (user) => canAccessQuotes(user),
      },
    ],
  },
  {
    key: 'purchase',
    label: '구매관리',
    visible: (user) => canAccessPurchaseOrders(user),
    children: [
      {
        href: '/purchase-orders',
        label: '발주서관리',
        visible: (user) => canAccessPurchaseOrders(user),
      },
    ],
  },
  {
    key: 'production',
    label: '생산관리',
    visible: (user) => canAccessProductionOrders(user) || canAccessBoms(user),
    children: [
      {
        href: '/production-orders',
        label: '생산지시관리',
        visible: (user) => canAccessProductionOrders(user),
      },
      {
        href: '/boms',
        label: 'BOM관리',
        visible: (user) => canAccessBoms(user),
      },
    ],
  },
  {
    key: 'quality',
    label: '품질관리',
    visible: (user) => canAccessQc(user),
    children: [
      {
        href: '/qc',
        label: 'QC관리',
        visible: (user) => canAccessQc(user),
      },
    ],
  },
  {
    key: 'inventory',
    label: '재고관리',
    visible: (user) =>
      canAccessInventory(user) ||
      canAccessInventoryTransactions(user) ||
      canAccessInventoryAdjustments(user),
    children: [
      {
        href: '/inventory',
        label: '재고현황',
        visible: (user) => canAccessInventory(user),
      },
      {
        href: '/inventory-transactions',
        label: '입출고현황',
        visible: (user) => canAccessInventoryTransactions(user),
      },
      {
        href: '/inventory-adjustments',
        label: '재고조정',
        visible: (user) => canAccessInventoryAdjustments(user),
      },
    ],
  },
  {
    key: 'master',
    label: '기준정보',
    visible: (user) =>
      canAccessCustomers(user) ||
      canAccessItems(user) ||
      canAccessUserPermissions(user),
    children: [
      {
        href: '/customers',
        label: '거래처관리',
        visible: (user) => canAccessCustomers(user),
      },
      {
        href: '/items',
        label: '품목관리',
        visible: (user) => canAccessItems(user),
      },
      {
        href: '/admin/user-permissions',
        label: '사용자권한관리',
        visible: (user) => canAccessUserPermissions(user),
      },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<CurrentUserPermissions | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUserPermissions()
      setUser(currentUser)
    }

    loadUser()
  }, [])

  const visibleGroups = useMemo(() => {
    return MENU_GROUPS
      .filter((group) => group.visible(user))
      .map((group) => ({
        ...group,
        children: group.children.filter((child) => child.visible(user)),
      }))
      .filter((group) => group.children.length > 0)
  }, [user])

  useEffect(() => {
    if (visibleGroups.length === 0) return

    setOpenGroups((prev) => {
      const next = { ...prev }

      for (const group of visibleGroups) {
        const hasActiveChild = group.children.some((child) =>
          isPathMatch(pathname, child.href)
        )

        if (typeof next[group.key] === 'undefined') {
          next[group.key] = hasActiveChild
        } else if (hasActiveChild) {
          next[group.key] = true
        }
      }

      return next
    })
  }, [pathname, visibleGroups])

  function toggleGroup(groupKey: string) {
    setOpenGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }))
  }

  const dashboardActive = isPathMatch(pathname, '/dashboard')
  const approvalsActive = isPathMatch(pathname, '/approvals')

  return (
    <aside className="h-full w-64 border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-5">
        <Link href="/dashboard" className="block">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            교육용 ERP
          </h1>
          <p className="mt-1 text-sm text-gray-500">부서별 업무 흐름 실습</p>
        </Link>
      </div>

      <div className="px-3 py-4">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Menu
        </p>

        <nav className="space-y-1">
          <Link
            href="/dashboard"
            className={[
              'group flex items-center rounded-xl px-3 py-3 text-sm font-medium transition',
              dashboardActive
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
          >
            <span
              className={[
                'h-2 w-2 rounded-full transition',
                dashboardActive ? 'bg-gray-700' : 'bg-gray-300 group-hover:bg-gray-500',
              ].join(' ')}
            />
            <span className="ml-3">대시보드</span>
          </Link>

          <Link
            href="/approvals"
            className={[
              'group flex items-center rounded-xl px-3 py-3 text-sm font-medium transition',
              approvalsActive
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
            ].join(' ')}
          >
            <span
              className={[
                'h-2 w-2 rounded-full transition',
                approvalsActive ? 'bg-gray-700' : 'bg-gray-300 group-hover:bg-gray-500',
              ].join(' ')}
            />
            <span className="ml-3">기안/결재</span>
          </Link>

          {visibleGroups.map((group) => {
            const isOpen = openGroups[group.key] ?? false
            const hasActiveChild = group.children.some((child) =>
              isPathMatch(pathname, child.href)
            )

            return (
              <div key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className={[
                    'flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition',
                    hasActiveChild
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  <span className="flex items-center">
                    <span
                      className={[
                        'h-2 w-2 rounded-full transition',
                        hasActiveChild ? 'bg-gray-700' : 'bg-gray-300',
                      ].join(' ')}
                    />
                    <span className="ml-3">{group.label}</span>
                  </span>

                  <span className="text-xs text-gray-400">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen && (
                  <div className="mt-1 space-y-1 pl-6">
                    {group.children.map((child) => {
                      const isActive = isPathMatch(pathname, child.href)

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={[
                            'block rounded-lg px-3 py-2 text-sm transition',
                            isActive
                              ? 'bg-gray-100 font-medium text-gray-900'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                          ].join(' ')}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}