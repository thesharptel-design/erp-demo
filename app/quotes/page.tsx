import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ProtectedCreateButton from '@/components/ProtectedCreateButton'

type QuoteRow = {
  id: number
  quote_no: string
  quote_date: string
  status: string
  total_amount: number
  remarks: string | null
  customers:
    | {
        customer_name: string
      }
    | {
        customer_name: string
      }[]
    | null
  app_users:
    | {
        user_name: string
      }
    | {
        user_name: string
      }[]
    | null
}

async function getQuotes(): Promise<QuoteRow[]> {
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      id,
      quote_no,
      quote_date,
      status,
      total_amount,
      remarks,
      customers (
        customer_name
      ),
      app_users (
        user_name
      )
    `)
    .order('id', { ascending: false })

  if (error) {
    console.error('quotes error:', error.message)
    return []
  }

  return ((data ?? []) as unknown[]) as QuoteRow[]
}

function getCustomerName(customers: QuoteRow['customers']) {
  if (!customers) return '-'
  if (Array.isArray(customers)) {
    return customers[0]?.customer_name ?? '-'
  }
  return customers.customer_name ?? '-'
}

function getUserName(appUsers: QuoteRow['app_users']) {
  if (!appUsers) return '-'
  if (Array.isArray(appUsers)) {
    return appUsers[0]?.user_name ?? '-'
  }
  return appUsers.user_name ?? '-'
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return '임시저장'
    case 'approved':
      return '확정'
    case 'cancelled':
      return '취소'
    default:
      return status
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'draft':
      return 'erp-badge erp-badge-draft'
    case 'approved':
      return 'erp-badge erp-badge-done'
    case 'cancelled':
      return 'erp-badge erp-badge-danger'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

export default async function QuotesPage() {
  const quotes = await getQuotes()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">견적서관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            견적서 목록을 조회하고 확정 상태를 확인합니다.
          </p>
        </div>

        <ProtectedCreateButton
          href="/quotes/new"
          label="견적서 등록"
          permissionKey="can_quote_create"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-4">견적번호</th>
              <th className="px-5 py-4">견적일</th>
              <th className="px-5 py-4">거래처</th>
              <th className="px-5 py-4">작성자</th>
              <th className="px-5 py-4">상태</th>
              <th className="px-5 py-4">총금액</th>
              <th className="px-5 py-4">비고</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400">
                  견적서 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              quotes.map((quote) => (
                <tr key={quote.id} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {quote.quote_no}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{quote.quote_date}</td>
                  <td className="px-5 py-4">{getCustomerName(quote.customers)}</td>
                  <td className="px-5 py-4">{getUserName(quote.app_users)}</td>
                  <td className="px-5 py-4">
                    <span className={getStatusStyle(quote.status)}>
                      {getStatusLabel(quote.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4">{quote.total_amount.toLocaleString()}</td>
                  <td className="px-5 py-4">{quote.remarks ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}