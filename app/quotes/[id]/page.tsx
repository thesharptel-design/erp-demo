'use client';

import { useCallback, useEffect, useMemo, useState, use } from 'react';
import SearchableCombobox from '@/components/SearchableCombobox';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getQuoteStatusUnifiedBadge } from '@/lib/quote-ui-status';
import { useSingleSubmit } from '@/hooks/useSingleSubmit';

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit();
  
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  // 데이터 상태
  const [quoteNo, setQuoteNo] = useState('');
  const [status, setStatus] = useState('');
  const [quoteDate, setQuoteDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [validityDate, setValidityDate] = useState('');
  const [deliveryDateText, setDeliveryDateText] = useState('');
  const [deliveryPlace, setDeliveryPlace] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [remarks, setRemarks] = useState('');
  const [writerName, setWriterName] = useState('');

  const [rows, setRows] = useState<any[]>([]);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: custData }, { data: itemData }] = await Promise.all([
        supabase.from('customers').select('*').order('customer_name'),
        supabase.from('items').select('*').order('item_name')
      ]);
      setCustomers(custData || []);
      setItems(itemData || []);

      const { data: quote, error } = await supabase
        .from('quotes')
        .select('*, app_users:user_id (user_name), quote_items(*, items(*))')
        .eq('id', id)
        .single();

      if (error) throw error;

      setQuoteNo(quote.quote_no);
      setStatus(quote.status);
      setQuoteDate(quote.quote_date);
      setCustomerId(quote.customer_id?.toString() || '');
      setPaymentTerms(quote.payment_terms || '');
      setValidityDate(quote.lead_time || '');
      setDeliveryDateText(quote.delivery_date_text || '');
      setDeliveryPlace(quote.delivery_place || '');
      setManagerPhone(quote.manager_phone || '');
      setManagerEmail(quote.manager_email || '');
      setRemarks(quote.remarks || '');
      setWriterName(quote.app_users?.user_name || '관리자');

      const initialRows = quote.quote_items.map((ri: any) => ({
        id: generateId(),
        item_id: ri.item_id.toString(),
        item_spec: ri.items?.item_spec || '-',
        qty: ri.qty,
        unit_price: ri.unit_price,
        supply_amount: ri.amount,
        vat: Math.floor(ri.amount * 0.1)
      }));
      setRows(initialRows);
    } catch {
      alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleItemChange = (rowId: string, itemId: string) => {
    const item = items.find(i => i.id.toString() === itemId);
    setRows(rows.map(r => {
      if (r.id === rowId) {
        const price = item?.sales_price || 0;
        const supply = r.qty * price;
        return { ...r, item_id: itemId, item_spec: item?.item_spec || '-', unit_price: price, supply_amount: supply, vat: Math.floor(supply * 0.1) };
      }
      return r;
    }));
  };

  const updateRowAmount = (rowId: string, field: string, value: number) => {
    setRows(rows.map(r => {
      if (r.id === rowId) {
        const updated = { ...r, [field]: value };
        updated.supply_amount = updated.qty * updated.unit_price;
        updated.vat = Math.floor(updated.supply_amount * 0.1);
        return updated;
      }
      return r;
    }));
  };

  const addRow = () => setRows([...rows, { id: generateId(), item_id: '', qty: 1, unit_price: 0, supply_amount: 0, vat: 0, item_spec: '' }]);
  const removeRow = (id: string) => rows.length > 1 && setRows(rows.filter(r => r.id !== id));

  const totalSupply = rows.reduce((sum, r) => sum + r.supply_amount, 0);
  const totalVat = rows.reduce((sum, r) => sum + r.vat, 0);
  const statusPresentation = useMemo(() => getQuoteStatusUnifiedBadge(status), [status]);
  const customerOptions = customers.map((c) => ({
    value: String(c.id),
    label: c.customer_name,
    keywords: [c.customer_name],
  }));
  const itemOptions = items.map((i) => ({
    value: String(i.id),
    label: `[${i.item_code}] ${i.item_name}`,
    keywords: [i.item_code, i.item_name],
  }));

  // 🌟 저장 로직 (Delete & Insert 방식)
  const handleUpdate = async () => {
    if (!customerId) return alert('거래처를 선택하세요.');
    if (rows.some(r => !r.item_id)) return alert('품목을 선택하지 않은 행이 있습니다.');

    await runSingleSubmit(async () => {
      setIsSaving(true);
      try {
      // 1. 마스터 업데이트
      const { error: qErr } = await supabase.from('quotes').update({
        quote_date: quoteDate,
        customer_id: parseInt(customerId),
        payment_terms: paymentTerms,
        lead_time: validityDate,
        delivery_date_text: deliveryDateText,
        delivery_place: deliveryPlace,
        manager_phone: managerPhone,
        manager_email: managerEmail,
        total_amount: totalSupply + totalVat,
        remarks: remarks,
        updated_at: new Date().toISOString()
      }).eq('id', id);

      if (qErr) throw qErr;

      // 2. 기존 상세 삭제 후 다시 인서트
      await supabase.from('quote_items').delete().eq('quote_id', id);
      
      const itemPayload = rows.map((r, idx) => ({ 
        quote_id: parseInt(id as string), 
        item_id: parseInt(r.item_id), 
        qty: r.qty, 
        unit_price: r.unit_price, 
        amount: r.supply_amount, 
        line_no: idx + 1 
      }));

      const { error: iErr } = await supabase.from('quote_items').insert(itemPayload);
      if (iErr) throw iErr;

        alert('✅ 수정사항이 저장되었습니다.');
        router.refresh();
      } catch (e: any) { 
        alert('수정 실패: ' + e.message); 
      } finally { 
        setIsSaving(false); 
      }
    })
  };

  const handleOpenPrint = () => {
    const width = 900; const height = 1000;
    const left = (window.screen.width / 2) - (width / 2); const top = (window.screen.height / 2) - (height / 2);
    window.open(`/quotes/${id}/print`, 'QuotationPrint', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <p className="py-24 text-center text-sm font-bold text-gray-400">데이터 로딩 중...</p>
      </div>
    );
  }

  const fieldClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30';
  const comboProps = {
    buttonClassName: 'text-[11px] font-bold py-2',
    dropdownClassName: 'text-xs',
    listMaxHeightClass: 'max-h-56 overflow-y-auto',
    dropdownPlacement: 'auto' as const,
    showClearOption: false as const,
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10.5rem)] max-w-[1600px] flex-col space-y-6 bg-gray-50 p-6 font-sans">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/quotes"
            className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border-2 border-gray-300 bg-white text-sm font-black text-gray-500 shadow-sm hover:bg-gray-50"
            aria-label="목록으로"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tighter text-gray-900">견적서 상세</h1>
            <p className="mt-1 text-sm font-bold text-gray-500">
              문서번호{' '}
              <span className="font-black text-gray-800">{quoteNo || '—'}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={statusPresentation.className}>{statusPresentation.label}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleOpenPrint}
            className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-5 text-sm font-black text-gray-800 hover:bg-gray-50"
          >
            프린트
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isSaving || isMutating}
            className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-black bg-blue-600 px-6 text-sm font-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-700 disabled:opacity-50 active:translate-y-1 active:shadow-none"
          >
            {isSaving ? '저장 중...' : '수정사항 저장'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col space-y-4 rounded-2xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">기본 · 연락처</h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">견적 일자</label>
              <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">거래처</label>
              <SearchableCombobox
                value={customerId}
                onChange={setCustomerId}
                options={customerOptions}
                placeholder="거래처 선택"
                {...comboProps}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">담당자 연락처</label>
              <input type="text" value={managerPhone} onChange={(e) => setManagerPhone(e.target.value)} className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">담당자 E-MAIL</label>
              <input type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} className={fieldClass} />
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-4 rounded-2xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">조건 · 납기</h2>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">결제 조건</label>
              <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">유효 일자</label>
              <input type="text" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">납기 일자</label>
              <input type="text" value={deliveryDateText} onChange={(e) => setDeliveryDateText(e.target.value)} className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">납품 장소</label>
              <input type="text" value={deliveryPlace} onChange={(e) => setDeliveryPlace(e.target.value)} className={fieldClass} />
            </div>
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">비고 · 메타</h2>
          <div className="mt-4 flex flex-1 flex-col space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">작성자</label>
              <input type="text" value={writerName} disabled className={`${fieldClass} cursor-not-allowed bg-gray-50 text-gray-500`} />
            </div>
            <div className="flex min-h-[220px] flex-1 flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-500">비고 (참조사항)</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="min-h-[180px] w-full flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                placeholder="특이사항을 입력하세요"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="border-b-2 border-black bg-gray-50 text-left text-xs font-black uppercase tracking-wider text-gray-400">
              <tr>
                <th className="w-12 px-4 py-4 text-center">No.</th>
                <th className="px-4 py-4">품목명</th>
                <th className="w-44 px-4 py-4">규격</th>
                <th className="w-24 px-4 py-4 text-center">수량</th>
                <th className="w-28 px-4 py-4 text-right">단가</th>
                <th className="w-28 px-4 py-4 text-right">공급가액</th>
                <th className="w-24 px-4 py-4 text-right">부가세</th>
                <th className="w-10 px-4 py-4 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, idx) => (
                <tr key={row.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 text-center text-xs font-bold text-gray-400">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <SearchableCombobox
                      value={row.item_id}
                      onChange={(v) => handleItemChange(row.id, v)}
                      options={itemOptions}
                      placeholder="품목 선택"
                      {...comboProps}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="truncate rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs font-bold text-gray-600">{row.item_spec}</div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={row.qty}
                      onChange={(e) => updateRowAmount(row.id, 'qty', parseInt(e.target.value, 10) || 0)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-2 text-center text-sm font-black text-gray-800 outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={row.unit_price}
                      onChange={(e) => updateRowAmount(row.id, 'unit_price', parseInt(e.target.value, 10) || 0)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-2 text-right text-sm font-black text-blue-700 outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-black text-gray-800">{row.supply_amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-500">{row.vat.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <button type="button" onClick={() => removeRow(row.id)} className="text-lg font-black text-gray-300 hover:text-red-600">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-gray-200 bg-gray-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-black bg-black px-5 text-xs font-black text-white hover:bg-gray-900"
          >
            + 행 추가
          </button>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">합계 (KRW)</p>
            <p className="text-2xl font-black text-gray-900">{(totalSupply + totalVat).toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}