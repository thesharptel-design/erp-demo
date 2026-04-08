'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type SupabaseInsertError = {
  code?: string
  message: string
}

function getCustomerErrorMessage(error: SupabaseInsertError) {
  const message = error.message.toLowerCase()

  // PostgreSQL unique violation
  if (error.code === '23505') {
    if (message.includes('customer_code')) {
      return '거래처 코드가 중복되었습니다. 다른 거래처 코드를 입력하십시오.'
    }
    if (message.includes('business_no')) {
      return '사업자번호가 중복되었습니다. 다른 사업자번호를 입력하십시오.'
    }
    return '중복된 값이 있습니다. 입력값을 다시 확인하십시오.'
  }

  // Not-null violation
  if (error.code === '23502') {
    if (message.includes('customer_code')) {
      return '거래처 코드를 입력하십시오.'
    }
    if (message.includes('customer_name')) {
      return '거래처명을 입력하십시오.'
    }
    if (message.includes('customer_type')) {
      return '거래처 구분을 선택하십시오.'
    }
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  // Check constraint violation
  if (error.code === '23514') {
    return '입력값 형식이 올바르지 않습니다. 입력 내용을 다시 확인하십시오.'
  }

  // Generic fallbacks by message text
  if (message.includes('duplicate key')) {
    return '중복된 값이 있습니다. 입력 내용을 다시 확인하십시오.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '저장 권한이 없습니다. 관리자에게 문의하십시오.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 인터넷 연결 상태를 확인한 후 다시 시도하십시오.'
  }

  return '거래처 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}

export default function NewCustomerPage() {
  const router = useRouter()

  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerType, setCustomerType] = useState('sales')
  const [ceoName, setCeoName] = useState('')
  const [businessNo, setBusinessNo] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setErrorMessage('')

    // 프론트 1차 검증
    if (!customerCode.trim()) {
      setErrorMessage('거래처 코드를 입력하십시오.')
      return
    }

    if (!customerName.trim()) {
      setErrorMessage('거래처명을 입력하십시오.')
      return
    }

    setIsSaving(true)

    const { error } = await supabase.from('customers').insert({
      customer_code: customerCode.trim(),
      customer_name: customerName.trim(),
      customer_type: customerType,
      ceo_name: ceoName.trim() || null,
      business_no: businessNo.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      is_active: true,
    })

    setIsSaving(false)

    if (error) {
      setErrorMessage(getCustomerErrorMessage(error))
      return
    }

    router.push('/customers')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/customers"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 거래처 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-bold">거래처 등록</h1>
          <p className="mt-1 text-gray-600">
            새로운 거래처 정보를 등록합니다.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white p-6 shadow"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              거래처코드
            </label>
            <input
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: CUST010"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              거래처명
            </label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: YT Company"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              거래처구분
            </label>
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            >
              <option value="sales">매출처</option>
              <option value="purchase">매입처</option>
              <option value="both">겸용</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              대표자명
            </label>
            <input
              value={ceoName}
              onChange={(e) => setCeoName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: 김영태"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              사업자번호
            </label>
            <input
              value={businessNo}
              onChange={(e) => setBusinessNo(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: 123-45-67890"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              연락처
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: 010-3333-5555"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              주소
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: 용인시 기흥구 영덕동"
            />
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          <Link
            href="/customers"
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}