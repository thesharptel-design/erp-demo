'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return

      if (session?.user) {
        router.replace('/dashboard')
        return
      }

      setIsChecking(false)
    }

    checkSession()

    return () => {
      mounted = false
    }
  }, [router])

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')
    setIsLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setIsLoading(false)

    if (error) {
      setErrorMessage('이메일 또는 비밀번호가 올바르지 않습니다.')
      return
    }

    router.replace('/dashboard')
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gray-100 px-6">
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm text-gray-500 shadow-sm">
          로그인 상태를 확인하는 중입니다...
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-100 px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            교육용 ERP 로그인
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            등록된 사용자 계정으로 로그인합니다.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="erp-field">
            <label className="erp-label">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="erp-input"
              placeholder="예: purchase@test.com"
            />
          </div>

          <div className="erp-field">
            <label className="erp-label">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="erp-input"
              placeholder="비밀번호 입력"
            />
          </div>

          {errorMessage && (
            <div className="erp-alert-error">{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="erp-btn-primary w-full"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}