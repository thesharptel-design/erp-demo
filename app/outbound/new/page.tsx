'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewOutboundPage() {
  const router = useRouter();
  
  // 기초 데이터 상태
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);

  // 폼 입력 데이터 상태
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  // 🌟 핵심: 창고 실재고 목록 및 선택된 재고(Batch)
  const [availableStocks, setAvailableStocks] = useState<any[]>([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [selectedStock, setSelectedStock] = useState<any>(null);

  const [outboundDate, setOutboundDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState(''); // 출고처 (고객사/현장)
  const [remarks, setRemarks] = useState('');
  const [qty, setQty] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // 1. 초기 데이터 로드
  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: user } = await supabase
          .from('app_users')
          .select('user_name, id')
          .eq('id', session.user.id)
          .single();
        setUserData({ ...user, id: session.user.id });
      }

      const { data: itemsData } = await supabase
        .from('items')
        .select('id, item_name, item_code, is_lot_managed, is_exp_managed, is_sn_managed')
        .eq('is_active', true);
      setItems(itemsData || []);

      const { data: customersData } = await supabase
        .from('customers')
        .select('id, customer_name')
        .eq('is_active', true);
      setCustomers(customersData || []);
    };
    fetchData();
  }, []);

  // 🌟 2. 품목 선택 시 실재고(Inventory) 불러오기
  const handleItemChange = async (id: string) => {
    setSelectedItemId(id);
    const item = items.find(i => i.id === parseInt(id));
    setSelectedItem(item);
    
    // 초기화
    setQty(1);
    setSelectedStockId('');
    setSelectedStock(null);
    setAvailableStocks([]);

    if (!id) return;

    // [핵심 수정] created_at 대신 id로 정렬하여 에러 방지!
    const { data: stocks, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('item_id', parseInt(id))
      .gt('current_qty', 0)
      .order('exp_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true }); // 수정 완료!

    if (error) {
      console.error('재고 불러오기 오류:', error);
      return;
    }

    setAvailableStocks(stocks || []);
  };

  // 🌟 3. 드롭다운(LOT, EXP, SN)에서 하나를 선택하면 모두 동기화
  const handleStockChange = (stockId: string) => {
    setSelectedStockId(stockId);
    const stock = availableStocks.find(s => s.id === parseInt(stockId));
    setSelectedStock(stock);
    if (selectedItem?.is_sn_managed) setQty(1);
  };

  // 4. 출고 실행 (재고 차감 엔진)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return alert('품목을 선택해주세요.');
    if (!customerId) return alert('출고처를 선택해주세요.');
    if (!userData?.id) return alert('사용자 인증 정보가 없습니다.');
    if (!selectedStock) return alert('출고할 재고(LOT/SN)를 선택해주세요.');
    if (qty > selectedStock.current_qty) return alert('선택한 재고의 잔량이 부족합니다.');
    
    setIsSaving(true);
    try {
      // [A] 재고 테이블(inventory) 차감 실행 (기존 대비 속도/안정성 개선)
      const { error: updateError } = await supabase
        .from('inventory')
        .update({
          current_qty: Number(selectedStock.current_qty) - Number(qty),
          available_qty: Number(selectedStock.available_qty) - Number(qty),
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedStock.id);
      
      if (updateError) throw updateError;

      // [B] 수불부(inventory_transactions)에 'OUT' 기록
      const { error: transError } = await supabase
        .from('inventory_transactions')
        .insert({
          item_id: selectedItemId,
          trans_type: 'OUT',
          qty: qty,
          lot_no: selectedStock.lot_no,
          exp_date: selectedStock.exp_date,
          serial_no: selectedStock.serial_no,
          customer_id: parseInt(customerId),
          remarks: remarks || null,
          transaction_date: outboundDate,
          actor_id: userData.id,
          created_by: userData.id
        });

      if (transError) throw transError;

      alert('출고 처리가 완료되었습니다. 재고가 정상 차감되었습니다.');
      router.push('/inventory'); 
      router.refresh(); 
      
    } catch (error: any) {
      console.error('Outbound Error:', error);
      alert(`출고 처리 중 오류: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto font-sans bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-black-600">물품 출고 등록</h1>
        <p className="mt-2 text-sm font-bold text-gray-500">출고처를 지정하고 재고를 차감합니다. (LOT/SN 검증 포함)</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 출고 기본 정보 */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <h2 className="text-lg font-black text-gray-800 mb-6 flex items-center">
                <span className="w-1.5 h-5 bg-red-600 rounded-full mr-2"></span>
                출고 기본 정보
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                    <label className="block text-xs font-black mb-2 text-gray-500 uppercase">출고 일자 *</label>
                    <input type="date" value={outboundDate} onChange={(e) => setOutboundDate(e.target.value)} className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-3 outline-none focus:border-red-500 font-bold text-gray-700 transition-all" required />
                </div>
                <div>
                    <label className="block text-xs font-black mb-2 text-gray-500 uppercase">출고처 (고객사/현장) *</label>
                    <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-3 outline-none focus:border-red-500 font-bold text-gray-700 transition-all" required>
                        <option value="">선택하세요</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.customer_name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-black mb-2 text-gray-500 uppercase">담당자</label>
                    <input type="text" value={userData?.user_name || '로딩중...'} disabled className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 font-black text-gray-500 cursor-not-allowed" />
                </div>
                <div className="lg:col-span-4">
                    <label className="block text-xs font-black mb-2 text-gray-500 uppercase">출고 비고</label>
                    <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="출고 사유나 특이사항 입력" className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-3 outline-none focus:border-red-500 font-medium text-gray-700 transition-all" />
                </div>
            </div>
        </div>

        {/* 출고 품목 및 상세 정보 (기존 양식 유지 + 드롭다운 융합) */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
            <h2 className="text-lg font-black text-gray-800 mb-6 flex items-center">
                <span className="w-1.5 h-5 bg-orange-500 rounded-full mr-2"></span>
                출고 품목 및 상세 정보
            </h2>
            <div className="mb-6">
                <label className="block text-xs font-black mb-2 text-gray-500 uppercase">품목 선택 *</label>
                <select value={selectedItemId} onChange={(e) => handleItemChange(e.target.value)} className="w-full border-2 border-gray-200 rounded-xl p-4 outline-none focus:border-black font-bold text-lg transition-all shadow-sm" required>
                    <option value="">출고할 품목을 선택하세요</option>
                    {items.map(item => <option key={item.id} value={item.id}>{`[${item.item_code}] ${item.item_name}`}</option>)}
                </select>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border-2 transition-all duration-300 ${selectedItem ? 'border-orange-100 bg-orange-50/30' : 'border-gray-100 bg-gray-50 opacity-50 pointer-events-none'}`}>
                
                {/* 1. 수량 */}
                <div>
                    <label className="block text-sm font-black mb-2 text-gray-700 flex justify-between">
                        <span>출고 수량 *</span>
                        {selectedStock && <span className="text-orange-600 text-xs font-bold">(선택된 재고 잔량: {selectedStock.current_qty})</span>}
                    </label>
                    <input 
                        type="number" 
                        value={qty} 
                        onChange={(e) => setQty(parseInt(e.target.value))} 
                        disabled={selectedItem?.is_sn_managed || !selectedStockId} 
                        min="1" 
                        max={selectedStock?.current_qty || 1}
                        className={`w-full border-2 rounded-xl p-3 outline-none transition-all font-black text-lg ${(!selectedStockId || selectedItem?.is_sn_managed) ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-white focus:border-orange-500 shadow-sm'}`} 
                        required 
                    />
                </div>

                {/* 2. LOT 번호 (드롭다운) */}
                <div>
                    <label className="block text-sm font-black mb-2 text-gray-700">LOT 번호 {selectedItem?.is_lot_managed && '*'}</label>
                    {selectedItem?.is_lot_managed ? (
                        <select 
                            value={selectedStockId} 
                            onChange={(e) => handleStockChange(e.target.value)} 
                            className="w-full border-2 border-white rounded-xl p-3 outline-none focus:border-orange-500 shadow-sm font-bold cursor-pointer" 
                            required
                        >
                            <option value="">{availableStocks.length > 0 ? '재고 선택 (선입선출 정렬)' : '가용 재고 없음'}</option>
                            {availableStocks.map(s => <option key={s.id} value={s.id}>{s.lot_no} (잔량: {s.current_qty})</option>)}
                        </select>
                    ) : (
                        <div className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 text-gray-400 font-bold flex items-center justify-center cursor-not-allowed italic text-xs">해당 없음 (LOT 관리 대상 아님)</div>
                    )}
                </div>

                {/* 3. 유효기간 (드롭다운) */}
                <div>
                    <label className="block text-sm font-black mb-2 text-gray-700">유효기간 {selectedItem?.is_exp_managed && '*'}</label>
                    {selectedItem?.is_exp_managed ? (
                        <select 
                            value={selectedStockId} 
                            onChange={(e) => handleStockChange(e.target.value)} 
                            className="w-full border-2 border-white rounded-xl p-3 outline-none focus:border-orange-500 shadow-sm font-bold cursor-pointer" 
                            required
                        >
                            <option value="">{availableStocks.length > 0 ? '재고 선택 (유효기간 임박순)' : '가용 재고 없음'}</option>
                            {availableStocks.map(s => <option key={s.id} value={s.id}>{s.exp_date} (잔량: {s.current_qty})</option>)}
                        </select>
                    ) : (
                        <div className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 text-gray-400 font-bold flex items-center justify-center cursor-not-allowed italic text-xs">해당 없음 (유효기간 관리 대상 아님)</div>
                    )}
                </div>

                {/* 4. 시리얼 번호 (드롭다운) */}
                <div>
                    <label className="block text-sm font-black mb-2 text-gray-700">시리얼 번호 (S/N) {selectedItem?.is_sn_managed && '*'}</label>
                    {selectedItem?.is_sn_managed ? (
                        <select 
                            value={selectedStockId} 
                            onChange={(e) => handleStockChange(e.target.value)} 
                            className="w-full border-2 border-white rounded-xl p-3 outline-none focus:border-orange-500 shadow-sm font-bold cursor-pointer" 
                            required
                        >
                            <option value="">{availableStocks.length > 0 ? '출고할 S/N 선택' : '가용 재고 없음'}</option>
                            {availableStocks.map(s => <option key={s.id} value={s.id}>{s.serial_no}</option>)}
                        </select>
                    ) : (
                        <div className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 text-gray-400 font-bold flex items-center justify-center cursor-not-allowed italic text-xs">해당 없음 (S/N 관리 대상 아님)</div>
                    )}
                </div>
            </div>
        </div>

        <div className="flex gap-4 pt-2">
          <button type="submit" disabled={isSaving || !selectedItem} className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-red-700 transition-all shadow-md disabled:opacity-50">
            {isSaving ? '출고 처리 중...' : '출고 완료 (재고 차감)'}
          </button>
          <Link href="/inventory" className="px-10 border-2 border-gray-300 py-4 rounded-2xl font-black text-gray-600 hover:bg-gray-100 text-center flex items-center justify-center">취소</Link>
        </div>
      </form>
    </div>
  );
}