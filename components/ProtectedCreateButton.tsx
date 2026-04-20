'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getCurrentUserPermissions, hasManagePermission, type ManagePermissionKey } from '@/lib/permissions'

type Props = {
  href: string
  label: string
  permissionKey: ManagePermissionKey
}

export default function ProtectedCreateButton({
  href,
  label,
  permissionKey,
}: Props) {
  const [canAccess, setCanAccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadPermissions() {
      const permissions = await getCurrentUserPermissions()

      if (!permissions) {
        setCanAccess(false)
        setIsLoading(false)
        return
      }

      setCanAccess(hasManagePermission(permissions, permissionKey))
      setIsLoading(false)
    }

    loadPermissions()
  }, [permissionKey])

  if (isLoading) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-200 px-4 text-sm font-medium text-gray-500"
      >
        {label}
      </button>
    )
  }

  if (!canAccess) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-200 px-4 text-sm font-medium text-gray-500"
      >
        {label}
      </button>
    )
  }

  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white"
    >
      {label}
    </Link>
  )
}