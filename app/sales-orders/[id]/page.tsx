'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getApprovalComposePopupWindowName, getApprovalDocTypeRule } from '@/lib/approval-doc-type-rules';
import { openApprovalShellPopup } from '@/lib/approval-popup';

const OUTBOUND_DRAFT_COMPOSE_HREF =
  getApprovalDocTypeRule('outbound_request')?.composeHref ?? '/outbound-requests/new';
const OUTBOUND_DRAFT_COMPOSE_WINDOW_NAME = getApprovalComposePopupWindowName('outbound_request');

export default function SalesOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. 수주 마스터 정보 가져오기 (Relationship 에러 방지를 위해 간단하게 호출)
      const { data: so, error: soErr } = await supabase
        .from('sales_orders')
        .select('*, customers(*)') // 우선 거래처 정보만 조인
        .eq('id', id)
        .single();

      if (soErr) throw soErr;
      setData(so);

      // 2. 수주 상세 품목 가져오기 (so_id 기준)
      const { data: iData, error: iErr } = await supabase
        .from('sales_order_items')
        .select('*, items(*)')
        .eq('so_id', id)
        .order('line_no', { ascending: true });

      if (iErr) throw iErr;
      setItems(iData || []);

    } catch (e: any) {
      console.error('Fetch Error:', e);
      alert('데이터 로드 실패: ' + e.message);
      router.push('/sales-orders');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) return <div className="p-20 text-center font-bold text-gray-400 animate-pulse">수주 데이터를 불러오는 중입니다...</div>;

  return (
    <div className="p-8 max-w-[1400px] mx-auto font-sans bg-gray-50 min-h-screen space-y-8">
      {/* 윗부분: 제목 및 버튼 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-5">
          <Link href="/sales-orders" className="w-12 h-12 flex items-center justify-center bg-white border border-gray-100 rounded-full shadow-sm hover:bg-gray-100 text-gray-400 transition-all">←</Link>
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic">Order <span className="text-blue-600">Details</span></h1>
            <p className="text-[11px] font-black text-gray-400 mt-1 uppercase tracking-[0.3em]">
              SO NO: {data.so_no} / STATUS: <span className="text-blue-500 font-black">{data.status}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              const url = `${OUTBOUND_DRAFT_COMPOSE_HREF}?so_id=${encodeURIComponent(id)}`;
              openApprovalShellPopup(url, OUTBOUND_DRAFT_COMPOSE_WINDOW_NAME);
            }}
            className="px-10 py-4 bg-gray-900 text-white rounded-[1.5rem] font-black shadow-xl hover:bg-black transition-all active:scale-95"
          >
            📦 출고 등록 (Outbound)
          </button>
        </div>
      </div>

      {/* 중간: 요약 정보 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 거래처 카드 */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
          <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Customer info</p>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">{data.customers?.customer_name || '미지정 거래처'}</h2>
          <div className="text-sm font-bold text-gray-500 space-y-1 mt-4">
            <p className="flex justify-between"><span>수주일자</span><span className="text-gray-900">{data.order_date}</span></p>
            <p className="flex justify-between"><span>관리번호</span><span className="text-gray-400">{data.so_no}</span></p>
          </div>
        </div>

        {/* 납기/비고 카드 */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Delivery & Remarks</p>
          <h2 className="text-xl font-black text-gray-800 leading-tight">
            {data.delivery_date_text || '별도 납기 정보 없음'}
          </h2>
          <div className="mt-4 p-4 bg-gray-50 rounded-2xl min-h-[60px]">
            <p className="text-[9px] font-black text-gray-300 uppercase mb-1 tracking-tighter">비고 사항</p>
            <p className="text-xs font-bold text-gray-600 leading-relaxed whitespace-pre-wrap">{data.remarks || '등록된 비고가 없습니다.'}</p>
          </div>
        </div>

        {/* 합계 금액 카드 */}
        <div className="bg-blue-600 p-8 rounded-[2.5rem] shadow-2xl space-y-4 text-white relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest">Total Amount (VAT Inc.)</p>
            <h2 className="text-4xl font-black italic tracking-tighter mt-4">
              ₩ {data.total_amount?.toLocaleString()}
            </h2>
            <div className="mt-6 inline-flex items-center gap-2 bg-blue-500/30 px-3 py-1 rounded-full border border-blue-400/30">
              <span className="w-2 h-2 bg-blue-200 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest">Confirmed Order</span>
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-blue-500 rounded-full opacity-20"></div>
        </div>
      </div>

      {/* 하단: 품목 리스트 테이블 */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-gray-50 text-[11px] font-black text-gray-400 uppercase border-b border-gray-100">
              <tr>
                <th className="px-8 py-6 text-left w-16">#</th>
                <th className="px-8 py-6 text-left">Description (품목명)</th>
                <th className="px-8 py-6 text-left">Specification (규격)</th>
                <th className="px-8 py-6 text-center w-32">Qty</th>
                <th className="px-8 py-6 text-right w-40">Unit Price</th>
                <th className="px-8 py-6 text-right w-40">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-700">
              {items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-blue-50/10 transition-colors">
                  <td className="px-8 py-6 text-gray-300 font-black">{(idx + 1).toString().padStart(2, '0')}</td>
                  <td className="px-8 py-6 font-black text-gray-900 text-base">{item.items?.item_name}</td>
                  <td className="px-8 py-6 font-bold text-gray-400">{item.items?.item_spec || '-'}</td>
                  <td className="px-8 py-6 text-center font-black text-blue-600 text-base">{item.qty}</td>
                  <td className="px-8 py-6 text-right font-medium text-gray-500 italic">{item.unit_price?.toLocaleString()}</td>
                  <td className="px-8 py-6 text-right font-black text-gray-900 text-base tabular-nums">
                    {item.amount?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}