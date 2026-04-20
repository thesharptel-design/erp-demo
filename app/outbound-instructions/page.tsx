'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import SearchableCombobox from '@/components/SearchableCombobox';

const generateId = () => Math.random().toString(36).substring(2, 11);

type InventoryRow = Database['public']['Tables']['inventory']['Row'];
type OutboundRequestRow = Database['public']['Tables']['outbound_requests']['Row'] & {
  app_users?: { user_name: string | null } | null;
  warehouses?: { name: string | null } | null;
};

type RequestItemRow = {
  id: number;
  item_id: number;
  qty: number;
  item: {
    item_code: string;
    item_name: string;
    is_lot_managed: boolean;
    is_sn_managed: boolean;
    is_exp_managed: boolean;
  };
};

type FulfillmentLine = {
  id: string;
  req_item_id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  is_lot: boolean;
  is_sn: boolean;
  is_exp: boolean;
  isTracked: boolean;
  req_qty: number;
  selected_lot: string;
  selected_sn: string;
  selected_exp: string;
  stock_id: string;
  out_qty: number;
};

export default function OutboundInstructionsPage() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [approvedRequests, setApprovedRequests] = useState<OutboundRequestRow[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<OutboundRequestRow | null>(null);

  const [availableStocks, setAvailableStocks] = useState<InventoryRow[]>([]);
  const [fulfillments, setFulfillments] = useState<FulfillmentLine[]>([]);

  const fetchApprovedRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('outbound_requests')
      .select('*, app_users:requester_id (user_name), warehouses:warehouse_id(name)')
      .eq('status', 'approved')
      .order('created_at', { ascending: true });

    if (!error && data) setApprovedRequests(data as OutboundRequestRow[]);
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    await fetchApprovedRequests();
    setLoading(false);
  }, [fetchApprovedRequests]);

  useEffect(() => {
    void initData();
  }, [initData]);

  const handleSelectRequest = async (req: OutboundRequestRow) => {
    setSelectedRequest(req);
    setFulfillments([]);

    const { data: items } = await supabase
      .from('outbound_request_items')
      .select('id, item_id, qty, item:items(item_code, item_name, is_lot_managed, is_sn_managed, is_exp_managed)')
      .eq('outbound_request_id', req.id);

    if (items && Array.isArray(items)) {
      const typedItems = items as unknown as RequestItemRow[];
      const { data: stocks } = await supabase
        .from('inventory')
        .select('*')
        .in(
          'item_id',
          typedItems.map((i) => i.item_id)
        )
        .eq('warehouse_id', req.warehouse_id)
        .gt('current_qty', 0);
      setAvailableStocks((stocks as InventoryRow[]) || []);

      const initialFulfillments: FulfillmentLine[] = typedItems.map((i) => ({
        id: generateId(),
        req_item_id: i.id,
        item_id: i.item_id,
        item_code: i.item.item_code,
        item_name: i.item.item_name,
        is_lot: i.item.is_lot_managed,
        is_sn: i.item.is_sn_managed,
        is_exp: i.item.is_exp_managed,
        isTracked: i.item.is_lot_managed || i.item.is_sn_managed || i.item.is_exp_managed,
        req_qty: i.qty,
        selected_lot: '',
        selected_sn: '',
        selected_exp: '',
        stock_id: '',
        out_qty: i.qty,
      }));
      setFulfillments(initialFulfillments);
    }
  };

  const handleSmartFilter = (index: number, field: 'selected_lot' | 'selected_sn' | 'selected_exp', value: string) => {
    const newFulfillments = [...fulfillments];
    const f = { ...newFulfillments[index], [field]: value } as FulfillmentLine;

    const myStocks = availableStocks.filter((s) => s.item_id === f.item_id);

    const getFiltered = (lot: string, sn: string, exp: string) => {
      return myStocks.filter(
        (s) =>
          (!lot || s.lot_no === lot) && (!sn || s.serial_no === sn) && (!exp || s.exp_date === exp)
      );
    };

    let filtered = getFiltered(f.selected_lot, f.selected_sn, f.selected_exp);

    if (value !== '') {
      const uniqueLots = [...new Set(filtered.map((s) => s.lot_no).filter(Boolean))];
      const uniqueSns = [...new Set(filtered.map((s) => s.serial_no).filter(Boolean))];
      const uniqueExps = [...new Set(filtered.map((s) => s.exp_date).filter(Boolean))];

      if (f.is_lot && uniqueLots.length === 1) f.selected_lot = uniqueLots[0] as string;
      if (f.is_sn && uniqueSns.length === 1) f.selected_sn = uniqueSns[0] as string;
      if (f.is_exp && uniqueExps.length === 1) f.selected_exp = uniqueExps[0] as string;

      filtered = getFiltered(f.selected_lot, f.selected_sn, f.selected_exp);
    }

    if (filtered.length === 1) {
      const match = filtered[0];
      const lotOk = !f.is_lot || f.selected_lot === match.lot_no;
      const snOk = !f.is_sn || f.selected_sn === match.serial_no;
      const expOk = !f.is_exp || f.selected_exp === match.exp_date;

      if (lotOk && snOk && expOk) {
        f.stock_id = match.id.toString();
        if (f.is_sn) f.out_qty = 1;
      }
    } else {
      f.stock_id = '';
    }

    newFulfillments[index] = f;
    setFulfillments(newFulfillments);
  };

  const handleResetField = (index: number, field: 'selected_lot' | 'selected_sn' | 'selected_exp') => {
    const newFulfillments = [...fulfillments];
    const f = { ...newFulfillments[index] };
    f[field] = '';
    f.stock_id = '';

    if (field === 'selected_sn') {
      f.out_qty = f.req_qty;
    }

    newFulfillments[index] = f;
    setFulfillments(newFulfillments);
  };

  const handleExecuteOutbound = async () => {
    for (const f of fulfillments) {
      if (f.isTracked && !f.stock_id) return alert(`[${f.item_name}] 재고 매핑을 완료해주세요.`);
      if (f.out_qty <= 0) return alert(`[${f.item_name}] 수량을 입력해주세요.`);

      const stock = f.isTracked
        ? availableStocks.find((s) => s.id === parseInt(f.stock_id, 10))
        : availableStocks.find((s) => s.item_id === f.item_id);
      if (!stock || f.out_qty > Number(stock.current_qty))
        return alert(`[${f.item_name}] 잔량이 부족합니다.`);
    }

    if (!confirm('출고를 진행하시겠습니까?')) return;
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      const lines = fulfillments.map((f) => {
        const stock = f.isTracked
          ? availableStocks.find((s) => s.id === parseInt(f.stock_id, 10))
          : availableStocks.find((s) => s.item_id === f.item_id);
        if (!stock) throw new Error(`재고 행을 찾을 수 없습니다: ${f.item_name}`);
        return { inventory_id: stock.id, item_id: f.item_id, qty: f.out_qty };
      });

      const { error: rpcError } = await supabase.rpc('execute_outbound_request_fulfillment', {
        p_outbound_request_id: selectedRequest.id,
        p_lines: lines,
      });
      if (rpcError) throw rpcError;

      alert('✅ 출고 완료!');
      setSelectedRequest(null);
      void fetchApprovedRequests();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitLine = (index: number) => {
    const newF = [...fulfillments];
    newF.splice(index + 1, 0, {
      ...newF[index],
      id: generateId(),
      stock_id: '',
      selected_lot: '',
      selected_sn: '',
      selected_exp: '',
      out_qty: 0,
    });
    setFulfillments(newF);
  };

  const handleRemoveLine = (index: number) => {
    setFulfillments(fulfillments.filter((_, i) => i !== index));
  };

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">Loading...</div>;

  return (
    <div className="p-8 max-w-screen-2xl mx-auto text-gray-800 font-sans bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-blue-700 uppercase tracking-tighter">Outbound Instruction</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[75vh]">
        <div className="lg:col-span-4 bg-white border rounded-3xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-5 border-b bg-gray-50/50 font-black">출고 대기 목록 ({approvedRequests.length})</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {approvedRequests.map((req) => (
              <div
                key={req.id}
                onClick={() => handleSelectRequest(req)}
                className={`p-4 rounded-2xl cursor-pointer border-2 transition-all ${
                  selectedRequest?.id === req.id
                    ? 'border-blue-500 bg-blue-50/30'
                    : 'border-transparent bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="text-xs font-black text-gray-400 mb-1">{req.req_no}</div>
                <div className="font-black text-gray-800 truncate">{req.purpose}</div>
                <div className="text-[10px] font-bold text-gray-500 mt-2">
                  요청자: {req.app_users?.user_name} / 창고: {req.warehouses?.name ?? '-'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white border rounded-3xl flex flex-col overflow-hidden shadow-sm">
          {!selectedRequest ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">
              요청서를 선택해주세요.
            </div>
          ) : (
            <>
              <div className="p-6 border-b bg-gray-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black">{selectedRequest.purpose}</h2>
                  <p className="text-xs font-bold text-gray-400">
                    {selectedRequest.req_no} / {selectedRequest.warehouses?.name ?? '-'}
                  </p>
                </div>
                <button
                  onClick={() => void handleExecuteOutbound()}
                  disabled={processing}
                  className="px-6 py-3 bg-black text-white rounded-xl font-black text-sm hover:bg-gray-800 transition-colors"
                >
                  실출고 차감 실행
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <table className="min-w-full text-sm">
                  <thead className="text-gray-400 font-black text-[11px] uppercase border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">품목정보</th>
                      <th className="px-4 py-3 text-center">요청</th>
                      <th className="px-4 py-3 text-left w-80">재고 매핑 (상세 선택)</th>
                      <th className="px-4 py-3 text-center">출고수량</th>
                      <th className="px-4 py-3 text-center">도구</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fulfillments.map((f, idx) => {
                      const myStocks = availableStocks.filter((s) => s.item_id === f.item_id);
                      const availableLots = [
                        ...new Set(
                          myStocks
                            .filter(
                              (s) =>
                                (!f.selected_sn || s.serial_no === f.selected_sn) &&
                                (!f.selected_exp || s.exp_date === f.selected_exp)
                            )
                            .map((s) => s.lot_no)
                            .filter(Boolean)
                        ),
                      ];
                      const availableSns = [
                        ...new Set(
                          myStocks
                            .filter(
                              (s) =>
                                (!f.selected_lot || s.lot_no === f.selected_lot) &&
                                (!f.selected_exp || s.exp_date === f.selected_exp)
                            )
                            .map((s) => s.serial_no)
                            .filter(Boolean)
                        ),
                      ];
                      const availableExps = [
                        ...new Set(
                          myStocks
                            .filter(
                              (s) =>
                                (!f.selected_lot || s.lot_no === f.selected_lot) &&
                                (!f.selected_sn || s.serial_no === f.selected_sn)
                            )
                            .map((s) => s.exp_date)
                            .filter(Boolean)
                        ),
                      ];

                      return (
                        <tr key={f.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-4">
                            <div className="font-black text-gray-800">{f.item_name}</div>
                            <div className="text-[10px] font-bold text-blue-600 uppercase">{f.item_code}</div>
                          </td>
                          <td className="px-4 py-4 text-center font-black text-gray-400">{f.req_qty}</td>
                          <td className="px-4 py-4">
                            {f.isTracked ? (
                              <div className="space-y-1.5">
                                {f.is_lot && (
                                  <div className="flex gap-1.5 items-center">
                                    <span className="w-8 text-[10px] font-black text-blue-500 bg-blue-50 px-1 rounded text-center">
                                      LOT
                                    </span>
                                    <SearchableCombobox
                                      className="flex-1"
                                      value={f.selected_lot}
                                      onChange={(v) => handleSmartFilter(idx, 'selected_lot', v)}
                                      options={availableLots.map((v) => ({ value: String(v), label: String(v) }))}
                                      placeholder="선택"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleResetField(idx, 'selected_lot')}
                                      title="LOT 초기화"
                                      className="w-6 h-6 flex items-center justify-center bg-gray-50 text-[10px] text-gray-400 hover:text-orange-500 border rounded transition-all"
                                    >
                                      ↺
                                    </button>
                                  </div>
                                )}
                                {f.is_sn && (
                                  <div className="flex gap-1.5 items-center">
                                    <span className="w-8 text-[10px] font-black text-purple-500 bg-purple-50 px-1 rounded text-center">
                                      S/N
                                    </span>
                                    <SearchableCombobox
                                      className="flex-1"
                                      value={f.selected_sn}
                                      onChange={(v) => handleSmartFilter(idx, 'selected_sn', v)}
                                      options={availableSns.map((v) => ({ value: String(v), label: String(v) }))}
                                      placeholder="선택"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleResetField(idx, 'selected_sn')}
                                      title="SN 초기화"
                                      className="w-6 h-6 flex items-center justify-center bg-gray-50 text-[10px] text-gray-400 hover:text-orange-500 border rounded transition-all"
                                    >
                                      ↺
                                    </button>
                                  </div>
                                )}
                                {f.is_exp && (
                                  <div className="flex gap-1.5 items-center">
                                    <span className="w-8 text-[10px] font-black text-green-500 bg-green-50 px-1 rounded text-center">
                                      EXP
                                    </span>
                                    <SearchableCombobox
                                      className="flex-1"
                                      value={f.selected_exp}
                                      onChange={(v) => handleSmartFilter(idx, 'selected_exp', v)}
                                      options={availableExps.map((v) => ({ value: String(v), label: String(v) }))}
                                      placeholder="선택"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleResetField(idx, 'selected_exp')}
                                      title="EXP 초기화"
                                      className="w-6 h-6 flex items-center justify-center bg-gray-50 text-[10px] text-gray-400 hover:text-orange-500 border rounded transition-all"
                                    >
                                      ↺
                                    </button>
                                  </div>
                                )}
                                {f.stock_id && (
                                  <div className="text-[10px] text-blue-600 font-bold mt-1 pl-10">
                                    ↳ 가용 잔량:{' '}
                                    {availableStocks.find((s) => s.id.toString() === f.stock_id)?.current_qty}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400 italic">추적 관리 안함</div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <input
                              type="number"
                              value={f.out_qty}
                              disabled={f.is_sn && f.selected_sn !== ''}
                              onChange={(e) => {
                                const newF = [...fulfillments];
                                newF[idx] = { ...newF[idx], out_qty: parseInt(e.target.value, 10) || 0 };
                                setFulfillments(newF);
                              }}
                              className={`w-16 p-2 border rounded-lg text-center font-black text-red-600 outline-none focus:border-red-500 ${
                                f.is_sn && f.selected_sn !== '' ? 'bg-gray-100 opacity-50' : ''
                              }`}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleSplitLine(idx)}
                                title="재고 분할"
                                className="w-8 h-8 bg-gray-100 rounded-lg font-black text-gray-400 hover:bg-blue-600 hover:text-white transition-all"
                              >
                                +
                              </button>
                              {fulfillments.filter((line) => line.req_item_id === f.req_item_id).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="w-8 h-8 bg-gray-100 rounded-lg text-gray-400 hover:bg-red-500 hover:text-white transition-all"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
