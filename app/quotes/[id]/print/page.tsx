'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { getQuoteStatusUnifiedBadge } from '@/lib/quote-ui-status';

export default function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [myInfo, setMyInfo] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: qData } = await supabase.from('quotes').select('*, customers(*)').eq('id', id).maybeSingle();

      if (qData) {
        const { data: uData } = await supabase.from('app_users').select('user_name').eq('id', qData.user_id).maybeSingle();
        const { data: iData } = await supabase.from('quote_items').select('*, items(*)').eq('quote_id', id).order('line_no', { ascending: true });

        setData({ ...qData, writer: uData });
        setItems(iData || []);
      }
      const { data: mData } = await supabase.from('my_company_settings').select('*').eq('id', 1).maybeSingle();
      if (mData) setMyInfo(mData);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 text-sm font-bold text-gray-400">
        문서를 구성 중입니다…
      </div>
    );
  }

  const statusBadge = getQuoteStatusUnifiedBadge(data.status);

  const totalSupply = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalVat = Math.floor(totalSupply * 0.1);
  const grandTotal = totalSupply + totalVat;

  return (
    <div className="min-h-screen bg-gray-50 p-0 font-sans text-gray-900 sm:p-8 print:bg-white print:p-0">
      <div className="fixed top-4 right-4 z-50 flex gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-12 items-center rounded-xl border-2 border-black bg-gray-900 px-5 text-sm font-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-black"
        >
          견적서 출력
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="inline-flex h-12 items-center rounded-xl border-2 border-gray-300 bg-white px-5 text-sm font-bold text-gray-600 hover:bg-gray-50"
        >
          닫기
        </button>
      </div>

      {/* 📄 견적서 본문 (A4 규격 강제 및 상하좌우 여백 확보) */}
      <div className="print-page mx-auto bg-white flex flex-col relative" 
           style={{ width: '210mm', minHeight: '297mm' }}>
        
        {/* 1. 헤더 */}
        <div className="mb-10 flex items-end justify-between border-b-2 border-black pb-6">
          <div>
            <h1 className="mb-2 text-4xl font-black tracking-tighter text-gray-900">견적서 (Quotation)</h1>
            <p className="font-mono text-xs font-bold text-gray-500">
              NO. {data.quote_no} / DATE. {data.quote_date}
            </p>
            <div className="mt-3">
              <span className={statusBadge.className}>{statusBadge.label}</span>
            </div>
          </div>
          <div className="text-right">
            {myInfo.logo_url ? (
              <Image src={myInfo.logo_url} className="mb-2 ml-auto h-12 w-auto object-contain" alt="Logo" width={120} height={48} unoptimized />
            ) : (
              <span className="text-2xl font-black tracking-tighter text-gray-300">{myInfo.company_name}</span>
            )}
          </div>
        </div>

        {/* 2. 정보 섹션 */}
        <div className="grid grid-cols-2 gap-16 mb-12">
          <div className="space-y-4">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Recipient</p>
            <h4 className="text-3xl font-black text-gray-900 mb-6 underline decoration-gray-100 underline-offset-8">
              {data.customers?.customer_name} <span className="text-base font-normal text-gray-400 ml-1">귀하</span>
            </h4>
            <div className="space-y-1.5 text-xs text-gray-900 font-bold">
              <div className="flex"><span className="w-20 text-gray-300 font-medium">담당자</span><span>{data.writer?.user_name || '관리자'}</span></div>
              <div className="flex"><span className="w-20 text-gray-300 font-medium">연락처</span><span>{data.manager_phone || '-'}</span></div>
              <div className="flex"><span className="w-20 text-gray-300 font-medium">E-MAIL</span><span>{data.manager_email || '-'}</span></div>
            </div>
          </div>

          <div className="relative space-y-4 pt-1">
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Provider</p>
            <h4 className="text-xl font-black text-gray-900 mb-5">{myInfo.company_name}</h4>
            <div className="space-y-1.5 text-xs text-gray-900 font-bold relative leading-tight">
              <div className="flex"><span className="w-20 text-gray-300 font-medium">사업번호</span><span>{myInfo.business_no}</span></div>
              <div className="flex items-center relative h-5">
                <span className="w-20 text-gray-300 font-medium">대표이사</span>
                <span className="z-10">{myInfo.ceo_name}</span>
                {/* 🌟 인감 위치: 김용태 성함 기준 더 오른쪽으로 조정 (left-75px -> 95px) */}
                {myInfo.stamp_url && (
                  <Image src={myInfo.stamp_url} className="w-14 h-14 absolute left-[95px] top-[-18px] opacity-90 rotate-12 z-0" alt="Stamp" width={56} height={56} unoptimized />
                )}
              </div>
              <div className="flex"><span className="w-20 text-gray-300 font-medium">주소</span><span className="text-gray-600 font-medium max-w-[200px]">{myInfo.address}</span></div>
            </div>
          </div>
        </div>

        {/* 3. 합계 바 */}
        <div className="bg-gray-50 border-y border-gray-100 py-4 px-8 mb-10 flex justify-between items-center rounded-sm">
          <span className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Total Estimate</span>
          <div className="text-right">
            <span className="text-[10px] font-bold text-gray-300 mr-5 uppercase tracking-tighter">VAT Included</span>
            <span className="text-3xl font-black tracking-tighter text-gray-900 italic">
              ₩ {(grandTotal || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* 4. 품목 테이블 */}
        <div className="flex-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[10px] font-black text-gray-300 uppercase tracking-widest border-b-2 border-gray-900">
                <th className="py-4 pl-2 text-left w-10">#</th>
                <th className="py-4 text-left">Description</th>
                <th className="py-4 text-left w-32">Spec</th>
                <th className="py-4 text-center w-16">Qty</th>
                <th className="py-4 text-right w-32">Price</th>
                <th className="py-4 text-right pr-2 w-32">Amount</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-gray-50">
              {items.map((item, idx) => (
                <tr key={idx} className="break-inside-avoid">
                  <td className="py-5 pl-2 font-bold text-gray-200">{(idx + 1).toString().padStart(2, '0')}</td>
                  <td className="py-5 font-black text-gray-800 text-[15px]">{item.items?.item_name}</td>
                  <td className="py-5 text-[11px] text-gray-400 font-bold">{item.items?.item_spec || '-'}</td>
                  <td className="py-5 text-center font-bold text-gray-600">{item.qty}</td>
                  <td className="py-5 text-right text-gray-500 font-medium">{item.unit_price?.toLocaleString()}</td>
                  <td className="py-5 text-right font-black text-gray-900 pr-2">{item.amount?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 합계 섹션 */}
          <div className="mt-10 border-t-4 border-gray-900 break-inside-avoid">
            <div className="flex justify-end gap-16 py-3 border-b border-gray-50">
              <span className="text-[10px] font-bold text-gray-300 uppercase">Subtotal</span>
              <span className="text-sm font-bold text-gray-600 pr-2">{totalSupply.toLocaleString()}</span>
            </div>
            <div className="flex justify-end gap-16 py-3 border-b border-gray-50">
              <span className="text-[10px] font-bold text-gray-300 uppercase">VAT (10%)</span>
              <span className="text-sm font-bold text-gray-600 pr-2">{totalVat.toLocaleString()}</span>
            </div>
            <div className="flex justify-end gap-16 py-5 bg-gray-50/50">
              <span className="text-xs font-black text-gray-900 uppercase tracking-[0.3em]">Grand Total</span>
              <span className="pr-2 text-2xl font-black tracking-tighter text-gray-900">₩ {grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* 5. 상세 조건 & 비고 */}
        <div className="mt-12 pt-8 border-t border-gray-100 break-inside-avoid">
          <div className="grid grid-cols-2 gap-x-16 gap-y-4 text-xs font-bold uppercase tracking-widest mb-10">
            <div className="flex justify-between border-b border-gray-50 pb-2"><span>납기 (Delivery)</span><span className="text-gray-900">{data.delivery_date_text || '-'}</span></div>
            <div className="flex justify-between border-b border-gray-50 pb-2"><span>장소 (Place)</span><span className="text-gray-900">{data.delivery_place || '-'}</span></div>
            <div className="flex justify-between border-b border-gray-50 pb-2"><span>유효 (Validity)</span><span className="text-gray-900">{data.lead_time || '-'}</span></div>
            <div className="flex justify-between border-b border-gray-50 pb-2"><span>결제 (Terms)</span><span className="text-gray-900">{data.payment_terms || '-'}</span></div>
          </div>
          <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100">
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3 italic">Special Remarks</p>
            <p className="text-sm leading-relaxed text-gray-600 font-medium whitespace-pre-line">
              {data.remarks || '본 견적서는 BIO-ERP 시스템을 통해 공식 발행되었습니다.'}
            </p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="mt-auto pt-10 flex justify-between items-center text-[9px] font-bold text-gray-200 uppercase tracking-[0.4em]">
          <span>Powered by Niks Solutions</span>
          <div className="h-px bg-gray-50 flex-1 mx-12"></div>
          <span>Authorized Document</span>
        </div>

      </div>

      {/* 🌟 6. 여백 및 헤더 제거 스타일링 */}
      <style jsx global>{`
        @page {
          size: A4;
          margin: 0; /* 브라우저 기본 헤더(날짜/URL)를 숨기는 핵심 */
        }
        @media print {
          body { -webkit-print-color-adjust: exact; background: white; }
          .print-page { 
            margin: 0 auto !important;
            padding: 20mm 20mm !important; /* 문서 실제 여백 (상하 20mm, 좌우 20mm) */
            box-shadow: none !important;
            page-break-after: always;
          }
          .print:hidden { display: none !important; }
        }
        .print-page {
          padding: 20mm;
          box-shadow: 0 0 40px rgba(0,0,0,0.05);
        }
      `}</style>
    </div>
  );
}