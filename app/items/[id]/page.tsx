'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SearchableCombobox from '@/components/SearchableCombobox';

export default function ItemEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const id = resolvedParams.id;

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 폼 상태 관리 (등록 페이지 양식과 동일)
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemSpec, setItemSpec] = useState('');
  const [unit, setUnit] = useState('EA');
  const [itemType, setItemType] = useState('finished');
  const [salesPrice, setSalesPrice] = useState('0');
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [safetyStockQty, setSafetyStockQty] = useState('0');
  const [isLotManaged, setIsLotManaged] = useState(false);
  const [isExpManaged, setIsExpManaged] = useState(false);
  const [isSnManaged, setIsSnManaged] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const itemTypeOptions = [
    { value: 'finished', label: '완제품' },
    { value: 'raw_material', label: '원재료' },
    { value: 'sub_material', label: '부자재' },
  ];

  // 1. 기존 데이터 불러오기
  useEffect(() => {
    async function loadItem() {
      const { data } = await supabase.from('items').select('*').eq('id', id).single();
      if (data) {
        setItemCode(data.item_code);
        setItemName(data.item_name);
        setItemSpec(data.item_spec || '');
        setUnit(data.unit || 'EA');
        setItemType(data.item_type);
        setSalesPrice(String(data.sales_price));
        setPurchasePrice(String(data.purchase_price));
        setSafetyStockQty(String(data.safety_stock_qty));
        setIsLotManaged(data.is_lot_managed);
        setIsExpManaged(data.is_exp_managed);
        setIsSnManaged(data.is_sn_managed);
        setIsActive(data.is_active);
      }
    }
    loadItem();
  }, [id]);

  // 2. 수정 저장 핸들러 (중복 체크 포함)
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage('');
    setIsSaving(true);

    try {
      // 품목명 중복 체크 (나 자신은 제외)
      const { data: duplicate } = await supabase
        .from('items')
        .select('id')
        .eq('item_name', itemName.trim())
        .neq('id', id)
        .maybeSingle();

      if (duplicate) {
        setErrorMessage(`'${itemName.trim()}'은(는) 이미 다른 품목에서 사용 중인 이름입니다.`);
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('items')
        .update({
          item_code: itemCode.trim(),
          item_name: itemName.trim(),
          item_spec: itemSpec.trim() || null,
          unit: unit.trim() || 'EA',
          item_type: itemType,
          sales_price: Number(salesPrice) || 0,
          purchase_price: Number(purchasePrice) || 0,
          safety_stock_qty: Number(safetyStockQty) || 0,
          is_lot_managed: isLotManaged,
          is_exp_managed: isExpManaged,
          is_sn_managed: isSnManaged,
          is_active: isActive,
        })
        .eq('id', id);

      if (error) throw error;

      alert('품목 정보가 수정되었습니다.');
      router.push('/items');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err.message);
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/items" className="text-sm text-gray-500 hover:text-gray-700 font-bold">← 품목 목록으로</Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">품목 정보 수정</h1>
          <p className="mt-1 text-gray-600 font-medium">기존 품목의 상세 정보를 수정합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow border border-gray-100">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목코드</label>
            <input value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none focus:border-black transition-all" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목명 (중복 체크 대상)</label>
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} className={`w-full rounded-xl border px-4 py-3 font-medium outline-none transition-all ${errorMessage.includes('품목명') ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-black'}`} required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">규격</label>
            <input value={itemSpec} onChange={(e) => setItemSpec(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none focus:border-black transition-all" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">단위</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none focus:border-black transition-all" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목유형</label>
            <SearchableCombobox
              value={itemType}
              onChange={setItemType}
              options={itemTypeOptions}
              placeholder="품목유형 선택"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">안전재고</label>
            <input type="number" value={safetyStockQty} onChange={(e) => setSafetyStockQty(e.target.value)} className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium focus:border-black outline-none transition-all" />
          </div>

          <div className="col-span-1 md:col-span-2 mt-2 rounded-xl border border-blue-100 bg-blue-50/50 p-5">
            <h3 className="mb-4 text-sm font-black text-blue-900 tracking-tight">추적 / 이력 관리 설정</h3>
            <div className="flex flex-wrap gap-8">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={isLotManaged} onChange={(e) => setIsLotManaged(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                <span className="text-sm font-bold text-gray-700">LOT 번호 관리</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={isExpManaged} onChange={(e) => setIsExpManaged(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-600" />
                <span className="text-sm font-bold text-gray-700">유효기간 (EXP) 관리</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={isSnManaged} onChange={(e) => setIsSnManaged(e.target.checked)} className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600" />
                <span className="text-sm font-bold text-gray-700">S/N (시리얼) 관리</span>
              </label>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-bold text-red-600">
            {errorMessage}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button type="submit" disabled={isSaving} className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50">
            {isSaving ? '저장 중...' : '수정사항 저장'}
          </button>
          <button 
            type="button" 
            onClick={async () => {
                if(!confirm('정말 사용 중단하시겠습니까?')) return;
                await supabase.from('items').update({ is_active: false }).eq('id', id);
                router.push('/items');
            }}
            className="rounded-xl bg-red-50 px-6 py-3 text-sm font-bold text-red-600 hover:bg-red-600 hover:text-white transition-all"
          >
            사용 중단
          </button>
          <Link href="/items" className="rounded-xl border-2 border-gray-200 px-6 py-3 text-sm font-bold text-gray-600 hover:text-black transition-all">취소</Link>
        </div>
      </form>
    </div>
  );
}