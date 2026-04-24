'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { runApprovalShellListReturnToList } from '@/lib/approval-shell-list-nav'

type Props = {
  href: string
  /** 베어 셸 팝업에서 목록으로 돌아갈 때 opener 새로고침 후 창 닫기 */
  popupListBehavior?: boolean
  className?: string
  children: ReactNode
}

export default function ApprovalShellListNav({
  href,
  popupListBehavior = false,
  className = 'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700',
  children,
}: Props) {
  if (popupListBehavior) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => runApprovalShellListReturnToList(href)}
      >
        {children}
      </button>
    )
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}
