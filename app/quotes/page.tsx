'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import SearchableCombobox from '@/components/SearchableCombobox'
import { supabase } from '@/lib/supabase'
import { hasManagePermission } from '@/lib/permissions'
import { getQuoteStatusUnifiedBadge } from '@/lib/quote-ui-status'

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'pending', label: '결재,협조진행중', keywords: ['진행', 'pending'] },
  { value: 'approved', label: '최종승인', keywords: ['승인'] },
  { value: 'draft', label: '임시저장', keywords: ['임시'] },
  { value: 'cancelled', label: '반려', keywords: ['취소'] },
]

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userData, setUserData] = useState<any>(null)
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    void fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: user } = await supabase.from('app_users').select('*').eq('id', session.user.id).single()
      setUserData(user)
    }

    const { data, error } = await supabase
      .from('quotes')
      .select(
        `
        id,
        quote_no,
        quote_date,
        status,
        total_amount,
        remarks,
        customers (customer_name),
        app_users (user_name)
      `
      )
      .order('id', { ascending: false })

    if (!error) setQuotes(data || [])
    setLoading(false)
  }

  const filteredQuotes = useMemo(() => {
    if (!filterStatus) return quotes
    return quotes.filter((q) => String(q.status ?? '').toLowerCase() === filterStatus)
  }, [quotes, filterStatus])

  const hasPermission = hasManagePermission(userData, 'can_sales_manage')

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <p className="py-24 text-center text-sm font-bold text-gray-400">데이터 로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10.5rem)] max-w-[1600px] flex-col space-y-6 bg-gray-50 p-6 font-sans">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">견적서 관리</h1>
          <p className="mt-1 text-sm font-bold text-gray-500">전체 견적서 목록을 확인하고 새 견적을 등록합니다.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {hasPermission ? (
            <Link
              href="/quotes/new"
              className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-black bg-blue-600 px-6 text-sm font-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-blue-700 active:translate-y-1 active:shadow-none"
            >
              견적서 등록
            </Link>
          ) : (
            <div className="inline-flex h-12 cursor-not-allowed items-center rounded-xl border-2 border-gray-200 bg-gray-100 px-6 text-sm font-black text-gray-400">
              권한 필요 (영업)
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-500">
        <span className="text-gray-600">
          {filteredQuotes.length}건 표시
          {filterStatus ? ` · 상태 필터 적용` : ''}
        </span>
        <div className="w-full min-w-[12rem] max-w-xs sm:w-56">
          <SearchableCombobox
            value={filterStatus}
            onChange={setFilterStatus}
            options={STATUS_FILTER_OPTIONS}
            placeholder="상태 필터"
            showClearOption={false}
            listMaxHeightClass="max-h-56 overflow-y-auto"
            buttonClassName="text-[11px] font-bold py-2"
            dropdownClassName="text-xs"
            dropdownPlacement="auto"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="min-h-[min(60vh,calc(100dvh-14rem))] overflow-x-auto">
          <table className="min-w-[960px] w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[11rem]" />
              <col className="w-[7rem]" />
              <col />
              <col className="w-[7rem]" />
              <col className="w-[9.5rem]" />
              <col className="w-[8.5rem]" />
              <col className="w-[12rem]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b-2 border-black bg-gray-50 text-left text-xs font-black uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-4">견적번호</th>
                <th className="px-3 py-4">견적일</th>
                <th className="px-4 py-4">거래처</th>
                <th className="px-3 py-4">작성자</th>
                <th className="px-3 py-4 text-center">상태</th>
                <th className="px-3 py-4 text-right">총금액</th>
                <th className="px-4 py-4">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-sm font-bold text-gray-400">
                    표시할 견적이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredQuotes.map((quote) => {
                  const st = getQuoteStatusUnifiedBadge(quote.status)
                  return (
                    <tr key={quote.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-4 font-black">
                        <Link href={`/quotes/${quote.id}`} className="text-blue-600 hover:underline" title={quote.quote_no}>
                          {quote.quote_no}
                        </Link>
                      </td>
                      <td className="px-3 py-4 text-xs font-bold text-gray-600">{quote.quote_date}</td>
                      <td className="px-4 py-4">
                        <span className="block min-w-0 truncate font-bold text-gray-800" title={quote.customers?.customer_name}>
                          {quote.customers?.customer_name || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <span className="block min-w-0 truncate text-xs font-bold text-gray-600" title={quote.app_users?.user_name}>
                          {quote.app_users?.user_name || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center">
                        <span className={st.className}>{st.label}</span>
                      </td>
                      <td className="px-3 py-4 text-right font-black text-gray-900">
                        {quote.total_amount != null ? Number(quote.total_amount).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-4">
                        <span className="block min-w-0 truncate text-xs font-bold text-gray-500" title={quote.remarks}>
                          {quote.remarks?.trim() ? quote.remarks : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
