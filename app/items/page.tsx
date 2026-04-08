import { supabase } from '@/lib/supabase'
import Link from 'next/link'

async function getItems() {
  const { data, error } = await supabase
    .from('items')
    .select(
      'id, item_code, item_name, item_spec, unit, item_type, sales_price, purchase_price, safety_stock_qty, is_active'
    )
    .order('id', { ascending: true })

  if (error) {
    console.error(error.message)
    return []
  }

  return data ?? []
}

export default async function ItemsPage() {
  const items = await getItems()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">품목관리</h1>
          <p className="mt-1 text-gray-600">품목 목록을 조회합니다.</p>
        </div>
        <Link href="/items/new" className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white">
            품목 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">품목코드</th>
              <th className="px-4 py-3">품목명</th>
              <th className="px-4 py-3">규격</th>
              <th className="px-4 py-3">단위</th>
              <th className="px-4 py-3">유형</th>
              <th className="px-4 py-3">판매단가</th>
              <th className="px-4 py-3">구매단가</th>
              <th className="px-4 py-3">안전재고</th>
              <th className="px-4 py-3">사용여부</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="px-4 py-3">
                    <Link href={`/items/${item.id}`} className="text-blue-600 hover:underline">
                        {item.item_code}
                    </Link>
                </td>
                <td className="px-4 py-3 font-medium">
                    <Link href={`/items/${item.id}`} className="hover:underline">
                        {item.item_name}
                    </Link>
                </td>
                <td className="px-4 py-3">{item.item_spec}</td>
                <td className="px-4 py-3">{item.unit}</td>
                <td className="px-4 py-3">{item.item_type}</td>
                <td className="px-4 py-3">{item.sales_price}</td>
                <td className="px-4 py-3">{item.purchase_price}</td>
                <td className="px-4 py-3">{item.safety_stock_qty}</td>
                <td className="px-4 py-3">{item.is_active ? '사용' : '미사용'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}