'use client';

import { useCallback, useEffect, useState, use } from 'react';
import SearchableCombobox from '@/components/SearchableCombobox';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
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
  };

  const handleOpenPrint = () => {
    const width = 900; const height = 1000;
    const left = (window.screen.width / 2) - (width / 2); const top = (window.screen.height / 2) - (height / 2);
    window.open(`/quotes/${id}/print`, 'QuotationPrint', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`);
  };

  if (loading) return <div className="p-10 text-center font-bold text-gray-400">데이터 로딩 중...</div>;

  return (
    <div className="p-8 max-w-[1500px] mx-auto font-sans bg-gray-50 min-h-screen">
      {/* 타이틀 및 버튼 */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link href="/quotes" className="w-10 h-10 flex items-center justify-center bg-white border rounded-full shadow-sm hover:bg-gray-100 text-gray-400 transition-all">←</Link>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Quotation <span className="text-blue-600">Detail</span></h1>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">번호: {quoteNo} / 상태: <span className="text-blue-500 font-black">{status}</span></p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleOpenPrint} className="px-6 py-3 bg-gray-800 text-white rounded-xl font-black text-sm shadow-md hover:bg-black transition-all">프린트 / E-mail</button>
          <button onClick={handleUpdate} disabled={isSaving} className="px-10 py-3 bg-blue-600 text-white rounded-xl font-black text-sm shadow-lg hover:bg-blue-700 transition-all">
            {isSaving ? '저장 중...' : '수정사항 저장'}
          </button>
        </div>
      </div>

      {/* 3단 레이아웃 그리드 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8 items-stretch">
        {/* Column 1: Basic & Contact */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 flex flex-col">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Basic & Contact</h2>
          <div className="space-y-4">
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">견적 일자</label>
            <input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">거래처</label>
            <SearchableCombobox
              value={customerId}
              onChange={setCustomerId}
              options={customerOptions}
              placeholder="거래처 선택"
            /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">담당자 연락처</label>
            <input type="text" value={managerPhone} onChange={e => setManagerPhone(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">담당자 E-MAIL</label>
            <input type="email" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700" /></div>
          </div>
        </div>

        {/* Column 2: Terms & Delivery */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 flex flex-col">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Terms & Delivery</h2>
          <div className="space-y-4">
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">결제 조건</label>
            <input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">유효 일자</label>
            <input type="text" value={validityDate} onChange={e => setValidityDate(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">납기 일자</label>
            <input type="text" value={deliveryDateText} onChange={e => setDeliveryDateText(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700" /></div>
            <div className="flex flex-col gap-1"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">납품 장소</label>
            <input type="text" value={deliveryPlace} onChange={e => setDeliveryPlace(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700" /></div>
          </div>
        </div>

        {/* Column 3: Notes & Meta (높이 버그 해결 구간) */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1 mb-6">Notes & Meta</h2>
          <div className="space-y-6 flex-1 flex flex-col">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">작성자</label>
              <input type="text" value={writerName} disabled className="w-full p-4 bg-gray-50 border-2 border-gray-50 rounded-2xl font-bold text-gray-400 cursor-not-allowed" />
            </div>
            <div className="flex flex-col gap-2 flex-1 min-h-[250px]">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">비고 (참조사항)</label>
              <textarea 
                value={remarks} 
                onChange={e => setRemarks(e.target.value)} 
                className="w-full flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm resize-none"
                placeholder="특이사항을 입력하세요"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 품목 리스트 그리드 */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-400 font-bold text-[11px] uppercase">
            <tr>
              <th className="px-6 py-5 text-center w-12">No.</th>
              <th className="px-6 py-5 text-left">품목명</th>
              <th className="px-6 py-5 text-left w-48">규격</th>
              <th className="px-6 py-5 text-center w-24">수량</th>
              <th className="px-6 py-5 text-right w-32">단가</th>
              <th className="px-6 py-5 text-right w-32">공급가액</th>
              <th className="px-6 py-5 text-right w-24">부가세</th>
              <th className="px-6 py-5 text-center w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, idx) => (
              <tr key={row.id} className="hover:bg-blue-50/20 transition-colors">
                <td className="px-6 py-4 text-center text-gray-300 font-bold">{idx + 1}</td>
                <td className="px-6 py-4">
                  <SearchableCombobox
                    value={row.item_id}
                    onChange={(v) => handleItemChange(row.id, v)}
                    options={itemOptions}
                    placeholder="품목 선택"
                  />
                </td>
                <td className="px-6 py-4"><div className="p-2 bg-gray-50 rounded-xl text-gray-500 font-medium truncate text-xs">{row.item_spec}</div></td>
                <td className="px-6 py-4"><input type="number" value={row.qty} onChange={e => updateRowAmount(row.id, 'qty', parseInt(e.target.value) || 0)} className="w-full p-2 border border-gray-200 rounded-xl text-center font-black outline-none focus:border-blue-500" /></td>
                <td className="px-6 py-4"><input type="number" value={row.unit_price} onChange={e => updateRowAmount(row.id, 'unit_price', parseInt(e.target.value) || 0)} className="w-full p-2 border border-gray-200 rounded-xl text-right font-black text-blue-600 outline-none focus:border-blue-500" /></td>
                <td className="px-6 py-4 text-right font-black text-gray-700">{row.supply_amount.toLocaleString()}</td>
                <td className="px-6 py-4 text-right font-bold text-gray-400">{row.vat.toLocaleString()}</td>
                <td className="px-6 py-4 text-center">
                  <button onClick={() => removeRow(row.id)} className="text-gray-200 hover:text-red-500 font-black text-lg transition-colors">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* 하단 요약부 */}
        <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <button onClick={addRow} className="px-6 py-3 bg-black text-white rounded-2xl text-xs font-black hover:bg-gray-800 shadow-md transition-all">+ 행 추가</button>
          <div className="text-right border-l-2 pl-12 border-gray-200">
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Grand Total</p>
            <p className="text-4xl font-black text-blue-600">{(totalSupply + totalVat).toLocaleString()} <span className="text-sm font-bold text-blue-300 ml-1">KRW</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}