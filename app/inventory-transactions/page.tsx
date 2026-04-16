'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function InventoryTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, IN, OUT

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      
      // 1. 수불부(이력) 데이터 가져오기
      const { data: txData, error } = await supabase
        .from('inventory_transactions')
        .select(`
          *,
          items (item_code, item_name, unit)
        `)
        .order('trans_date', { ascending: false });

      if (error) throw error;

      // 2. 처리자(User) 이름 매핑용 데이터 가져오기
      const { data: usersData } = await supabase.from('app_users').select('id, user_name');
      const userMap = new Map(usersData?.map(u => [u.id, u.user_name]) || []);

      // 🌟 3. 거래처(Customer) 이름 매핑용 데이터 가져오기
      const { data: customersData } = await supabase.from('customers').select('id, customer_name');
      const customerMap = new Map(customersData?.map(c => [c.id, c.customer_name]) || []);

      // 4. 데이터 병합
      const mergedData = txData?.map(tx => ({
        ...tx,
        processor_name: userMap.get(tx.created_by) || '시스템',
        customer_name: customerMap.get(tx.customer_id) || '-', // 🌟 거래처 이름 매핑
        item: tx.items || {} 
      })) || [];

      setTransactions(mergedData);
    } catch (err: any) {
      console.error('데이터 로드 실패:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    if (type === 'IN' || type === 'PROD_IN') return <span className="px-2 py-1 bg-blue-100 text-blue-700 font-bold rounded text-xs">입고</span>;
    if (type === 'OUT' || type === 'MATL_OUT') return <span className="px-2 py-1 bg-red-100 text-red-700 font-bold rounded text-xs">출고</span>;
    if (type === 'ADJUST') return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 font-bold rounded text-xs">재고조정</span>;
    return <span className="px-2 py-1 bg-gray-100 text-gray-700 font-bold rounded text-xs">{type}</span>;
  };

  const getRefLabel = (table: string, id: number) => {
    if (!table) return '-';
    if (table === 'outbound_requests') return `출고요청서 (ID: ${id})`;
    if (table === 'purchase_orders') return `발주서 (ID: ${id})`;
    if (table === 'production_orders') return `생산지시서 (ID: ${id})`;
    return `${table} (${id})`;
  };

  const filteredData = transactions.filter(tx => filter === 'ALL' || tx.trans_type === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto text-gray-800 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tighter">입출고 현황 (수불부)</h1>
        <p className="text-gray-500 font-bold mt-2">창고에서 발생한 모든 자재의 입고 및 출고 이력을 확인합니다.</p>
      </header>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setFilter('ALL')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${filter === 'ALL' ? 'bg-black text-white' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-black'}`}>
          전체 보기
        </button>
        <button onClick={() => setFilter('IN')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${filter === 'IN' ? 'bg-blue-600 text-white border-2 border-blue-600' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-blue-600'}`}>
          입고 내역
        </button>
        <button onClick={() => setFilter('OUT')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${filter === 'OUT' ? 'bg-red-600 text-white border-2 border-red-600' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-red-600'}`}>
          출고 내역
        </button>
      </div>

      <section className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b-2 border-gray-200 text-gray-500">
              <tr>
                <th className="p-4 font-black">일시</th>
                <th className="p-4 font-black text-center w-24">구분</th>
                <th className="p-4 font-black">품목코드</th>
                <th className="p-4 font-black">품목명</th>
                {/* 🌟 새로 추가된 컬럼 */}
                <th className="p-4 font-black text-blue-700">거래처</th>
                <th className="p-4 font-black text-right w-32">수량</th>
                {/* 🌟 새로 추가된 컬럼 */}
                <th className="p-4 font-black text-gray-600">비고 (사유)</th>
                <th className="p-4 font-black">처리자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="p-10 text-center font-bold text-gray-400">데이터를 불러오는 중입니다...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center font-bold text-gray-400">입출고 내역이 없습니다.</td></tr>
              ) : (
                filteredData.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-bold text-gray-500">
                      {new Date(tx.trans_date).toLocaleString('ko-KR', { 
                        year: 'numeric', month: '2-digit', day: '2-digit', 
                        hour: '2-digit', minute: '2-digit' 
                      })}
                    </td>
                    <td className="p-4 text-center">{getTypeLabel(tx.trans_type)}</td>
                    <td className="p-4 font-black text-gray-600">{tx.item?.item_code || '정보없음'}</td>
                    <td className="p-4 font-bold">{tx.item?.item_name || '-'}</td>
                    
                    {/* 🌟 거래처 표시 */}
                    <td className="p-4 font-bold text-blue-800">{tx.customer_name}</td>
                    
                    <td className={`p-4 font-black text-right text-lg ${tx.trans_type === 'IN' || tx.trans_type === 'PROD_IN' ? 'text-blue-600' : 'text-red-500'}`}>
                      {tx.trans_type === 'OUT' || tx.trans_type === 'MATL_OUT' ? '-' : '+'}{tx.qty} <span className="text-xs text-gray-400 font-normal">{tx.item?.unit}</span>
                    </td>
                    
                    {/* 🌟 비고 표시 (너무 길면 말줄임표 처리) */}
                    <td className="p-4 font-medium text-gray-500 max-w-[200px] truncate" title={tx.remarks}>
                      {tx.remarks || '-'}
                    </td>
                    
                    <td className="p-4 font-bold">{tx.processor_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}