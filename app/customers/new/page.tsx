'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import SearchableCombobox from '@/components/SearchableCombobox'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

type SupabaseInsertError = {
  code?: string
  message: string
}

// 에러 메시지 변환 함수
function getCustomerErrorMessage(error: SupabaseInsertError) {
  const message = error.message.toLowerCase()
  if (error.code === '23505') {
    if (message.includes('customer_code')) return '거래처 코드가 중복되었습니다.'
    if (message.includes('business_no')) return '사업자번호가 중복되었습니다.'
    if (message.includes('customer_name')) return '이미 등록된 거래처명입니다.'
    return '중복된 값이 있습니다.'
  }
  return '거래처 저장 중 오류가 발생했습니다.'
}

export default function NewCustomerPage() {
  const router = useRouter()
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit()

  // 폼 상태 관리
  const [customerCode, setCustomerCode] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerType, setCustomerType] = useState('sales')
  const [ceoName, setCeoName] = useState('')
  const [businessNo, setBusinessNo] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const customerTypeOptions = [
    { value: 'sales', label: '매출처' },
    { value: 'purchase', label: '매입처' },
    { value: 'both', label: '겸용' },
  ]

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

    if (!customerCode.trim()) { setErrorMessage('거래처 코드를 입력하십시오.'); return; }
    if (!customerName.trim()) { setErrorMessage('거래처명을 입력하십시오.'); return; }

    await runSingleSubmit(async () => {
      setIsSaving(true)
      try {
      // 🌟 1. 중복 체크 (신규 등록이므로 전체 데이터 대상)
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('customer_name', customerName.trim())
        .maybeSingle();

      if (existing) {
        setErrorMessage(`'${customerName.trim()}'은(는) 이미 등록된 거래처명입니다.`);
        setIsSaving(false);
        return;
      }

      // 🌟 2. 신규 등록 (insert)
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

      if (error) {
        setErrorMessage(getCustomerErrorMessage(error))
        setIsSaving(false)
        return
      }

      alert('거래처가 성공적으로 등록되었습니다.');
      router.push('/customers')
      router.refresh()

      } catch {
        setErrorMessage('예상치 못한 오류가 발생했습니다.');
        setIsSaving(false);
      }
    })
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/customers" className="text-sm text-gray-500 hover:text-gray-700 font-bold">← 거래처 목록으로</Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900">거래처 등록</h1>
          <p className="mt-1 text-gray-600 font-medium">새로운 거래처(고객사) 정보를 등록합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow border border-gray-100">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">거래처코드 *</label>
            <input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none focus:border-black transition-all" placeholder="예: CUST001" required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">거래처명 * (중복 불가)</label>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={`w-full rounded-xl border px-4 py-3 font-medium outline-none transition-all ${errorMessage.includes('거래처명') ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-black'}`} placeholder="예: YT 바이오" required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">거래처구분</label>
            <SearchableCombobox
              value={customerType}
              onChange={setCustomerType}
              options={customerTypeOptions}
              placeholder="거래처구분 선택"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">대표자명</label>
            <input value={ceoName} onChange={(e) => setCeoName(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none" placeholder="예: 김영태" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">사업자번호</label>
            <input value={businessNo} onChange={(e) => setBusinessNo(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none" placeholder="예: 123-45-67890" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">연락처</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none" placeholder="예: 010-0000-0000" />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">주소</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none" placeholder="본사 주소를 입력하세요" />
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-bold text-red-600">
            {errorMessage}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button type="submit" disabled={isSaving || isMutating} className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50">
            {isSaving ? '저장 중...' : '거래처 등록'}
          </button>
          <Link href="/customers" className="rounded-xl border-2 border-gray-200 px-6 py-3 text-sm font-bold text-gray-600 hover:text-black transition-all">취소</Link>
        </div>
      </form>
    </div>
  )
}