'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import CurrentUserBanner from '@/components/CurrentUserBanner'

type Props = {
  children: React.ReactNode
}

const HEARTBEAT_MS = 60_000
/** Wall-clock since last user input (pointer/key/wheel anywhere in the app). */
const IDLE_LOGOUT_MS = 10 * 60 * 1000
const IDLE_CHECK_MS = 5_000

export default function AppShell({ children }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')

  const lastInputAtRef = useRef(0)
  const hadInputSinceLastBeatRef = useRef(true)

  const getOrCreateSessionId = (userId: string) => {
    const key = `erp-active-session:${userId}`
    const existing = window.sessionStorage.getItem(key)
    if (existing) return existing
    const next = `sid-${userId}-${crypto.randomUUID()}`
    window.sessionStorage.setItem(key, next)
    return next
  }

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setIsLoggedIn(!!session?.user)
      if (session?.user?.id) setSessionId(getOrCreateSessionId(session.user.id))
      setIsLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setIsLoggedIn(!!session?.user)
      if (session?.user?.id) setSessionId(getOrCreateSessionId(session.user.id))
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const mark = () => {
      lastInputAtRef.current = Date.now()
      hadInputSinceLastBeatRef.current = true
    }
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'keydown', 'wheel']
    events.forEach((ev) => document.addEventListener(ev, mark as EventListener, { passive: true }))
    return () => events.forEach((ev) => document.removeEventListener(ev, mark as EventListener))
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

  useEffect(() => {
    if (isLoading || !isLoggedIn || !sessionId) return

    // 로그인 페이지에서 오래 머문 뒤 로그인하면 lastInputAtRef가 마운트 시각에 머물러
    // 유휴 10분 판정이 즉시 참이 되어 로그아웃되는 문제를 막기 위해, 세션 활성화 시점에 리셋
    lastInputAtRef.current = Date.now()
    hadInputSinceLastBeatRef.current = true

    let disposed = false
    let idleSignOutStarted = false
    let beatTimer: ReturnType<typeof setInterval> | null = null
    let idleTimer: ReturnType<typeof setInterval> | null = null

    const sendHeartbeat = async (isOnline = true, hadRecentInteraction = true, keepalive = false) => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.access_token || disposed) return
      await fetch('/api/auth/session-heartbeat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        keepalive,
        body: JSON.stringify({
          sessionId,
          isOnline,
          hadRecentInteraction,
        }),
      }).catch(() => undefined)
    }

    void sendHeartbeat(true, true)
    hadInputSinceLastBeatRef.current = false

    const tryIdleSignOut = async () => {
      if (disposed || idleSignOutStarted) return
      if (Date.now() - lastInputAtRef.current <= IDLE_LOGOUT_MS) return
      idleSignOutStarted = true
      void sendHeartbeat(false, false, true)
      await supabase.auth.signOut()
    }

    beatTimer = setInterval(() => {
      if (disposed) return
      if (Date.now() - lastInputAtRef.current > IDLE_LOGOUT_MS) return
      const had = hadInputSinceLastBeatRef.current
      hadInputSinceLastBeatRef.current = false
      void sendHeartbeat(true, had)
    }, HEARTBEAT_MS)

    idleTimer = setInterval(() => {
      void tryIdleSignOut()
    }, IDLE_CHECK_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void tryIdleSignOut()
        if (!idleSignOutStarted && !disposed) {
          void sendHeartbeat(true, false)
        }
      }
    }

    const onWindowFocus = () => {
      void tryIdleSignOut()
    }
    const onPageHide = () => {
      void sendHeartbeat(false, false, true)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onPageHide)
    return () => {
      disposed = true
      if (beatTimer) clearInterval(beatTimer)
      if (idleTimer) clearInterval(idleTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onPageHide)
    }
  }, [isLoading, isLoggedIn, sessionId])

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
