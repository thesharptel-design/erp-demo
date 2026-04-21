'use client';

import { useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SearchableCombobox from '@/components/SearchableCombobox';
import { getAllowedWarehouseIds } from '@/lib/permissions';

export default function NewInboundPage() {
  const router = useRouter();
  
  // 기초 데이터 상태
  const [items, setItems] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);

  // 폼 입력 데이터 상태
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  const [inboundDate, setInboundDate] = useState(new Date().toISOString().split('T')[0]); 
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [remarks, setRemarks] = useState('');

  const [qty, setQty] = useState(1);
  const [lotNo, setLotNo] = useState('');
  const [expDate, setExpDate] = useState('');
  const [serialNo, setSerialNo] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const itemOptions = useMemo(
    () =>
      items.map((item) => ({
        value: String(item.id),
        label: `[${item.item_code}] ${item.item_name}`,
        keywords: [item.item_code, item.item_name],
      })),
    [items]
  );
  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: String(c.id), label: c.customer_name, keywords: [c.customer_name] })),
    [customers]
  );
  const warehouseOptions = useMemo(
    () => warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] })),
    [warehouses]
  );

  // 1. 초기 데이터 로드
  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let allowedWarehouseIds: number[] | null = [];
      if (session?.user) {
        const { data: user } = await supabase
          .from('app_users')
          .select('user_name, id, role_name, can_manage_permissions, can_admin_manage')
          .eq('id', session.user.id)
          .single();
        setUserData({ ...user, id: session.user.id });
        allowedWarehouseIds = await getAllowedWarehouseIds(user);
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

      let warehouseQuery = supabase
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (allowedWarehouseIds !== null) {
        if (allowedWarehouseIds.length === 0) {
          setWarehouses([]);
          setWarehouseId('');
          return;
        }
        warehouseQuery = warehouseQuery.in('id', allowedWarehouseIds);
      }
      const { data: warehouseData } = await warehouseQuery;
      setWarehouses(warehouseData || []);
      if (warehouseData?.[0]?.id) setWarehouseId(String(warehouseData[0].id));
    };
    fetchData();
  }, []);

  // 2. 품목 선택 시 해당 품목의 관리 정책에 따른 초기화
  const handleItemChange = (id: string) => {
    const itemId = id;
    setSelectedItemId(itemId);
    const item = items.find(i => i.id === parseInt(itemId));
    setSelectedItem(item);
    
    if (item?.is_sn_managed) {
      setQty(1);
    }
    
    setLotNo('');
    setExpDate('');
    setSerialNo('');
  };

  // 3. 입고 실행 (재고 반영 및 수불부 기록)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return alert('품목을 선택해주세요.');
    if (!customerId) return alert('거래처를 선택해주세요.');
    if (!warehouseId) return alert('입고 창고를 선택해주세요.');
    if (!userData?.id) return alert('사용자 인증 정보가 없습니다. 다시 로그인해주세요.');
    
    setIsSaving(true);
    try {
      // [A] 기존 재고(inventory) 검색
      let query = supabase
        .from('inventory')
        .select('*')
        .eq('item_id', selectedItemId)
        .eq('warehouse_id', Number(warehouseId));
      
      if (selectedItem?.is_lot_managed && lotNo) query = query.eq('lot_no', lotNo);
      else query = query.is('lot_no', null);
      
      if (selectedItem?.is_exp_managed && expDate) query = query.eq('exp_date', expDate);
      else query = query.is('exp_date', null);
      
      if (selectedItem?.is_sn_managed && serialNo) query = query.eq('serial_no', serialNo);
      else query = query.is('serial_no', null);

      const { data: existingStock, error: fetchError } = await query.maybeSingle();
      if (fetchError) throw fetchError;

// [B] 재고 데이터 갱신 (UPSERT)
      const itemIdNum = Number(selectedItemId)
      let inventoryIdForTx: number | null = null

      if (existingStock) {
        
        // 🚨 [핵심 방어 로직 추가] S/N 관리 품목인데 이미 창고에 수량이 있다면 절대 차단!
        if (selectedItem?.is_sn_managed && Number(existingStock.current_qty) > 0) {
            alert(`⛔ 중복 입고 불가: 해당 시리얼 번호(${serialNo})는 이미 창고에 존재하는 기기입니다!`);
            setIsSaving(false);
            return; // 👈 여기서 입고 프로세스를 강제 종료시킵니다.
        }

        // 기존 재고가 있으면 수량 업데이트 (S/N가 아닌 일반 LOT 제품들)
        const { error: updateError } = await supabase
          .from('inventory')
          .update({
            current_qty: Number(existingStock.current_qty) + Number(qty),
            available_qty: Number(existingStock.available_qty) + Number(qty),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingStock.id);
        
        if (updateError) throw updateError;
        inventoryIdForTx = Number(existingStock.id)
      } else {
        // 기존 재고가 없으면 신규 생성
        // ... (이하 기존 else 구문 동일)
           const { data: insertedRow, error: insertError } = await supabase
          .from('inventory')
          .insert({
            item_id: itemIdNum,
            lot_no: (selectedItem?.is_lot_managed && lotNo) ? lotNo : null,
            exp_date: (selectedItem?.is_exp_managed && expDate) ? expDate : null,
            serial_no: (selectedItem?.is_sn_managed && serialNo) ? serialNo : null,
            current_qty: qty,
            available_qty: qty,
            quarantine_qty: 0,
            warehouse_id: Number(warehouseId),
          })
          .select('id')
          .single();
          
        if (insertError) throw insertError;
        inventoryIdForTx = insertedRow?.id ?? null
      }

      // [C] 수불부(inventory_transactions) 상세 이력 기록
      // trans_date: YYYY-MM-DD만 넣으면 자정 UTC → KST 09:00로 고정되어 보임. 폼의 입고일 + 현재 시각(로컬)으로 합성.
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inboundDate);
      const now = new Date();
      const transDateIso =
        m != null
          ? new Date(
              Number(m[1]),
              Number(m[2]) - 1,
              Number(m[3]),
              now.getHours(),
              now.getMinutes(),
              now.getSeconds(),
              now.getMilliseconds()
            ).toISOString()
          : now.toISOString();

      const { error: transError } = await supabase
        .from('inventory_transactions')
        .insert({
          item_id: itemIdNum,
          trans_type: 'IN', // 👈 transaction_type 대신 스키마에 맞춰 trans_type 사용 및 제약조건에 맞춰 'IN' 입력
          qty: qty,
          lot_no: (selectedItem?.is_lot_managed && lotNo) ? lotNo : null,
          exp_date: (selectedItem?.is_exp_managed && expDate) ? expDate : null,
          serial_no: (selectedItem?.is_sn_managed && serialNo) ? serialNo : null,
          customer_id: parseInt(customerId),
          remarks: remarks || null,
          trans_date: transDateIso,
          actor_id: userData.id,
          created_by: userData.id, // 👈 스키마의 created_by 외래키 제약조건 대비
          warehouse_id: Number(warehouseId),
          inventory_id: inventoryIdForTx,
          ref_table: 'inbound_new',
        });

      if (transError) throw transError;

      alert('입고 등록 및 재고 반영이 성공적으로 완료되었습니다.');
      router.push('/inventory'); 
      router.refresh(); 
      
    } catch (error: any) {
      console.error('Inbound Process Error:', error);
      alert(`입고 처리 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto font-sans bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-gray-900">물품 입고 등록</h1>
        <p className="mt-2 text-sm font-bold text-gray-500">입고 내역을 등록하고 LOT/SN 등 추적 정보를 재고에 즉시 반영합니다.</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 섹션 1: 입고 기본 정보 */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          <h2 className="text-lg font-black text-gray-800 mb-6 flex items-center">
            <span className="w-1.5 h-5 bg-blue-600 rounded-full mr-2"></span>
            입고 기본 정보
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-black mb-2 text-gray-500 uppercase">입고 일자 <span className="text-red-500">*</span></label>
              <input 
                type="date" 
                value={inboundDate}
                onChange={(e) => setInboundDate(e.target.value)}
                className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-3 outline-none focus:border-blue-500 font-bold text-gray-700 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-black mb-2 text-gray-500 uppercase">거래처 (매입처) <span className="text-red-500">*</span></label>
              <SearchableCombobox
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                placeholder="거래처를 선택하세요"
              />
            </div>
            <div>
              <label className="block text-xs font-black mb-2 text-gray-500 uppercase">담당자</label>
              <input 
                type="text" 
                value={userData?.user_name || '사용자 로딩 중...'}
                disabled
                className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 font-black text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-black mb-2 text-gray-500 uppercase">입고 창고 <span className="text-red-500">*</span></label>
              <SearchableCombobox
                value={warehouseId}
                onChange={setWarehouseId}
                options={warehouseOptions}
                placeholder="창고 선택"
              />
            </div>
            <div className="lg:col-span-4">
              <label className="block text-xs font-black mb-2 text-gray-500 uppercase">입고 비고</label>
              <input 
                type="text" 
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="특이사항, 송장 번호 등을 입력하세요"
                className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl p-3 outline-none focus:border-blue-500 font-medium text-gray-700 transition-all"
              />
            </div>
          </div>
        </div>

        {/* 섹션 2: 품목 및 추적 정보 */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">
          <h2 className="text-lg font-black text-gray-800 mb-6 flex items-center">
            <span className="w-1.5 h-5 bg-green-500 rounded-full mr-2"></span>
            입고 품목 및 추적 정보
          </h2>

          <div className="mb-6">
            <label className="block text-xs font-black mb-2 text-gray-500 uppercase">입고 품목 선택 <span className="text-red-500">*</span></label>
            <SearchableCombobox
              value={selectedItemId}
              onChange={handleItemChange}
              options={itemOptions}
              placeholder="품목을 검색/선택하세요 (예: 벨)"
              className="text-lg"
            />
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border-2 transition-all duration-300 ${selectedItem ? 'border-blue-100 bg-blue-50/30' : 'border-gray-100 bg-gray-50 opacity-50 pointer-events-none'}`}>
            {/* 수량 */}
            <div>
              <label className="block text-sm font-black mb-2 text-gray-700">입고 수량 <span className="text-red-500">*</span></label>
              <input 
                type="number" 
                value={qty} 
                onChange={(e) => setQty(parseInt(e.target.value))}
                disabled={selectedItem?.is_sn_managed}
                min="1"
                className={`w-full border-2 rounded-xl p-3 outline-none transition-all font-black text-lg ${
                  selectedItem?.is_sn_managed 
                  ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'border-white focus:border-blue-500 shadow-sm'
                }`}
                required
              />
              {selectedItem?.is_sn_managed && (
                <p className="mt-1.5 text-xs font-bold text-purple-600">💡 S/N 관리 품목은 개별 등록(1개)만 가능합니다.</p>
              )}
            </div>

            {/* LOT 번호 */}
            <div>
              <label className="block text-sm font-black mb-2 text-gray-700">
                LOT 번호 {selectedItem?.is_lot_managed && <span className="text-red-500">*</span>}
              </label>
              {selectedItem?.is_lot_managed ? (
                <input 
                  value={lotNo} 
                  onChange={(e) => setLotNo(e.target.value)}
                  placeholder="LOT 번호를 입력하세요"
                  className="w-full border-2 border-white rounded-xl p-3 outline-none focus:border-blue-500 shadow-sm font-bold"
                  required
                />
              ) : (
                <div className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 text-gray-400 font-bold flex items-center justify-center cursor-not-allowed italic">
                  LOT 관리 대상 아님
                </div>
              )}
            </div>

            {/* 유효기간 */}
            <div>
              <label className="block text-sm font-black mb-2 text-gray-700">
                유효기간 (EXP) {selectedItem?.is_exp_managed && <span className="text-red-500">*</span>}
              </label>
              {selectedItem?.is_exp_managed ? (
                <input 
                  type="date" 
                  value={expDate} 
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full border-2 border-white rounded-xl p-3 outline-none focus:border-blue-500 shadow-sm font-bold"
                  required
                />
              ) : (
                <div className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 text-gray-400 font-bold flex items-center justify-center cursor-not-allowed italic">
                  유효기간 관리 대상 아님
                </div>
              )}
            </div>

            {/* S/N */}
            <div>
              <label className="block text-sm font-black mb-2 text-gray-700">
                시리얼 번호 (S/N) {selectedItem?.is_sn_managed && <span className="text-red-500">*</span>}
              </label>
              {selectedItem?.is_sn_managed ? (
                <input 
                  value={serialNo} 
                  onChange={(e) => setSerialNo(e.target.value)}
                  placeholder="장비 고유 번호를 입력하세요"
                  className="w-full border-2 border-purple-200 focus:border-purple-500 bg-purple-50 rounded-xl p-3 outline-none shadow-sm font-black text-purple-900"
                  required
                />
              ) : (
                <div className="w-full border-2 border-gray-100 bg-gray-100 rounded-xl p-3 text-gray-400 font-bold flex items-center justify-center cursor-not-allowed italic">
                  S/N 관리 대상 아님
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-4 pt-2">
          <button 
            type="submit" 
            disabled={isSaving || !selectedItem}
            className="flex-1 bg-black text-white py-4 rounded-2xl font-black text-lg hover:bg-gray-800 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '입고 처리 중...' : '입고 등록 완료'}
          </button>
          <Link 
            href="/inventory"
            className="px-10 border-2 border-gray-300 py-4 rounded-2xl font-black text-gray-600 hover:bg-gray-100 hover:text-black hover:border-gray-400 transition-all text-center flex items-center justify-center"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}