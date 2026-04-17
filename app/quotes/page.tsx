'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userData, setUserData] = useState<any>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true);
    
    // 1. 현재 사용자 권한 정보 가져오기
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data: user } = await supabase
        .from('app_users')
        .select('*')
        .eq('id', session.user.id)
        .single();
      setUserData(user);
    }

    // 2. 견적서 목록 가져오기
    const { data, error } = await supabase
      .from('quotes')
      .select(`
        id,
        quote_no,
        quote_date,
        status,
        total_amount,
        remarks,
        customers (customer_name),
        app_users (user_name)
      `)
      .order('id', { ascending: false });

    if (!error) setQuotes(data || []);
    setLoading(false);
  }

  // 🌟 권한 체크 (관리자거나 영업권한이 true일 때)
  const hasPermission = userData?.role_name === 'admin' || userData?.can_sales_manage === true;

  if (loading) return <div className="p-20 text-center font-bold text-gray-400">데이터 로딩 중...</div>

  return (
    <div className="p-8 font-sans bg-gray-50 min-h-screen space-y-8">
      
      {/* 🌟 중복되던 'Current User' 바를 삭제했습니다. (AppShell에서 이미 보여줌) */}

      {/* 헤더 섹션 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pt-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">Quotation <span className="text-blue-600">Management</span></h1>
          <p className="mt-1 text-sm font-bold text-gray-400">
            전체 견적서 목록을 확인하고 새로운 견적을 등록합니다.
          </p>
        </div>

        {/* 🌟 고집불통 ProtectedCreateButton 대신 직접 제어하는 버튼으로 변경 */}
        {hasPermission ? (
          <Link 
            href="/quotes/new" 
            className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg hover:bg-blue-700 transition-all active:scale-95"
          >
            견적서 등록
          </Link>
        ) : (
          <div className="px-10 py-4 bg-gray-200 text-gray-400 rounded-2xl font-black flex items-center gap-2 cursor-not-allowed border border-gray-100">
            🔒 권한 필요 (영업)
          </div>
        )}
      </div>

      {/* 테이블 섹션 */}
      <div className="overflow-hidden rounded-[2.5rem] border border-gray-100 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50/50 text-left text-[11px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-50">
            <tr>
              <th className="px-8 py-5">견적번호</th>
              <th className="px-8 py-5">견적일</th>
              <th className="px-8 py-5">거래처</th>
              <th className="px-8 py-5">작성자</th>
              <th className="px-8 py-5 text-center">상태</th>
              <th className="px-8 py-5 text-right">총금액 (KRW)</th>
              <th className="px-8 py-5">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {quotes.map((quote) => (
              <tr key={quote.id} className="hover:bg-blue-50/20 transition-all group">
                <td className="px-8 py-5">
                  <Link href={`/quotes/${quote.id}`} className="text-blue-600 font-black hover:underline decoration-2 underline-offset-4">
                    {quote.quote_no}
                  </Link>
                </td>
                <td className="px-8 py-5 text-gray-500 font-medium">{quote.quote_date}</td>
                <td className="px-8 py-5 font-bold text-gray-700">{quote.customers?.customer_name || '-'}</td>
                <td className="px-8 py-5 text-gray-500">{quote.app_users?.user_name || '-'}</td>
                <td className="px-8 py-5 text-center">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                    quote.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                    quote.status === 'cancelled' ? 'bg-red-100 text-red-600' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {quote.status === 'pending' ? '진행중' : quote.status}
                  </span>
                </td>
                <td className="px-8 py-5 text-right font-black text-gray-900">
                  {quote.total_amount?.toLocaleString()}
                </td>
                <td className="px-8 py-5 text-gray-400 text-xs truncate max-w-[150px]">
                  {quote.remarks || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}