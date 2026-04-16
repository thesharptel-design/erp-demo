import { supabase } from '@/lib/supabase'
import Link from 'next/link'

async function getCustomers() {
  // 모든 컬럼을 가져오되, id 순으로 정렬합니다.
  const { data, error } = await supabase
    .from('customers')
    .select('*')
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
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-gray-900">고객사(거래처) 관리</h1>
          <p className="mt-1 text-gray-500 font-bold">고객사 코드, 대표자, 사업자번호 등 핵심 정보를 관리합니다.</p>
        </div>
        <Link href="/customers/new" className="rounded-xl bg-black px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-gray-800 transition-colors">
            고객사 신규 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-black uppercase tracking-tight">코드</th>
              <th className="px-6 py-4 font-black uppercase tracking-tight">고객사명</th>
              <th className="px-6 py-4 font-black uppercase tracking-tight">대표자</th>
              <th className="px-6 py-4 font-black uppercase tracking-tight">사업자번호</th>
              <th className="px-6 py-4 font-black uppercase tracking-tight">주소</th>
              <th className="px-6 py-4 font-black uppercase tracking-tight text-center">상태</th>
              <th className="px-6 py-4 font-black uppercase tracking-tight text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                {/* 1. 고객사 코드 */}
                <td className="px-6 py-4 font-bold text-blue-600">{c.customer_code}</td>
                
                {/* 2. 고객사명 */}
                <td className="px-6 py-4 font-black text-gray-800 text-base">{c.customer_name}</td>
                
                {/* 3. 대표자명 */}
                <td className="px-6 py-4 font-bold text-gray-700">{c.ceo_name || '-'}</td>
                
                {/* 4. 사업자번호 */}
                <td className="px-6 py-4 font-medium text-gray-600">{c.business_no || '-'}</td>
                
                {/* 5. 주소 */}
                <td className="px-6 py-4 text-gray-500 truncate max-w-[200px]" title={c.address}>
                  {c.address || '-'}
                </td>
                
                {/* 6. 상태 */}
                <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-[11px] font-black rounded-md ${c.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                        {c.is_active ? '거래중' : '중단'}
                    </span>
                </td>
                
                {/* 7. 관리 버튼 */}
                <td className="px-6 py-4 text-center">
                    <Link href={`/customers/${c.id}`} className="text-blue-600 font-black hover:underline text-xs">
                        정보 수정
                    </Link>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={7} className="p-10 text-center font-bold text-gray-400">등록된 고객사가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}