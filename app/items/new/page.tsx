'use client';

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
    // 🌟 추가: 품목명 유니크 제약조건 위반 시 메시지
    if (message.includes('item_name')) {
      return '이미 등록된 품목명입니다. 다른 이름을 입력하십시오.'
    }
    return '중복된 값이 있습니다. 입력값을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    if (message.includes('item_code')) return '품목 코드를 입력하십시오.'
    if (message.includes('item_name')) return '품목명을 입력하십시오.'
    if (message.includes('item_type')) return '품목 유형을 선택하십시오.'
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (error.code === '23514') return '입력값 형식이 올바르지 않습니다. 입력 내용을 다시 확인하십시오.'
  if (message.includes('row-level security') || message.includes('permission denied')) return '저장 권한이 없습니다. 관리자에게 문의하십시오.'
  if (message.includes('network') || message.includes('fetch')) return '네트워크 오류가 발생했습니다. 인터넷 연결 상태를 확인한 후 다시 시도하십시오.'

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
  
  const [isLotManaged, setIsLotManaged] = useState(false)
  const [isExpManaged, setIsExpManaged] = useState(false)
  const [isSnManaged, setIsSnManaged] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

    if (!itemCode.trim()) { setErrorMessage('품목 코드를 입력하십시오.'); return; }
    if (!itemName.trim()) { setErrorMessage('품목명을 입력하십시오.'); return; }

    setIsSaving(true)

    try {
      // 🌟 [추가 로직] DB에 insert 하기 전에 품목명 중복을 먼저 체크합니다.
      const { data: existingName } = await supabase
        .from('items')
        .select('id')
        .eq('item_name', itemName.trim())
        .maybeSingle();

      if (existingName) {
        setErrorMessage(`'${itemName.trim()}'은(는) 이미 존재하는 품목명입니다.`);
        setIsSaving(false);
        return;
      }

      // 실제 저장 로직
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
        is_lot_managed: isLotManaged,
        is_exp_managed: isExpManaged,
        is_sn_managed: isSnManaged,
      })

      if (error) {
        setErrorMessage(getItemErrorMessage(error))
        setIsSaving(false)
        return
      }

      alert('품목이 성공적으로 등록되었습니다.');
      router.push('/items')
      router.refresh()

    } catch (err) {
      setErrorMessage('예상치 못한 오류가 발생했습니다.');
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/items" className="text-sm text-gray-500 hover:text-gray-700 font-bold">← 품목 목록으로</Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">품목 등록</h1>
          <p className="mt-1 text-gray-600 font-medium">새로운 품목 정보를 등록합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow border border-gray-100">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목코드</label>
            <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none focus:border-black focus:ring-1 focus:ring-black transition-all" placeholder="예: FG010" required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목명 (중복 불가)</label>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} className={`w-full rounded-xl border px-4 py-3 font-medium outline-none transition-all ${errorMessage.includes('품목명') ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-black'}`} placeholder="예: 진단키트 A형" required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">규격</label>
            <input value={itemSpec} onChange={(e) => setItemSpec(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none focus:border-black transition-all" placeholder="예: SET" />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">단위</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium focus:border-black transition-all" />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목유형</label>
            <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium focus:border-black transition-all">
              <option value="finished">완제품</option>
              <option value="raw_material">원재료</option>
              <option value="sub_material">부자재</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">안전재고</label>
            <input type="number" value={safetyStockQty} onChange={(e) => setSafetyStockQty(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium focus:border-black transition-all" />
          </div>

          {/* 추적/이력 관리 설정 박스 */}
          <div className="col-span-1 md:col-span-2 mt-2 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <h3 className="mb-4 text-sm font-black text-blue-900 tracking-tight">추적 / 이력 관리 설정</h3>
            <div className="flex flex-wrap gap-8">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={isLotManaged} onChange={(e) => setIsLotManaged(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" />
                <span className="text-sm font-bold text-gray-700 group-hover:text-black transition-colors">LOT 번호 관리</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={isExpManaged} onChange={(e) => setIsExpManaged(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" />
                <span className="text-sm font-bold text-gray-700 group-hover:text-black transition-colors">유효기간 (EXP) 관리</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={isSnManaged} onChange={(e) => setIsSnManaged(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600" />
                <span className="text-sm font-bold text-gray-700 group-hover:text-black transition-colors">S/N (시리얼) 관리</span>
              </label>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-bold text-red-600 animate-pulse">
            {errorMessage}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button type="submit" disabled={isSaving} className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50">
            {isSaving ? '저장 중...' : '품목 저장'}
          </button>
          <Link href="/items" className="rounded-xl border-2 border-gray-200 px-6 py-3 text-sm font-bold text-gray-600 hover:text-black hover:border-gray-300 transition-all">취소</Link>
        </div>
      </form>
    </div>
  )
}