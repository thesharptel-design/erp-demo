'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import CurrentUserBanner from '@/components/CurrentUserBanner'

type Props = {
  children: React.ReactNode
}

export default function AppShell({ children }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setIsLoggedIn(!!session?.user)
      setIsLoading(false)
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      setIsLoggedIn(!!session?.user)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (isLoading) return

    if (!isLoggedIn && pathname !== '/login') {
      router.replace('/login')
      return
    }

    if (isLoggedIn && pathname === '/login') {
      router.replace('/dashboard')
    }
  }, [isLoading, isLoggedIn, pathname, router])

  if (pathname === '/login') {
    return <>{children}</>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm text-gray-500 shadow-sm">
          화면을 준비하는 중입니다...
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm text-gray-500 shadow-sm">
          로그인 화면으로 이동하는 중입니다...
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl px-6 py-6">
            <CurrentUserBanner />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}