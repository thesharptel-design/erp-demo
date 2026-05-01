'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  InventoryTransferCommandCombobox,
  type TransferComboboxOption,
} from '@/app/inventory-transfers/new/InventoryTransferCommandCombobox';

type WarehouseRow = { id: number; name: string };
type GroupedInventoryRow = {
  group_key: string;
  item_code: string;
  item_name: string;
  item_spec: string | null;
  unit: string | null;
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

const PAGE_SIZE_OPTIONS = [20, 25, 30, 50] as const;

export default function InventoryPage() {
  const [groupedInventory, setGroupedInventory] = useState<GroupedInventoryRow[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [hasWarehouseAccess, setHasWarehouseAccess] = useState(true);
  const [itemCodeFilter, setItemCodeFilter] = useState('');
  const [itemNameFilter, setItemNameFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);

  const fetchInventory = useCallback(async () => {
      setIsLoading(true);
      setHasWarehouseAccess(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? '';

      let allowedWarehouseIds: number[] | null = []
      let allowedWarehouses: WarehouseRow[] = []
      if (accessToken) {
        const accessRes = await fetch('/api/warehouses/accessible', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
        if (accessRes.ok) {
          const payload = (await accessRes.json()) as {
            has_full_access?: boolean
            warehouse_ids?: number[]
            warehouses?: WarehouseRow[]
          }
          const hasFullAccess = payload.has_full_access === true
          allowedWarehouseIds = hasFullAccess ? null : (payload.warehouse_ids ?? [])
          allowedWarehouses = (payload.warehouses ?? []).filter(
            (warehouse) => Number.isInteger(Number(warehouse.id)) && Number(warehouse.id) > 0
          )
        }
      }

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
      if (allowedWarehouseIds !== null && allowedWarehouseIds.length === 0) {
        setHasWarehouseAccess(false);
        setWarehouses([]);
        setWarehouseFilter('all');
        setGroupedInventory([]);
        setIsLoading(false);
        return;
      }

      setWarehouses(allowedWarehouses);

      const nextWarehouseFilter =
        warehouseFilter === 'all'
          ? 'all'
          : allowedWarehouses.some((warehouse) => String(warehouse.id) === warehouseFilter)
            ? warehouseFilter
            : 'all';
      if (nextWarehouseFilter !== warehouseFilter) {
        setWarehouseFilter(nextWarehouseFilter);
      }

      if (error) {
        console.error(error.message);
        setIsLoading(false);
        return;
      }

      const groups: Record<string, GroupedInventoryRow> = {};
      const warehouseMap = new Map(allowedWarehouses.map((wh) => [wh.id, wh.name]));
      
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
  }, [warehouseFilter]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const itemCodeOptions = useMemo(() => {
    const values = Array.from(new Set(groupedInventory.map((group) => group.item_code))).sort((a, b) =>
      a.localeCompare(b)
    );
    return values.map((value) => ({ value, label: value, keywords: [value] }));
  }, [groupedInventory]);

  const itemNameOptions = useMemo(() => {
    const values = Array.from(new Set(groupedInventory.map((group) => group.item_name))).sort((a, b) =>
      a.localeCompare(b)
    );
    return values.map((value) => ({ value, label: value, keywords: [value] }));
  }, [groupedInventory]);

  const warehouseFilterOptions = useMemo<TransferComboboxOption[]>(
    () => [
      { value: 'all', label: '전체 창고', keywords: ['전체'] },
      ...warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] })),
    ],
    [warehouses]
  );

  const comboTrigger = 'h-9 min-h-9 w-full shrink-0 px-2 text-xs font-medium';

  const filteredGroups = groupedInventory.filter((group) => {
    const itemCodeMatches = !itemCodeFilter || group.item_code === itemCodeFilter;
    const itemNameMatches = !itemNameFilter || group.item_name === itemNameFilter;
    return itemCodeMatches && itemNameMatches;
  });

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [itemCodeFilter, itemNameFilter, warehouseFilter, pageSize]);

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, currentPage, pageSize]);

  const warehouseNameMap = useMemo(() => {
    const map = new Map<number, string>();
    warehouses.forEach((warehouse) => {
      map.set(warehouse.id, warehouse.name);
    });
    return map;
  }, [warehouses]);

  const selectedWarehouseLabel = useMemo(() => {
    if (warehouseFilter === 'all') return null;
    const selectedId = Number(warehouseFilter);
    if (!Number.isInteger(selectedId) || selectedId <= 0) return null;
    return warehouseNameMap.get(selectedId) ?? `창고#${selectedId}`;
  }, [warehouseFilter, warehouseNameMap]);

  const emptyStateMessage = useMemo(() => {
    if (!hasWarehouseAccess) {
      return '창고 권한이 없습니다. 관리자에게 창고 접근 권한을 요청해 주세요.';
    }
    if (warehouseFilter !== 'all' && selectedWarehouseLabel) {
      return `${selectedWarehouseLabel} 창고는 현재 재고가 없습니다.`;
    }
    return '조건에 맞는 재고 데이터가 없습니다.';
  }, [hasWarehouseAccess, warehouseFilter, selectedWarehouseLabel]);

  const handleRefresh = useCallback(() => {
    setItemCodeFilter('');
    setItemNameFilter('');
    setWarehouseFilter('all');
    setCurrentPage(1);
    setExpandedGroups({});
    void fetchInventory();
  }, [fetchInventory]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
      <PageHeader
        title="현재고 현황"
        description="전체창고 선택 시 창고별 재고를 합산해 표시합니다."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
            새로고침
          </Button>
        }
      />

      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">품목코드</span>
              <InventoryTransferCommandCombobox
                value={itemCodeFilter}
                onChange={setItemCodeFilter}
                options={itemCodeOptions}
                placeholder="전체 품목코드"
                emptyText="품목코드가 없습니다."
                triggerClassName={comboTrigger}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">품목명</span>
              <InventoryTransferCommandCombobox
                value={itemNameFilter}
                onChange={setItemNameFilter}
                options={itemNameOptions}
                placeholder="전체 품목명"
                emptyText="품목명이 없습니다."
                triggerClassName={comboTrigger}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">창고</span>
              <InventoryTransferCommandCombobox
                value={warehouseFilter}
                onChange={setWarehouseFilter}
                options={warehouseFilterOptions}
                placeholder="전체 창고"
                showClearOption={false}
                disabled={warehouses.length === 0}
                triggerClassName={comboTrigger}
              />
            </div>
          </div>

          <div className="flex min-h-[min(60vh,32rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-sm text-card-foreground">
                <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 backdrop-blur-sm">
                  <tr>
                    <th className="w-[11rem] px-3 py-3 text-xs font-medium text-muted-foreground">품목코드</th>
                    <th className="w-[10rem] px-3 py-3 text-xs font-medium text-muted-foreground">창고</th>
                    <th className="min-w-[16rem] px-3 py-3 text-xs font-medium text-muted-foreground">품목명 / 관리옵션</th>
                    <th className="w-[12rem] px-3 py-3 text-xs font-medium text-muted-foreground">규격</th>
                    <th className="w-[8rem] px-3 py-3 text-right text-xs font-medium text-muted-foreground">수량</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                        재고 데이터를 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : filteredGroups.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                        {emptyStateMessage}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((group) => (
                      <React.Fragment key={group.group_key}>
                        <tr className="transition-colors hover:bg-muted/40">
                          <td className="px-3 py-3 font-medium text-foreground">{group.item_code}</td>
                          <td className="px-3 py-3 font-medium text-foreground">{group.warehouse_name}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex gap-1">
                                {group.is_lot ? <span className="rounded border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">LOT</span> : null}
                                {group.is_exp ? <span className="rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">EXP</span> : null}
                                {group.is_sn ? <span className="rounded border border-purple-200 bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-800">SN</span> : null}
                              </div>
                              {(group.is_lot || group.is_exp || group.is_sn) && group.details.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedGroups((prev) => ({ ...prev, [group.group_key]: !prev[group.group_key] }))
                                  }
                                  className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-muted"
                                  aria-label={`${group.item_name} 상세 ${expandedGroups[group.group_key] ? '접기' : '펼치기'}`}
                                >
                                  {expandedGroups[group.group_key] ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                </button>
                              ) : null}
                              <span className="truncate font-medium text-foreground">{group.item_name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-medium text-muted-foreground">{group.item_spec || '-'}</td>
                          <td className="px-3 py-3 text-right text-base font-semibold text-primary">
                            {group.total_qty.toLocaleString()}
                            <span className="ml-1 text-xs font-medium text-muted-foreground">{group.unit}</span>
                          </td>
                        </tr>
                        {expandedGroups[group.group_key] &&
                        (group.is_lot || group.is_exp || group.is_sn) &&
                        group.details.length > 0 ? (
                          <tr className="bg-muted/20">
                            <td colSpan={5} className="px-3 py-3">
                              <div className="overflow-x-auto">
                                <table className="w-full min-w-[34rem] table-fixed border-collapse text-xs sm:text-sm">
                                  <thead>
                                    <tr className="border-b border-border/70 text-muted-foreground">
                                      <th className="w-[8rem] px-2 py-2 text-left font-medium">LOT</th>
                                      <th className="w-[9rem] px-2 py-2 text-left font-medium">EXP</th>
                                      <th className="min-w-[14rem] px-2 py-2 text-left font-medium">SN</th>
                                      <th className="w-[8rem] px-2 py-2 text-right font-medium">수량</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/50">
                                    {group.details.map((detail) => (
                                      <tr key={detail.id} className="text-foreground">
                                        <td className="px-2 py-2">{detail.lot_no ?? '-'}</td>
                                        <td className="px-2 py-2">{detail.exp_date ?? '-'}</td>
                                        <td className="px-2 py-2 break-all">{detail.serial_no ?? '-'}</td>
                                        <td className="px-2 py-2 text-right font-medium">
                                          {Number(detail.current_qty).toLocaleString()}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!isLoading && filteredGroups.length > 0 ? (
            <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-muted/30 px-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
                <span>페이지당</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                    setCurrentPage(1);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-medium text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="페이지당 행 수"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}건
                    </option>
                  ))}
                </select>
                <span>
                  · 총 <span className="font-semibold text-foreground">{filteredGroups.length}</span>건 ·{' '}
                  <span className="font-semibold text-foreground">{currentPage}</span> / {totalPages} 페이지
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                >
                  처음
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  이전
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  다음
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                >
                  마지막
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}