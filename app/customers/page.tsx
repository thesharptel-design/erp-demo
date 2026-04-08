import { supabase } from '@/lib/supabase'
import Link from 'next/link'

async function getCustomers() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, customer_code, customer_name, customer_type, ceo_name, phone, is_active')
    .order('id', { ascending: true })

  if (error) {
    console.error(error.message)
    return []
  }

  return data ?? []
}

export default async function CustomersPage() {
  const customers = await getCustomers()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">거래처관리</h1>
          <p className="mt-1 text-gray-600">거래처 목록을 조회합니다.</p>
        </div>
        <Link href="/customers/new" className="rounded -xl bg-black px-4 py-2 text-sm font-medium text-white">
        거래처 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">거래처코드</th>
              <th className="px-4 py-3">거래처명</th>
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">대표자명</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">사용여부</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <Link href={`/customers/${customer.id}`} className="text-blue-600 hover:underline">
                      {customer.customer_code}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/customers/${customer.id}`} className="text-blue-600 hover:underline">
                      {customer.customer_code}
                  </Link>
                </td>              
                <td className="px-4 py-3">{customer.customer_type}</td>
                <td className="px-4 py-3">{customer.ceo_name}</td>
                <td className="px-4 py-3">{customer.phone}</td>
                <td className="px-4 py-3">
                  {customer.is_active ? '사용' : '미사용'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}