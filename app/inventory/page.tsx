'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getProcessNameFromMetadata } from '@/lib/item-config';
import { getAllowedWarehouseIds, getCurrentUserPermissions } from '@/lib/permissions';
import Link from 'next/link';
import SearchableCombobox from '@/components/SearchableCombobox';

type WarehouseRow = { id: number; name: string };
type GroupedInventoryRow = {
  group_key: string;
  item_code: string;
  item_name: string;
  item_spec: string | null;
  unit: string | null;
  process_name: string;
  warehouse_id: number | null;
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
        process_metadata?: Record<string, unknown> | null;
      }
    | {
        item_code: string;
        item_name: string;
        item_spec: string | null;
        unit: string | null;
        is_lot_managed: boolean;
        is_exp_managed: boolean;
        is_sn_managed: boolean;
        process_metadata?: Record<string, unknown> | null;
      }[];
};

export default function InventoryPage() {
  const [groupedInventory, setGroupedInventory] = useState<GroupedInventoryRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [itemCodeFilter, setItemCodeFilter] = useState('');
  const [processNameFilter, setProcessNameFilter] = useState('');
  const [itemNameFilter, setItemNameFilter] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchInventory() {
      setIsLoading(true);
      const currentUser = await getCurrentUserPermissions();
      const allowedWarehouseIds = await getAllowedWarehouseIds(currentUser);

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
            is_sn_managed,
            process_metadata
          )
        `)
        .gt('current_qty', 0) // 잔량이 있는 것만 조회
        .order('exp_date', { ascending: true });
      let warehouseQuery = supabase
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');
      if (allowedWarehouseIds !== null) {
        if (allowedWarehouseIds.length === 0) {
          setWarehouses([]);
          setWarehouseFilter('all');
          setGroupedInventory([]);
          setIsLoading(false);
          return;
        }
        warehouseQuery = warehouseQuery.in('id', allowedWarehouseIds);
      }
      const { data: warehouseData } = await warehouseQuery;
      setWarehouses(warehouseData || []);

      const nextWarehouseFilter =
        allowedWarehouseIds === null
          ? warehouseFilter
          : allowedWarehouseIds.includes(Number(warehouseFilter))
            ? warehouseFilter
            : String(allowedWarehouseIds[0]);
      if (nextWarehouseFilter !== warehouseFilter) {
        setWarehouseFilter(nextWarehouseFilter);
      }

      if (error) {
        console.error(error.message);
        setIsLoading(false);
        return;
      }

      const groups: Record<string, GroupedInventoryRow> = {};
      const warehouseMap = new Map((warehouseData as WarehouseRow[] | null)?.map((wh) => [wh.id, wh.name]) ?? []);
      
      (data as unknown as InventoryDetailRow[] | null)?.forEach((row) => {
        if (allowedWarehouseIds !== null && !allowedWarehouseIds.includes(Number(row.warehouse_id))) return;
        if (nextWarehouseFilter !== 'all' && String(row.warehouse_id) !== nextWarehouseFilter) return;
        const rowItem = Array.isArray(row.items) ? row.items[0] : row.items;
        if (!rowItem) return;
        const isAllWarehouses = nextWarehouseFilter === 'all';
        const code = isAllWarehouses ? rowItem.item_code : `${rowItem.item_code}::${row.warehouse_id}`;
        
        if (!groups[code]) {
          groups[code] = {
            group_key: code,
            item_code: rowItem.item_code,
            item_name: rowItem.item_name,
            item_spec: rowItem.item_spec,
            unit: rowItem.unit,
            process_name: getProcessNameFromMetadata(rowItem.process_metadata ?? null),
            warehouse_id: isAllWarehouses ? null : row.warehouse_id,
            warehouse_name: isAllWarehouses ? '전체(합산)' : (warehouseMap.get(row.warehouse_id) ?? `창고#${row.warehouse_id}`),
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

  const itemCodeOptions = useMemo(() => {
    const values = Array.from(new Set(groupedInventory.map((group) => group.item_code))).sort((a, b) =>
      a.localeCompare(b)
    );
    return values.map((value) => ({ value, label: value, keywords: [value] }));
  }, [groupedInventory]);

  const processNameOptions = useMemo(() => {
    const values = Array.from(
      new Set(groupedInventory.map((group) => group.process_name.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return values.map((value) => ({ value, label: value, keywords: [value] }));
  }, [groupedInventory]);

  const itemNameOptions = useMemo(() => {
    const values = Array.from(new Set(groupedInventory.map((group) => group.item_name))).sort((a, b) =>
      a.localeCompare(b)
    );
    return values.map((value) => ({ value, label: value, keywords: [value] }));
  }, [groupedInventory]);

  const filteredGroups = groupedInventory.filter((group) => {
    const itemCodeMatches = !itemCodeFilter || group.item_code.toLowerCase().includes(itemCodeFilter.toLowerCase());
    const processMatches =
      !processNameFilter || group.process_name.toLowerCase().includes(processNameFilter.toLowerCase());
    const itemNameMatches = !itemNameFilter || group.item_name.toLowerCase().includes(itemNameFilter.toLowerCase());
    return itemCodeMatches && processMatches && itemNameMatches;
  });

  const warehouseNameMap = useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((warehouse) => {
      map.set(warehouse.id, warehouse.name);
    });
    return map;
  }, [warehouses]);

  return (
    <div className="p-4 max-w-[1800px] mx-auto font-sans bg-gray-50 min-h-screen space-y-4">
      
      {/* 🌟 헤더 및 상단 퀵 버튼 추가 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">현재고 현황</h1>
          <p className="mt-1 text-xs font-bold text-gray-500">전체창고 선택 시 창고별 재고를 합산해 표시합니다.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/inbound/new" className="px-3 py-1.5 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg text-xs font-black hover:bg-blue-100 transition-colors shadow-sm">
            + 입고 등록
          </Link>
          <Link href="/outbound-requests/new" className="px-3 py-1.5 border border-red-200 text-red-700 bg-red-50 rounded-lg text-xs font-black hover:bg-red-100 transition-colors shadow-sm">
            - 수동 출고
          </Link>
        </div>
      </div>

      {/* 🌟 검색 바 추가 */}
      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <SearchableCombobox
            className="w-full sm:w-56"
            value={itemCodeFilter}
            onChange={setItemCodeFilter}
            options={itemCodeOptions}
            placeholder="품목코드"
          />
          <SearchableCombobox
            className="w-full sm:w-52"
            value={processNameFilter}
            onChange={setProcessNameFilter}
            options={processNameOptions}
            placeholder="공정명"
          />
          <SearchableCombobox
            className="w-full sm:w-56"
            value={itemNameFilter}
            onChange={setItemNameFilter}
            options={itemNameOptions}
            placeholder="품목명"
          />
          <SearchableCombobox
            className="w-full sm:w-44"
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
        <table className="min-w-[980px] w-full text-xs whitespace-nowrap text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-[11px]">
            <tr>
              <th className="w-10 px-3 py-2.5"></th>
              <th className="px-3 py-2.5 font-black text-gray-500 uppercase tracking-wider">품목코드</th>
              <th className="px-3 py-2.5 font-black text-gray-500 uppercase tracking-wider">창고</th>
              <th className="px-3 py-2.5 font-black text-gray-500 uppercase tracking-wider">공정명</th>
              <th className="px-3 py-2.5 font-black text-gray-500 uppercase tracking-wider">품목명 / 관리옵션</th>
              <th className="px-3 py-2.5 font-black text-gray-500 uppercase tracking-wider">규격</th>
              <th className="px-3 py-2.5 text-right font-black text-gray-800 uppercase tracking-wider">총 재고수량</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-gray-400 font-bold">
                  재고 데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : filteredGroups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-gray-400 font-bold">
                  조건에 맞는 재고 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filteredGroups.map((group) => {
                const isTrackable = group.is_lot || group.is_exp || group.is_sn;

                return (
                  <React.Fragment key={group.group_key}>
                    <tr 
                      onClick={() => toggleRow(group.group_key, isTrackable)} 
                      className={`transition-colors ${
                        isTrackable ? 'cursor-pointer hover:bg-gray-50' : 'bg-white'
                      } ${expandedRows[group.group_key] ? 'bg-blue-50/30' : ''}`}
                    >
                      <td className="px-3 py-2.5 text-center text-gray-400 font-black text-xs transition-transform duration-200">
                        {isTrackable ? (expandedRows[group.group_key] ? '▼' : '▶') : '-'}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-gray-600">
                        {group.item_code}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-gray-700">
                        {group.warehouse_name}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] font-bold text-gray-600">
                        {group.process_name.trim() ? group.process_name : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-black text-gray-900 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {group.is_lot && <span className="px-1.5 py-0.5 text-[10px] font-black bg-blue-100 text-blue-700 rounded uppercase tracking-wider">LOT</span>}
                            {group.is_exp && <span className="px-1.5 py-0.5 text-[10px] font-black bg-green-100 text-green-700 rounded uppercase tracking-wider">EXP</span>}
                            {group.is_sn && <span className="px-1.5 py-0.5 text-[10px] font-black bg-purple-100 text-purple-700 rounded uppercase tracking-wider">S/N</span>}
                          </div>
                          <span>{group.item_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-500">
                        {group.item_spec || '-'}
                      </td>
                      <td className="px-3 py-2.5 font-black text-blue-600 text-right text-base">
                        {group.total_qty.toLocaleString()} <span className="text-xs text-gray-400 font-bold ml-1">{group.unit}</span>
                      </td>
                    </tr>

                    {isTrackable && expandedRows[group.group_key] && (
                      <tr className="bg-gray-50/50">
                        <td colSpan={7} className="p-0 border-b border-gray-200">
                          <div className="px-8 py-3 animate-in fade-in slide-in-from-top-2 duration-200 overflow-x-auto">
                            <table className="min-w-full text-xs bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden whitespace-nowrap">
                              <thead className="bg-gray-100/80 text-gray-500 font-bold">
                                <tr>
                                  {warehouseFilter === 'all' ? <th className="px-4 py-3 text-left">창고</th> : null}
                                  <th className="px-4 py-3 text-left">LOT 번호</th>
                                  <th className="px-4 py-3 text-left">유효기간 (EXP)</th>
                                  <th className="px-4 py-3 text-left">시리얼 번호 (S/N)</th>
                                  <th className="px-4 py-3 text-right">보유 수량</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {group.details.map((detail: InventoryDetailRow, idx: number) => (
                                  <tr key={detail.id || idx} className="hover:bg-gray-50">
                                    {warehouseFilter === 'all' ? (
                                      <td className="px-4 py-3 font-bold text-gray-700">
                                        {warehouseNameMap.get(detail.warehouse_id) ?? `창고#${detail.warehouse_id}`}
                                      </td>
                                    ) : null}
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