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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setIsLoggedIn(!!session?.user)
      setIsLoading(false)
    }

    loadSession()

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

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

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
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        {/* 데스크톱 전용 사이드바 */}
        <div className="hidden lg:block">
          <Sidebar />
        </div>

        {/* 모바일 오버레이 메뉴 */}
        {mobileMenuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/30 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="메뉴 닫기"
            />
            <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:hidden">
              <Sidebar />
            </div>
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <Header onMenuClick={() => setMobileMenuOpen(true)} />

          <main className="flex-1">
            <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
              <CurrentUserBanner />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}