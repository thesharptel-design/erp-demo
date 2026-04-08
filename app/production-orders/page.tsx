import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type ProductionOrderRow = {
  id: number
  prod_no: string
  prod_date: string
  plan_qty: number
  completed_qty: number
  status: string
  remarks: string | null
  items: {
    item_name: string
  } | null
  app_users: {
    user_name: string
  } | null
}

async function getProductionOrders() {
  const { data, error } = await supabase
    .from('production_orders')
    .select(`
      id,
      prod_no,
      prod_date,
      plan_qty,
      completed_qty,
      status,
      remarks,
      items:item_id (
        item_name
      ),
      app_users:user_id (
        user_name
      )
    `)
    .order('id', { ascending: false })

  if (error) {
    console.error('production_orders error:', error.message)
    return []
  }

  return (data as unknown as ProductionOrderRow[]) ?? []
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'planned':
      return '생산예정'
    case 'in_progress':
      return '생산중'
    case 'completed':
      return '생산완료'
    default:
      return status
  }
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'planned':
      return 'erp-badge erp-badge-draft'
    case 'in_progress':
      return 'erp-badge erp-badge-progress'
    case 'completed':
      return 'erp-badge erp-badge-done'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

export default async function ProductionOrdersPage() {
  const productionOrders = await getProductionOrders()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">생산지시관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            생산지시 목록과 진행 상태를 조회합니다.
          </p>
        </div>

        <Link
          href="/production-orders/new"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white"
        >
          생산지시 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-4">생산지시번호</th>
              <th className="px-5 py-4">생산일</th>
              <th className="px-5 py-4">완제품</th>
              <th className="px-5 py-4">계획수량</th>
              <th className="px-5 py-4">완료수량</th>
              <th className="px-5 py-4">작성자</th>
              <th className="px-5 py-4">상태</th>
              <th className="px-5 py-4">비고</th>
            </tr>
          </thead>
          <tbody>
            {productionOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center text-sm text-gray-400">
                  생산지시 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              productionOrders.map((order) => (
                <tr key={order.id} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/production-orders/${order.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {order.prod_no}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{order.prod_date}</td>
                  <td className="px-5 py-4">{order.items?.item_name ?? '-'}</td>
                  <td className="px-5 py-4">{order.plan_qty}</td>
                  <td className="px-5 py-4">{order.completed_qty}</td>
                  <td className="px-5 py-4">{order.app_users?.user_name ?? '-'}</td>
                  <td className="px-5 py-4">
                    <span className={getStatusStyle(order.status)}>
                      {getStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4">{order.remarks ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}