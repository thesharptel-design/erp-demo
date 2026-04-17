'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function InventoryTransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 필터 및 검색 상태
  const [filter, setFilter] = useState('ALL'); // ALL, IN, OUT
  const [searchTerm, setSearchTerm] = useState('');

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

      // 3. 거래처(Customer) 이름 매핑용 데이터 가져오기
      const { data: customersData } = await supabase.from('customers').select('id, customer_name');
      const customerMap = new Map(customersData?.map(c => [c.id, c.customer_name]) || []);

      // 4. 데이터 병합
      const mergedData = txData?.map(tx => ({
        ...tx,
        processor_name: userMap.get(tx.created_by) || '시스템',
        customer_name: customerMap.get(tx.customer_id) || '-', 
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
    if (type === 'IN' || type === 'PROD_IN') return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 font-bold rounded-md text-xs border border-blue-200 shadow-sm">입고</span>;
    if (type === 'OUT' || type === 'MATL_OUT') return <span className="px-2.5 py-1 bg-red-100 text-red-700 font-bold rounded-md text-xs border border-red-200 shadow-sm">출고</span>;
    if (type === 'ADJUST') return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 font-bold rounded-md text-xs border border-yellow-200 shadow-sm">재고조정</span>;
    return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 font-bold rounded-md text-xs border border-gray-200">{type}</span>;
  };

  // 🌟 프론트엔드 필터링 (구분 필터 + 검색어)
  const filteredData = transactions.filter(tx => {
    // 1. 입/출고 구분 필터
    const matchType = filter === 'ALL' || tx.trans_type === filter;
    
    // 2. 검색어 필터 (품목명, 거래처, 비고)
    const term = searchTerm.toLowerCase();
    const matchSearch = 
      (tx.item?.item_name || '').toLowerCase().includes(term) ||
      (tx.customer_name || '').toLowerCase().includes(term) ||
      (tx.remarks || '').toLowerCase().includes(term);

    return matchType && matchSearch;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen space-y-6">
      
      {/* 🌟 헤더 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">입출고 현황 (수불부)</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">창고에서 발생한 모든 자재의 입고 및 출고 이력을 확인합니다.</p>
        </div>
      </div>

      {/* 🌟 컨트롤 패널 (필터 버튼 + 검색창) */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={() => setFilter('ALL')} 
            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${filter === 'ALL' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            전체 보기
          </button>
          <button 
            onClick={() => setFilter('IN')} 
            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${filter === 'IN' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200'}`}
          >
            입고 내역
          </button>
          <button 
            onClick={() => setFilter('OUT')} 
            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${filter === 'OUT' ? 'bg-red-600 text-white border-red-600' : 'bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200'}`}
          >
            출고 내역
          </button>
        </div>

        {/* 검색창 추가 */}
        <div className="w-full md:w-80">
          <input 
            type="text" 
            placeholder="품목명, 거래처, 비고 검색..." 
            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* 🌟 데이터 테이블 (모바일 가로 스크롤 적용) */}
      <section className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
              <tr>
                <th className="px-5 py-4 font-bold">일시</th>
                <th className="px-5 py-4 font-bold text-center w-24">구분</th>
                <th className="px-5 py-4 font-bold">품목정보</th>
                <th className="px-5 py-4 font-bold text-blue-700">거래처</th>
                <th className="px-5 py-4 font-bold text-right w-32">수량</th>
                <th className="px-5 py-4 font-bold text-gray-500">비고 (사유)</th>
                <th className="px-5 py-4 font-bold text-center">처리자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center font-bold text-gray-400">데이터를 불러오는 중입니다...</td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center font-bold text-gray-400">조회된 입출고 내역이 없습니다.</td>
                </tr>
              ) : (
                filteredData.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-bold text-gray-400 text-xs tracking-tight">
                      {new Date(tx.trans_date).toLocaleString('ko-KR', { 
                        year: 'numeric', month: '2-digit', day: '2-digit', 
                        hour: '2-digit', minute: '2-digit' 
                      })}
                    </td>
                    <td className="px-5 py-4 text-center">{getTypeLabel(tx.trans_type)}</td>
                    <td className="px-5 py-4">
                      <div className="font-black text-gray-800">{tx.item?.item_name || '-'}</div>
                      <div className="text-xs font-bold text-blue-600 mt-0.5">{tx.item?.item_code || '정보없음'}</div>
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-700">
                      {tx.customer_name === '-' ? <span className="text-gray-300 italic">-</span> : tx.customer_name}
                    </td>
                    <td className={`px-5 py-4 font-black text-right text-lg ${tx.trans_type === 'IN' || tx.trans_type === 'PROD_IN' ? 'text-blue-600' : 'text-red-500'}`}>
                      {tx.trans_type === 'OUT' || tx.trans_type === 'MATL_OUT' ? '-' : '+'}{tx.qty} 
                      <span className="text-xs text-gray-400 font-bold ml-1">{tx.item?.unit}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-500 max-w-[250px] truncate" title={tx.remarks}>
                        {tx.remarks || <span className="text-gray-300 italic">-</span>}
                      </div>
                      {/* LOT 정보가 있으면 작게 표시해 줍니다 */}
                      {(tx.lot_no || tx.serial_no) && (
                        <div className="text-[10px] text-gray-400 font-bold mt-1 tracking-wider">
                          {tx.lot_no && `[LOT: ${tx.lot_no}]`} {tx.serial_no && `[SN: ${tx.serial_no}]`}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-600 text-center">
                      {tx.processor_name}
                    </td>
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