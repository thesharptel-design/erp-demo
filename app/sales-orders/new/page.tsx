'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { generateNextSerialDocNo } from '@/lib/serial-doc-no'

function OutboundEntryForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const soId = searchParams.get('so_id')

  const [loading, setLoading] = useState(false)
  const [outboundDate, setOutboundDate] = useState(new Date().toISOString().split('T')[0])
  const [soInfo, setSoInfo] = useState<any>(null)
  const [rows, setRows] = useState<any[]>([]) // 합산된 품목 리스트

  useEffect(() => {
    if (soId) fetchSalesOrderData(soId)
  }, [soId])

  const fetchSalesOrderData = async (id: string) => {
    setLoading(true)
    // 1. 수주 마스터 및 상세 품목 조인해서 가져오기
    const { data: items } = await supabase
      .from('sales_order_items')
      .select('*, items(*), sales_orders(*, customers(*))')
      .eq('so_id', id)

    if (items && items.length > 0) {
      setSoInfo(items[0].sales_orders)

      // 🌟 핵심 로직: 품목 ID 기준 합산 (5만/3만 단가 달라도 창고용은 하나로!)
      const aggregated = items.reduce((acc: any[], current: any) => {
        const existing = acc.find(item => item.item_id === current.item_id)
        if (existing) {
          existing.qty += current.qty // 수량 합산
        } else {
          acc.push({
            item_id: current.item_id,
            item_name: current.items.item_name,
            item_spec: current.items.item_spec,
            qty: current.qty,
            lot_no: '' // 창고에서 입력할 값
          })
        }
        return acc
      }, [])

      setRows(aggregated)
    }
    setLoading(false)
  }

  const handleSave = async () => {
    if (rows.length === 0) return alert('출고할 품목이 없습니다.')
    setLoading(true)
    try {
      const outboundNo = await generateNextSerialDocNo(supabase, {
        table: 'outbound_orders',
        column: 'outbound_no',
        code: 'OUT',
      })

      // 1. 출고 마스터 저장
      const { data: out, error: outErr } = await supabase.from('outbound_orders').insert({
        outbound_no: outboundNo,
        outbound_date: outboundDate,
        customer_id: soInfo.customer_id,
        so_id: parseInt(soId!),
        status: 'completed'
      }).select().single()

      if (outErr) throw outErr

      // 2. 출고 상세 품목 저장
      const itemPayload = rows.map(r => ({
        outbound_id: out.id,
        item_id: r.item_id,
        qty: r.qty,
        lot_no: r.lot_no
      }))
      await supabase.from('outbound_items').insert(itemPayload)

      // 3. 재고 차감 (수불부 기록)
      const stockPayload = rows.map(r => ({
        item_id: r.item_id,
        transaction_type: 'outbound',
        qty: -r.qty, // 마이너스 처리
        reference_id: outboundNo,
        transaction_date: outboundDate
      }))
      await supabase.from('inventory_transactions').insert(stockPayload)

      alert('✅ 출고 완료! 재고가 정상적으로 차감되었습니다.')
      router.push('/sales-orders')
    } catch (e: any) {
      alert('출고 처리 중 에러: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  if (!soInfo && !loading) return <div className="p-20 text-center font-bold">수주 정보를 불러올 수 없습니다.</div>

  return (
    <div className="p-8 max-w-[1200px] mx-auto font-sans bg-gray-50 min-h-screen space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic">Outbound <span className="text-red-500">Entry</span></h1>
          <p className="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">수주 기반 물품 출고 및 재고 차감</p>
        </div>
        <button onClick={handleSave} disabled={loading} className="px-12 py-4 bg-red-500 text-white rounded-2xl font-black shadow-xl hover:bg-red-600 transition-all active:scale-95">
          {loading ? '처리 중...' : '출고 완료 (재고 차감)'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-[10px] font-black text-red-500 uppercase">Step 1. Basic Info</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">출고 일자</label>
              <input type="date" value={outboundDate} onChange={e => setOutboundDate(e.target.value)} className="p-4 bg-gray-50 border-none rounded-2xl font-bold" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-gray-400 uppercase ml-1">참조 수주번호</label>
              <div className="p-4 bg-gray-100 rounded-2xl font-bold text-gray-500 uppercase">{soInfo?.so_no}</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-[10px] font-black text-red-500 uppercase">Step 2. Customer</h3>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-gray-400 uppercase ml-1">수신처(거래처)</label>
            <div className="p-4 bg-gray-50 rounded-2xl font-black text-xl text-blue-600 italic">
              {soInfo?.customers?.customer_name}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <h3 className="p-8 pb-0 text-[10px] font-black text-red-500 uppercase">Step 3. Aggregated Items</h3>
        {/* 🌟 가로 스크롤 적용 컨테이너 */}
        <div className="overflow-x-auto custom-scrollbar p-2">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 text-[11px] font-black text-gray-400 uppercase border-b border-gray-100">
              <tr>
                <th className="px-8 py-6 text-left">품목명 / 규격</th>
                <th className="px-8 py-6 text-center w-40">최종 출고 수량 (합계)</th>
                <th className="px-8 py-6 text-left w-64">LOT 번호 입력</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-gray-700">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-red-50/10">
                  <td className="px-8 py-6">
                    <p className="font-black text-gray-900 text-base">{row.item_name}</p>
                    <p className="text-[11px] text-gray-400 font-bold">{row.item_spec || '-'}</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <span className="px-6 py-2 bg-red-50 text-red-600 rounded-full font-black text-lg">
                      {row.qty}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <input 
                      type="text" 
                      placeholder="LOT/SN 번호" 
                      className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl font-bold text-sm outline-none focus:border-red-400 transition-all"
                      onChange={e => {
                        const newRows = [...rows];
                        newRows[idx].lot_no = e.target.value;
                        setRows(newRows);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function NewOutboundPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center animate-pulse">페이지 로딩 중...</div>}>
      <OutboundEntryForm />
    </Suspense>
  )
}