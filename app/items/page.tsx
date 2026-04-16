import { supabase } from '@/lib/supabase'
import Link from 'next/link'

async function getItems() {
  // 🌟 is_exp_managed를 포함하여 모든 관리 옵션을 가져옵니다.
  const { data, error } = await supabase
    .from('items')
    .select('id, item_code, item_name, item_spec, unit, item_type, safety_stock_qty, is_active, is_lot_managed, is_exp_managed, is_sn_managed')
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
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">품목 관리</h1>
          <p className="mt-1 text-gray-500 font-bold">품목 목록과 추적/이력 관리 여부를 조회 및 수정합니다.</p>
        </div>
        <Link href="/items/new" className="rounded-xl bg-black px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-gray-800 transition-colors">
            품목 신규 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3.5 font-black uppercase tracking-tight">품목코드</th>
              <th className="px-4 py-3.5 font-black uppercase tracking-tight">품목명</th>
              <th className="px-4 py-3.5 font-black text-blue-600 uppercase tracking-tight">추적관리</th>
              <th className="px-4 py-3.5 font-black uppercase tracking-tight">규격 / 단위</th>
              <th className="px-4 py-3.5 font-black uppercase tracking-tight text-center">상태</th>
              <th className="px-4 py-3.5 font-black uppercase tracking-tight text-center">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-bold text-gray-600">{item.item_code}</td>
                <td className="px-4 py-3 font-black text-gray-800">{item.item_name}</td>
                <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {item.is_lot_managed && <span className="px-2 py-0.5 text-[10px] font-black bg-blue-100 text-blue-700 rounded uppercase">LOT</span>}
                      {item.is_exp_managed && <span className="px-2 py-0.5 text-[10px] font-black bg-green-100 text-green-700 rounded uppercase">EXP</span>}
                      {item.is_sn_managed && <span className="px-2 py-0.5 text-[10px] font-black bg-purple-100 text-purple-700 rounded uppercase">S/N</span>}
                      {!item.is_lot_managed && !item.is_exp_managed && !item.is_sn_managed && <span className="text-gray-300 font-bold text-xs">-</span>}
                    </div>
                </td>
                <td className="px-4 py-3 font-medium text-gray-600">{item.item_spec || '-'} / {item.unit || '-'}</td>
                <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-1 text-[11px] font-black rounded-md ${item.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                        {item.is_active ? '사용중' : '중단'}
                    </span>
                </td>
                <td className="px-4 py-3 text-center">
                    <Link href={`/items/${item.id}`} className="text-blue-600 font-black hover:underline text-xs">
                        정보 수정
                    </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}