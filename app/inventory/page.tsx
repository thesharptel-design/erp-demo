'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function InventoryPage() {
  const [groupedInventory, setGroupedInventory] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchInventory() {
      // 1. 재고 데이터와 품목의 관리 옵션(is_lot, is_exp, is_sn)을 함께 가져옵니다.
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id,
          current_qty,
          available_qty,
          lot_no,
          exp_date,
          serial_no,
          items!inner (
            item_code,
            item_name,
            item_spec,
            unit,
            is_lot_managed,
            is_exp_managed,
            is_sn_managed
          )
        `)
        .gt('current_qty', 0)
        .order('exp_date', { ascending: true });

      if (error) {
        console.error(error.message);
        setIsLoading(false);
        return;
      }

      const groups: Record<string, any> = {};
      
      data?.forEach((row: any) => {
        const code = row.items.item_code;
        
        if (!groups[code]) {
          groups[code] = {
            item_code: code,
            item_name: row.items.item_name,
            item_spec: row.items.item_spec,
            unit: row.items.unit,
            is_lot: row.items.is_lot_managed,
            is_exp: row.items.is_exp_managed,
            is_sn: row.items.is_sn_managed,
            total_qty: 0,
            details: []
          };
        }
        
        groups[code].total_qty += Number(row.current_qty);
        groups[code].details.push(row);
      });

      setGroupedInventory(Object.values(groups));
      setIsLoading(false);
    }

    fetchInventory();
  }, []);

  const toggleRow = (code: string, isTrackable: boolean) => {
    // 🌟 추적 관리 대상이 아니면 아예 열리지 않도록 차단
    if (!isTrackable) return;
    
    setExpandedRows(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-gray-900">현재고 현황</h1>
        <p className="mt-2 text-sm font-bold text-gray-500">품목별 총 재고를 확인하고, 관리 품목은 클릭하여 LOT 및 S/N별 상세 내역을 조회합니다.</p>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-12 px-6 py-4"></th>
              <th className="px-6 py-4 text-left font-black text-gray-500 uppercase tracking-wider">품목코드</th>
              <th className="px-6 py-4 text-left font-black text-gray-500 uppercase tracking-wider">품목명 / 관리옵션</th>
              <th className="px-6 py-4 text-left font-black text-gray-500 uppercase tracking-wider">규격</th>
              <th className="px-6 py-4 text-right font-black text-gray-800 uppercase tracking-wider text-lg">총 재고수량</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400 font-bold">
                  재고 데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : groupedInventory.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400 font-bold">
                  현재 창고에 보관 중인 재고가 없습니다.
                </td>
              </tr>
            ) : (
              groupedInventory.map((group) => {
                // 이 품목이 하나라도 추적 관리를 하는지 확인
                const isTrackable = group.is_lot || group.is_exp || group.is_sn;

                return (
                  <React.Fragment key={group.item_code}>
                    <tr 
                      onClick={() => toggleRow(group.item_code, isTrackable)} 
                      // 🌟 추적 관리 대상일 때만 마우스 포인터 변경 및 배경색 효과 적용
                      className={`transition-colors ${
                        isTrackable ? 'cursor-pointer hover:bg-gray-50' : 'bg-white'
                      } ${expandedRows[group.item_code] ? 'bg-blue-50/50' : ''}`}
                    >
                      <td className="px-6 py-4 text-center text-gray-400 font-black text-xs transition-transform duration-200">
                        {/* 🌟 추적 대상이 아니면 화살표 대신 '-' 표시 */}
                        {isTrackable ? (expandedRows[group.item_code] ? '▼' : '▶') : '-'}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-600">
                        {group.item_code}
                      </td>
                      <td className="px-6 py-4 font-black text-gray-900 text-base">
                        <div className="flex items-center gap-2">
                          {/* 🌟 품목명 앞에 관리 옵션 배지 표시 */}
                          <div className="flex gap-1">
                            {group.is_lot && <span className="px-1.5 py-0.5 text-[10px] font-black bg-blue-100 text-blue-700 rounded uppercase tracking-wider">LOT</span>}
                            {group.is_exp && <span className="px-1.5 py-0.5 text-[10px] font-black bg-green-100 text-green-700 rounded uppercase tracking-wider">EXP</span>}
                            {group.is_sn && <span className="px-1.5 py-0.5 text-[10px] font-black bg-purple-100 text-purple-700 rounded uppercase tracking-wider">S/N</span>}
                          </div>
                          <span>{group.item_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-500">
                        {group.item_spec || '-'}
                      </td>
                      <td className="px-6 py-4 font-black text-blue-600 text-right text-xl">
                        {group.total_qty.toLocaleString()} <span className="text-sm text-gray-400 font-bold ml-1">{group.unit}</span>
                      </td>
                    </tr>

                    {/* 추적 관리 대상이면서, 아코디언이 열렸을 때만 렌더링 */}
                    {isTrackable && expandedRows[group.item_code] && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={5} className="p-0 border-b border-gray-200">
                          <div className="px-14 py-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <table className="w-full text-xs bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                              <thead className="bg-gray-100/80 text-gray-500 font-bold">
                                <tr>
                                  <th className="px-4 py-3 text-left">LOT 번호</th>
                                  <th className="px-4 py-3 text-left">유효기간 (EXP)</th>
                                  <th className="px-4 py-3 text-left">시리얼 번호 (S/N)</th>
                                  <th className="px-4 py-3 text-right">보유 수량</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {group.details.map((detail: any, idx: number) => (
                                  <tr key={detail.id || idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-bold text-gray-700">
                                      {detail.lot_no || <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-green-700">
                                      {detail.exp_date || <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-purple-700">
                                      {detail.serial_no || <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="px-4 py-3 font-black text-right text-sm text-gray-800">
                                      {detail.current_qty}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}