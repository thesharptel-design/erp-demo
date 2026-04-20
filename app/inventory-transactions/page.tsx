'use client';

import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SearchableCombobox from '@/components/SearchableCombobox';

type Warehouse = {
  id: number;
  name: string;
};

type TxRow = {
  id: number;
  trans_date: string;
  trans_type: string;
  qty: number;
  remarks: string | null;
  created_by: string | null;
  lot_no: string | null;
  serial_no: string | null;
  exp_date: string | null;
  warehouse_id: number | null;
  inventory_id: number | null;
  items?: { item_code: string; item_name: string; unit: string | null } | null;
  warehouses?: { name: string | null } | null;
  processor_name?: string;
};

type TxFilter = 'ALL' | 'IN' | 'OUT';

const IN_TYPES = new Set(['IN', 'PROD_IN', 'QC_RELEASE', 'CANCEL_IN']);
const OUT_TYPES = new Set(['OUT', 'MATL_OUT']);

export default function InventoryTransactionsPage() {
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TxFilter>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const [warehouseRes, usersRes, txRes] = await Promise.all([
        supabase
          .from('warehouses')
          .select('id, name')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('app_users').select('id, user_name'),
        supabase
          .from('inventory_transactions')
          .select(`
            id,
            trans_date,
            trans_type,
            qty,
            remarks,
            created_by,
            lot_no,
            serial_no,
            exp_date,
            warehouse_id,
            inventory_id,
            items (item_code, item_name, unit),
            warehouses (name)
          `)
          .order('trans_date', { ascending: false })
          .limit(1000),
      ]);

      if (warehouseRes.error) throw warehouseRes.error;
      if (usersRes.error) throw usersRes.error;
      if (txRes.error) throw txRes.error;

      setWarehouses((warehouseRes.data as Warehouse[]) || []);
      const userMap = new Map((usersRes.data || []).map((u) => [u.id, u.user_name]));

      const mapped = ((txRes.data as any[]) || [])
        .filter((tx) => (warehouseFilter === 'all' ? true : String(tx.warehouse_id ?? '') === warehouseFilter))
        .map((tx) => ({
          ...tx,
          items: Array.isArray(tx.items) ? tx.items[0] ?? null : tx.items ?? null,
          warehouses: Array.isArray(tx.warehouses) ? tx.warehouses[0] ?? null : tx.warehouses ?? null,
          processor_name: userMap.get(tx.created_by ?? '') || '시스템',
        })) as TxRow[];

      setTransactions(mapped);
    } catch (err: any) {
      console.error('데이터 로드 실패:', err.message);
    } finally {
      setLoading(false);
    }
  }, [warehouseFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const resolveDirection = (tx: TxRow): 'IN' | 'OUT' | 'NEUTRAL' => {
    if (IN_TYPES.has(tx.trans_type)) return 'IN';
    if (OUT_TYPES.has(tx.trans_type)) return 'OUT';
    if (tx.trans_type === 'ADJUST') {
      if ((tx.remarks ?? '').includes('증가')) return 'IN';
      if ((tx.remarks ?? '').includes('감소')) return 'OUT';
    }
    return 'NEUTRAL';
  };

  const getTypeLabel = (tx: TxRow) => {
    const direction = resolveDirection(tx);
    if (direction === 'IN') return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 font-bold rounded-md text-xs border border-blue-200 shadow-sm">입고</span>;
    if (direction === 'OUT') return <span className="px-2.5 py-1 bg-red-100 text-red-700 font-bold rounded-md text-xs border border-red-200 shadow-sm">출고</span>;
    return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 font-bold rounded-md text-xs border border-yellow-200 shadow-sm">조정</span>;
  };

  const getSignedQty = (tx: TxRow) => {
    const direction = resolveDirection(tx);
    if (direction === 'OUT') return `-${tx.qty}`;
    return `+${tx.qty}`;
  };

  const filteredData = useMemo(() => {
    return transactions.filter((tx) => {
      const direction = resolveDirection(tx);
      const matchType =
        filter === 'ALL' ||
        (filter === 'IN' && direction === 'IN') ||
        (filter === 'OUT' && direction === 'OUT');
      const term = searchTerm.toLowerCase();
      const matchSearch =
        (tx.items?.item_name || '').toLowerCase().includes(term) ||
        (tx.items?.item_code || '').toLowerCase().includes(term) ||
        (tx.warehouses?.name || '').toLowerCase().includes(term) ||
        (tx.remarks || '').toLowerCase().includes(term);
      return matchType && matchSearch;
    });
  }, [transactions, filter, searchTerm]);

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">입출고 현황 (수불부)</h1>
          <p className="mt-2 text-sm font-bold text-gray-500">`inventory_transactions` 기준 입출고 이력을 조회합니다.</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between gap-4 items-center">
        <div className="flex gap-2 w-full md:w-auto flex-wrap">
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

        <div className="w-full md:w-48">
          <SearchableCombobox
            value={warehouseFilter}
            onChange={setWarehouseFilter}
            options={[
              { value: 'all', label: '전체 창고' },
              ...warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] })),
            ]}
            placeholder="창고 선택"
          />
        </div>

        <div className="w-full md:w-80">
          <input
            type="text"
            placeholder="품목/창고/비고 검색..."
            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <section className="bg-white border border-gray-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
              <tr>
                <th className="px-5 py-4 font-bold">일시</th>
                <th className="px-5 py-4 font-bold text-center w-24">구분</th>
                <th className="px-5 py-4 font-bold">품목정보</th>
                <th className="px-5 py-4 font-bold text-blue-700">창고</th>
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
                    <td className="px-5 py-4 text-center">{getTypeLabel(tx)}</td>
                    <td className="px-5 py-4">
                      <div className="font-black text-gray-800">{tx.items?.item_name || '-'}</div>
                      <div className="text-xs font-bold text-blue-600 mt-0.5">{tx.items?.item_code || '정보없음'}</div>
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-700">
                      {tx.warehouses?.name || <span className="text-gray-300 italic">-</span>}
                    </td>
                    <td className={`px-5 py-4 font-black text-right text-lg ${resolveDirection(tx) === 'OUT' ? 'text-red-500' : 'text-blue-600'}`}>
                      {getSignedQty(tx)}
                      <span className="text-xs text-gray-400 font-bold ml-1">{tx.items?.unit}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-500 max-w-[250px] truncate" title={tx.remarks ?? ''}>
                        {tx.remarks || <span className="text-gray-300 italic">-</span>}
                      </div>
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