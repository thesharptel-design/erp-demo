'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function InventoryTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, INBOUND, OUTBOUND

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      
      // 1. 수불부 데이터와 품목 정보 가져오기
      const { data: txData, error } = await supabase
        .from('inventory_transactions')
        .select(`
          *,
          item:items(item_code, item_name, unit)
        `)
        .order('trans_date', { ascending: false });

      if (error) throw error;

      // 2. 작성자(처리자) 이름을 매핑하기 위해 유저 정보 가져오기
      // (FK 에러 방지를 위해 안전하게 별도로 가져와서 매핑합니다)
      const { data: usersData } = await supabase.from('app_users').select('id, user_name');
      const userMap = new Map(usersData?.map(u => [u.id, u.user_name]) || []);

      // 3. 데이터 병합
      const mergedData = txData?.map(tx => ({
        ...tx,
        processor_name: userMap.get(tx.created_by) || '시스템'
      })) || [];

      setTransactions(mergedData);
    } catch (err: any) {
      console.error('데이터 로드 실패:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // 구분(입출고) 한글 변환
  const getTypeLabel = (type: string) => {
    if (type === 'INBOUND') return <span className="px-2 py-1 bg-blue-100 text-blue-700 font-bold rounded text-xs">입고</span>;
    if (type === 'OUTBOUND') return <span className="px-2 py-1 bg-red-100 text-red-700 font-bold rounded text-xs">출고</span>;
    return <span className="px-2 py-1 bg-gray-100 text-gray-700 font-bold rounded text-xs">{type}</span>;
  };

  // 출처 문서 한글 변환
  const getRefLabel = (table: string, id: number) => {
    if (!table) return '-';
    if (table === 'outbound_requests') return `출고요청서 (ID: ${id})`;
    if (table === 'purchase_orders') return `발주서 (ID: ${id})`;
    if (table === 'production_orders') return `생산지시서 (ID: ${id})`;
    return `${table} (${id})`;
  };

  // 필터링 적용
  const filteredData = transactions.filter(tx => filter === 'ALL' || tx.trans_type === filter);

  return (
    <div className="p-8 max-w-7xl mx-auto text-gray-800 font-sans">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tighter">입출고 현황 (수불부)</h1>
        <p className="text-gray-500 font-bold mt-2">창고에서 발생한 모든 자재의 입고 및 출고 이력을 확인합니다.</p>
      </header>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setFilter('ALL')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${filter === 'ALL' ? 'bg-black text-white' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-black'}`}>
          전체 보기
        </button>
        <button onClick={() => setFilter('INBOUND')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${filter === 'INBOUND' ? 'bg-blue-600 text-white border-2 border-blue-600' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-blue-600'}`}>
          입고 내역
        </button>
        <button onClick={() => setFilter('OUTBOUND')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-colors ${filter === 'OUTBOUND' ? 'bg-red-600 text-white border-2 border-red-600' : 'bg-white border-2 border-gray-200 text-gray-500 hover:border-red-600'}`}>
          출고 내역
        </button>
      </div>

      {/* 데이터 테이블 */}
      <section className="bg-white border-2 border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b-2 border-gray-200 text-gray-500">
              <tr>
                <th className="p-4 font-black">일시</th>
                <th className="p-4 font-black text-center w-24">구분</th>
                <th className="p-4 font-black">품목코드</th>
                <th className="p-4 font-black">품목명</th>
                <th className="p-4 font-black text-right w-32">수량</th>
                <th className="p-4 font-black">근거 문서</th>
                <th className="p-4 font-black">처리자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="p-10 text-center font-bold text-gray-400">데이터를 불러오는 중입니다...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan={7} className="p-10 text-center font-bold text-gray-400">입출고 내역이 없습니다.</td></tr>
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
                    <td className="p-4 font-black text-gray-600">{tx.item?.item_code || '삭제된품목'}</td>
                    <td className="p-4 font-bold">{tx.item?.item_name || '-'}</td>
                    <td className={`p-4 font-black text-right text-lg ${tx.trans_type === 'INBOUND' ? 'text-blue-600' : 'text-red-500'}`}>
                      {tx.trans_type === 'OUTBOUND' ? '-' : '+'}{tx.qty} <span className="text-xs text-gray-400 font-normal">{tx.item?.unit}</span>
                    </td>
                    <td className="p-4 font-bold text-gray-500">{getRefLabel(tx.ref_table, tx.ref_id)}</td>
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