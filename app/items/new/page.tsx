'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type SupabaseInsertError = {
  code?: string
  message: string
}

function getItemErrorMessage(error: SupabaseInsertError) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    if (message.includes('item_code')) {
      return '품목 코드가 중복되었습니다. 다른 품목 코드를 입력하십시오.'
    }
    return '중복된 값이 있습니다. 입력값을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    if (message.includes('item_code')) {
      return '품목 코드를 입력하십시오.'
    }
    if (message.includes('item_name')) {
      return '품목명을 입력하십시오.'
    }
    if (message.includes('item_type')) {
      return '품목 유형을 선택하십시오.'
    }
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (error.code === '23514') {
    return '입력값 형식이 올바르지 않습니다. 입력 내용을 다시 확인하십시오.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '저장 권한이 없습니다. 관리자에게 문의하십시오.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 인터넷 연결 상태를 확인한 후 다시 시도하십시오.'
  }

  return '품목 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}

export default function NewItemPage() {
  const router = useRouter()

  const [itemCode, setItemCode] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemSpec, setItemSpec] = useState('')
  const [unit, setUnit] = useState('EA')
  const [itemType, setItemType] = useState('finished')
  const [salesPrice, setSalesPrice] = useState('0')
  const [purchasePrice, setPurchasePrice] = useState('0')
  const [safetyStockQty, setSafetyStockQty] = useState('0')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

    if (!itemCode.trim()) {
      setErrorMessage('품목 코드를 입력하십시오.')
      return
    }

    if (!itemName.trim()) {
      setErrorMessage('품목명을 입력하십시오.')
      return
    }

    setIsSaving(true)

    const { error } = await supabase.from('items').insert({
      item_code: itemCode.trim(),
      item_name: itemName.trim(),
      item_spec: itemSpec.trim() || null,
      unit: unit.trim() || 'EA',
      item_type: itemType,
      sales_price: Number(salesPrice) || 0,
      purchase_price: Number(purchasePrice) || 0,
      safety_stock_qty: Number(safetyStockQty) || 0,
      is_active: true,
    })

    setIsSaving(false)

    if (error) {
      setErrorMessage(getItemErrorMessage(error))
      return
    }

    router.push('/items')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/items"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 품목 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-bold">품목 등록</h1>
          <p className="mt-1 text-gray-600">새로운 품목 정보를 등록합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              품목코드
            </label>
            <input
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: FG010"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              품목명
            </label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: 신규진단키트"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              규격
            </label>
            <input
              value={itemSpec}
              onChange={(e) => setItemSpec(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: SET"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              단위
            </label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              placeholder="예: EA"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              품목유형
            </label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            >
              <option value="finished">완제품</option>
              <option value="raw_material">원재료</option>
              <option value="sub_material">부자재</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              판매단가
            </label>
            <input
              type="number"
              value={salesPrice}
              onChange={(e) => setSalesPrice(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              구매단가
            </label>
            <input
              type="number"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              안전재고
            </label>
            <input
              type="number"
              value={safetyStockQty}
              onChange={(e) => setSafetyStockQty(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
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
            href="/items"
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}