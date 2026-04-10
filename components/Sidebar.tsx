'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  getCurrentUserPermissions,
  type CurrentUserPermissions,
} from '@/lib/permissions'

type MenuItem = {
  href: string
  label: string
}

function getMenusByRole(roleName: string): MenuItem[] {
  const commonMenus: MenuItem[] = [
    { href: '/dashboard', label: '대시보드' },
    { href: '/approvals', label: '기안/결재' },
    { href: '/qc', label: 'QC관리' },
  ]

  switch (roleName) {
    case 'admin':
      return [
        ...commonMenus,
        { href: '/customers', label: '거래처관리' },
        { href: '/items', label: '품목관리' },
        { href: '/quotes', label: '견적서관리' },
        { href: '/purchase-orders', label: '발주서관리' },
        { href: '/boms', label: 'BOM관리' },
        { href: '/production-orders', label: '생산지시관리' },
        { href: '/inventory', label: '재고조회' },
        { href: '/inventory-transactions', label: '재고이력' },
        { href: '/admin/user-permissions', label: '사용자권한관리' },
      ]

    case 'sales':
      return [
        ...commonMenus,
        { href: '/customers', label: '거래처관리' },
        { href: '/items', label: '품목관리' },
        { href: '/quotes', label: '견적서관리' },
        { href: '/inventory', label: '재고조회' },
      ]

    case 'purchase':
      return [
        ...commonMenus,
        { href: '/customers', label: '거래처관리' },
        { href: '/items', label: '품목관리' },
        { href: '/purchase-orders', label: '발주서관리' },
        { href: '/inventory', label: '재고조회' },
        { href: '/inventory-transactions', label: '재고이력' },
      ]

    case 'production':
      return [
        ...commonMenus,
        { href: '/items', label: '품목관리' },
        { href: '/boms', label: 'BOM관리' },
        { href: '/production-orders', label: '생산지시관리' },
        { href: '/inventory', label: '재고조회' },
        { href: '/inventory-transactions', label: '재고이력' },
      ]

    case 'approval':
      return [...commonMenus]

    default:
      return commonMenus
  }
}

export default function Sidebar() {
  const [user, setUser] = useState<CurrentUserPermissions | null>(null)

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUserPermissions()
      setUser(currentUser)
    }

    loadUser()
  }, [])

  const menus = getMenusByRole(user?.role_name ?? '')

  return (
    <aside className="w-64 shrink-0 border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-6 py-6">
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
          {menus.map((menu) => (
            <Link
              key={menu.href}
              href={menu.href}
              className="group flex items-center rounded-xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900"
            >
              <span className="h-2 w-2 rounded-full bg-gray-300 transition group-hover:bg-gray-500" />
              <span className="ml-3">{menu.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  )
}