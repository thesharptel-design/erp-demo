'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import SearchableCombobox from '@/components/SearchableCombobox';

type WarehouseRow = { id: number; name: string };
type GroupedInventoryRow = {
  item_code: string;
  item_name: string;
  item_spec: string | null;
  unit: string | null;
  warehouse_id: number;
  warehouse_name: string;
  is_lot: boolean;
  is_exp: boolean;
  is_sn: boolean;
  total_qty: number;
  details: InventoryDetailRow[];
};
type InventoryDetailRow = {
  id: number;
  warehouse_id: number;
  current_qty: number;
  available_qty: number | null;
  lot_no: string | null;
  exp_date: string | null;
  serial_no: string | null;
  items:
    | {
        item_code: string;
        item_name: string;
        item_spec: string | null;
        unit: string | null;
        is_lot_managed: boolean;
        is_exp_managed: boolean;
        is_sn_managed: boolean;
      }
    | {
        item_code: string;
        item_name: string;
        item_spec: string | null;
        unit: string | null;
        is_lot_managed: boolean;
        is_exp_managed: boolean;
        is_sn_managed: boolean;
      }[];
};

export default function InventoryPage() {
  const [groupedInventory, setGroupedInventory] = useState<GroupedInventoryRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  
  // 🌟 추가: 품목 검색 상태
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchInventory() {
      // 1. 재고 데이터와 품목의 관리 옵션(is_lot, is_exp, is_sn)을 함께 가져옵니다.
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id,
          warehouse_id,
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
        .gt('current_qty', 0) // 잔량이 있는 것만 조회
        .order('exp_date', { ascending: true });
      const { data: warehouseData } = await supabase
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      setWarehouses(warehouseData || []);

      if (error) {
        console.error(error.message);
        setIsLoading(false);
        return;
      }

      const groups: Record<string, GroupedInventoryRow> = {};
      const warehouseMap = new Map((warehouseData as WarehouseRow[] | null)?.map((wh) => [wh.id, wh.name]) ?? []);
      
      (data as unknown as InventoryDetailRow[] | null)?.forEach((row) => {
        if (warehouseFilter !== 'all' && String(row.warehouse_id) !== warehouseFilter) return;
        const rowItem = Array.isArray(row.items) ? row.items[0] : row.items;
        if (!rowItem) return;
        const code = `${rowItem.item_code}::${row.warehouse_id}`;
        
        if (!groups[code]) {
          groups[code] = {
            item_code: code,
            item_name: rowItem.item_name,
            item_spec: rowItem.item_spec,
            unit: rowItem.unit,
            warehouse_id: row.warehouse_id,
            warehouse_name: warehouseMap.get(row.warehouse_id) ?? `창고#${row.warehouse_id}`,
            is_lot: rowItem.is_lot_managed,
            is_exp: rowItem.is_exp_managed,
            is_sn: rowItem.is_sn_managed,
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
  }, [warehouseFilter]);

  const toggleRow = (code: string, isTrackable: boolean) => {
    // 추적 관리 대상이 아니면 아예 열리지 않도록 차단
    if (!isTrackable) return;
    
    setExpandedRows(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  // 🌟 추가: 검색 필터링 로직
  const filteredGroups = groupedInventory.filter(group => {
    const term = searchTerm.toLowerCase();
    return (
      group.item_name.toLowerCase().includes(term) ||
      group.item_code.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen space-y-6">
      
      {/* 🌟 헤더 및 상단 퀵 버튼 추가 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">현재고 현황</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">품목별 총 재고를 확인하고, 관리 품목은 클릭하여 LOT 및 S/N별 상세 내역을 조회합니다.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/inbound/new" className="px-4 py-2 border-2 border-blue-200 text-blue-700 bg-blue-50 rounded-xl text-sm font-black hover:bg-blue-100 transition-colors shadow-sm">
            + 입고 등록
          </Link>
          <Link href="/outbound-requests/new" className="px-4 py-2 border-2 border-red-200 text-red-700 bg-red-50 rounded-xl text-sm font-black hover:bg-red-100 transition-colors shadow-sm">
            - 수동 출고
          </Link>
        </div>
      </div>

      {/* 🌟 검색 바 추가 */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <input 
            type="text" 
            placeholder="품목명 또는 품목 코드로 검색..." 
            className="w-full sm:w-1/2 md:w-1/3 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <SearchableCombobox
            className="w-56"
            value={warehouseFilter}
            onChange={setWarehouseFilter}
            options={[
              { value: 'all', label: '전체 창고' },
              ...warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] })),
            ]}
            placeholder="창고 선택"
          />
        </div>
      </div>

      {/* 🌟 모바일 가로 스크롤(overflow-x-auto) 및 whitespace-nowrap 적용 */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm border border-gray-200">
        <table className="min-w-full text-sm whitespace-nowrap text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-12 px-6 py-4"></th>
              <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-wider">품목코드</th>
              <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-wider">창고</th>
              <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-wider">품목명 / 관리옵션</th>
              <th className="px-6 py-4 font-black text-gray-500 uppercase tracking-wider">규격</th>
              <th className="px-6 py-4 text-right font-black text-gray-800 uppercase tracking-wider">총 재고수량</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-gray-400 font-bold">
                  재고 데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : filteredGroups.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-gray-400 font-bold">
                  조건에 맞는 재고 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filteredGroups.map((group) => {
                const isTrackable = group.is_lot || group.is_exp || group.is_sn;

                return (
                  <React.Fragment key={group.item_code}>
                    <tr 
                      onClick={() => toggleRow(group.item_code, isTrackable)} 
                      className={`transition-colors ${
                        isTrackable ? 'cursor-pointer hover:bg-gray-50' : 'bg-white'
                      } ${expandedRows[group.item_code] ? 'bg-blue-50/30' : ''}`}
                    >
                      <td className="px-6 py-4 text-center text-gray-400 font-black text-xs transition-transform duration-200">
                        {isTrackable ? (expandedRows[group.item_code] ? '▼' : '▶') : '-'}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-600">
                        {String(group.item_code).split('::')[0]}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-700">
                        {group.warehouse_name}
                      </td>
                      <td className="px-6 py-4 font-black text-gray-900 text-base">
                        <div className="flex items-center gap-2">
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

                    {isTrackable && expandedRows[group.item_code] && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={6} className="p-0 border-b border-gray-200">
                          <div className="px-14 py-4 animate-in fade-in slide-in-from-top-2 duration-200 overflow-x-auto">
                            <table className="min-w-full text-xs bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden whitespace-nowrap">
                              <thead className="bg-gray-100/80 text-gray-500 font-bold">
                                <tr>
                                  <th className="px-4 py-3 text-left">LOT 번호</th>
                                  <th className="px-4 py-3 text-left">유효기간 (EXP)</th>
                                  <th className="px-4 py-3 text-left">시리얼 번호 (S/N)</th>
                                  <th className="px-4 py-3 text-right">보유 수량</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {group.details.map((detail: InventoryDetailRow, idx: number) => (
                                  <tr key={detail.id || idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-bold text-gray-700">
                                      {detail.lot_no ? (
                                        <span className="bg-gray-100 text-gray-700 px-2.5 py-1 rounded-md font-bold text-xs border border-gray-200">{detail.lot_no}</span>
                                      ) : (
                                        <span className="text-gray-300">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-green-700">
                                      {detail.exp_date ? (
                                        <span className={`px-2.5 py-1 rounded-md font-bold text-xs border ${
                                          new Date(detail.exp_date) < new Date() 
                                            ? 'bg-red-50 text-red-600 border-red-200' 
                                            : 'bg-green-50 text-green-700 border-green-200'
                                        }`}>
                                          {detail.exp_date}
                                        </span>
                                      ) : (
                                        <span className="text-gray-300">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 font-bold text-purple-700">
                                      {detail.serial_no || <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="px-4 py-3 font-black text-right text-base text-gray-800">
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