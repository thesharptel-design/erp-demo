'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateNextSerialDocNo } from '@/lib/serial-doc-no'
import SearchableCombobox from '@/components/SearchableCombobox'

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function NewQuotePage() {
  const router = useRouter()

  const [customers, setCustomers] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [userData, setUserData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // 헤더 정보 상태
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10))
  const [customerId, setCustomerId] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('협의 후 결정')
  const [validityDate, setValidityDate] = useState('견적 후 2주 이내')
  const [deliveryDateText, setDeliveryDateText] = useState('발주 후 4주 이내')
  const [deliveryPlace, setDeliveryPlace] = useState('당사 지정 장소')
  const [managerPhone, setManagerPhone] = useState('')
  const [managerEmail, setManagerEmail] = useState('')
  const [remarks, setRemarks] = useState('')

  // 품목 그리드 상태
  const [rows, setRows] = useState<any[]>([
    { id: generateId(), item_id: '', qty: 1, unit_price: 0, supply_amount: 0, vat: 0, item_spec: '' }
  ]);

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from('app_users').select('*').eq('id', session.user.id).single();
        setUserData(profile);
        if (profile) {
          setManagerPhone(profile.phone || '');
          setManagerEmail(profile.email || '');
        }
      }
      const [{ data: custData }, { data: itemData }] = await Promise.all([
        supabase.from('customers').select('*').order('customer_name'),
        supabase.from('items').select('*').order('item_name')
      ]);
      setCustomers(custData || []);
      setItems(itemData || []);
      setIsLoading(false);
    }
    loadData();
  }, []);

  const handleItemChange = (rowId: string, itemId: string) => {
    const item = items.find(i => i.id.toString() === itemId);
    setRows(rows.map(r => {
      if (r.id === rowId) {
        const price = item?.sales_price || 0;
        const supply = r.qty * price;
        return { 
          ...r, 
          item_id: itemId, 
          item_spec: item?.item_spec || '-',
          unit_price: price,
          supply_amount: supply,
          vat: Math.floor(supply * 0.1)
        };
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return alert('거래처를 선택해주세요.');
    if (rows.some(r => !r.item_id)) return alert('품목을 선택하지 않은 행이 있습니다.');

    setIsSaving(true);
    try {
      const quoteNo = await generateNextSerialDocNo(supabase, {
        table: 'quotes',
        column: 'quote_no',
        code: 'QT',
      })
      
      const { data: quote, error: qErr } = await supabase.from('quotes').insert({
        quote_no: quoteNo,
        quote_date: quoteDate,
        customer_id: parseInt(customerId),
        user_id: userData.id,
        payment_terms: paymentTerms,
        lead_time: validityDate,
        delivery_date_text: deliveryDateText,
        delivery_place: deliveryPlace,
        manager_phone: managerPhone,
        manager_email: managerEmail,
        total_amount: totalSupply + totalVat,
        remarks: remarks,
        status: 'pending'
      }).select().single();

      if (qErr) throw qErr;

      const itemPayload = rows.map((r, idx) => ({
        quote_id: quote.id,
        item_id: parseInt(r.item_id),
        qty: r.qty,
        unit_price: r.unit_price,
        amount: r.supply_amount,
        line_no: idx + 1
      }));
      await supabase.from('quote_items').insert(itemPayload);
      
      alert('✅ 견적서가 성공적으로 저장되었습니다.');
      router.push(`/quotes/${quote.id}`);
    } catch (e: any) { alert('오류: ' + e.message); } finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="p-10 text-center font-bold text-gray-400">데이터를 불러오는 중입니다...</div>;

  return (
    <div className="p-8 max-w-[1400px] mx-auto font-sans bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Quotation <span className="text-blue-600">Create</span></h1>
          <p className="text-sm font-bold text-gray-400 mt-1">상세 연락처와 납기 조건을 포함한 견적서를 작성합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSubmit} disabled={isSaving} className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all">저장(F8)</button>
          <Link href="/quotes" className="px-10 py-4 bg-white border-2 border-gray-200 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 transition-all">취소</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8 items-stretch">
        {/* Basic Info */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col gap-6">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Basic Info</h2>
          <div className="space-y-4">
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">견적 일자</label><input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm" /></div>
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">거래처 선택</label><SearchableCombobox value={customerId} onChange={setCustomerId} options={customerOptions} placeholder="거래처 선택" /></div>
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">담당자 전화번호</label><input type="text" value={managerPhone} onChange={e => setManagerPhone(e.target.value)} placeholder="010-0000-0000" className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm" /></div>
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">담당자 E-MAIL</label><input type="email" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} placeholder="manager@company.com" className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm" /></div>
          </div>
        </div>

        {/* Terms & Delivery */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col gap-6">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">Terms & Delivery</h2>
          <div className="space-y-4">
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">결제 조건</label><input type="text" value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm" /></div>
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">유효 일자 (Validity)</label><input type="text" value={validityDate} onChange={e => setValidityDate(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm" /></div>
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">납기 일자 (Delivery Date)</label><input type="text" value={deliveryDateText} onChange={e => setDeliveryDateText(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm" /></div>
            <div className="flex flex-col gap-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-1">납품 장소</label><input type="text" value={deliveryPlace} onChange={e => setDeliveryPlace(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 font-bold text-gray-700 shadow-sm" /></div>
          </div>
        </div>

        {/* 🌟 수정된 Additional Notes (박스 탈출 방지) */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col">
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1 mb-6">Additional Notes</h2>
          <div className="flex flex-col gap-2 flex-1 min-h-[300px]">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">비고 (참조사항)</label>
            {/* 🌟 h-full을 빼고 flex-1을 주어 카드의 남은 높이를 꽉 채우게 함 */}
            <textarea 
              value={remarks} 
              onChange={e => setRemarks(e.target.value)} 
              placeholder="견적 관련 특이사항을 자유롭게 입력하세요" 
              className="w-full flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold text-gray-700 shadow-sm resize-none"
            />
          </div>
        </div>
      </div>

      {/* 품목 리스트 (그리드) */}
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
              <tr key={row.id} className="hover:bg-blue-50/20 transition-all">
                <td className="px-6 py-4 text-center text-gray-300 font-bold">{idx + 1}</td>
                <td className="px-6 py-4"><SearchableCombobox value={row.item_id} onChange={v => handleItemChange(row.id, v)} options={itemOptions} placeholder="품목 선택" /></td>
                <td className="px-6 py-4"><div className="p-2 bg-gray-50 rounded-xl text-gray-500 font-medium truncate text-xs">{row.item_spec}</div></td>
                <td className="px-6 py-4"><input type="number" value={row.qty} onChange={e => updateRowAmount(row.id, 'qty', parseInt(e.target.value) || 0)} className="w-full p-2 border border-gray-200 rounded-xl text-center font-black outline-none focus:border-blue-500" /></td>
                <td className="px-6 py-4"><input type="number" value={row.unit_price} onChange={e => updateRowAmount(row.id, 'unit_price', parseInt(e.target.value) || 0)} className="w-full p-2 border border-gray-200 rounded-xl text-right font-black text-blue-600 outline-none focus:border-blue-500" /></td>
                <td className="px-6 py-4 text-right font-black text-gray-700">{row.supply_amount.toLocaleString()}</td>
                <td className="px-6 py-4 text-right font-bold text-gray-400">{row.vat.toLocaleString()}</td>
                <td className="px-6 py-4 text-center"><button onClick={() => removeRow(row.id)} className="text-gray-200 hover:text-red-500 transition-colors font-black text-lg">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <button onClick={addRow} className="px-6 py-3 bg-black text-white rounded-2xl text-xs font-black hover:bg-gray-800 transition-all shadow-md">+ 줄 추가</button>
          <div className="flex gap-12 items-center">
            <div className="text-right border-l-2 pl-12 border-gray-200">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1">Grand Total</p>
              <p className="text-4xl font-black text-blue-600">{(totalSupply + totalVat).toLocaleString()} <span className="text-sm font-bold text-blue-300 ml-1">KRW</span></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}