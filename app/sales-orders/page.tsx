'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function SalesOrderListPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
  }, [])

  async function fetchOrders() {
    setLoading(true)
    // 🌟 대표님 DB의 so_no 컬럼을 기준으로 조회합니다.
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*, customers(customer_name)')
      .order('created_at', { ascending: false })
    
    if (!error) setOrders(data || [])
    setLoading(false)
  }

  return (
    <div className="p-8 font-sans bg-gray-50 min-h-screen">
      {/* 헤더 섹션 */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic">Sales Order <span className="text-blue-600">List</span></h1>
          <p className="text-sm font-bold text-gray-400 mt-1 uppercase tracking-widest">확정된 수주 내역 및 출고 대기 현황</p>
        </div>
        <Link href="/sales-orders/new" className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all active:scale-95">
          신규 수주 등록
        </Link>
      </div>

      {/* 테이블 영역 (가로 스크롤 탑재) */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-x-auto custom-scrollbar">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-400 font-bold text-[11px] uppercase">
            <tr>
              <th className="px-8 py-6 text-left">수주번호</th>
              <th className="px-8 py-6 text-left">수주일자</th>
              <th className="px-8 py-6 text-left">거래처</th>
              <th className="px-8 py-6 text-center">상태</th>
              <th className="px-8 py-6 text-right">총 금액 (VAT포함)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <tr><td colSpan={5} className="py-20 text-center text-gray-300 font-bold animate-pulse">데이터를 불러오는 중...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={5} className="py-20 text-center text-gray-300 font-bold italic tracking-widest">등록된 수주 내역이 없습니다.</td></tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-blue-50/20 transition-all group">
                  <td className="px-8 py-6">
                    {/* 🌟 수주번호 클릭 시 상세 페이지로 이동 */}
                    <Link 
                      href={`/sales-orders/${o.id}`} 
                      className="font-black text-blue-600 underline decoration-blue-100 underline-offset-4 hover:text-blue-800 transition-colors"
                    >
                      {o.so_no || o.order_no}
                    </Link>
                  </td>
                  <td className="px-8 py-6 text-gray-500 font-medium">{o.order_date}</td>
                  <td className="px-8 py-6 font-black text-gray-700">{o.customers?.customer_name}</td>
                  <td className="px-8 py-6 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest
                      ${o.status === 'confirmed' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}
                    `}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right font-black text-gray-900 text-base tabular-nums">
                    {o.total_amount?.toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}