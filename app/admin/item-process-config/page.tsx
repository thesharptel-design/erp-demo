'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { ItemProcessConfigEditor } from '@/components/items/ItemProcessConfigEditor'
import { Button } from '@/components/ui/button'
import { canEditItemsMaster, getCurrentUserPermissions } from '@/lib/permissions'

export default function AdminItemProcessConfigRedirectPage() {
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    void (async () => {
      const u = await getCurrentUserPermissions()
      setAllowed(canEditItemsMaster(u))
      setChecking(false)
    })()
  }, [])

  if (checking) {
    return (
      <div className="p-4">
        <p className="text-xs text-muted-foreground">권한 확인 중…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="space-y-3 p-4">
        <h1 className="text-xl font-black">공정 상세 설정</h1>
        <p className="text-sm font-bold text-amber-800">시스템 관리자만 이 화면을 사용할 수 있습니다.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">← 관리자 홈</Link>
        </Button>
      </div>
    )
  }

  return <ItemProcessConfigEditor backHref="/admin" backLabel="← 관리자 홈" />
}
