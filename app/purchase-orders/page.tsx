import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ProtectedCreateButton from '@/components/ProtectedCreateButton'

type PurchaseOrderRow = {
  id: number
  po_no: string
  po_date: string
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

async function getPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_no,
      po_date,
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
    console.error('purchase_orders error:', error.message)
    return []
  }

  return ((data ?? []) as unknown[]) as PurchaseOrderRow[]
}

function getCustomerName(
  customers: PurchaseOrderRow['customers']
) {
  if (!customers) return '-'
  if (Array.isArray(customers)) {
    return customers[0]?.customer_name ?? '-'
  }
  return customers.customer_name ?? '-'
}

function getUserName(
  appUsers: PurchaseOrderRow['app_users']
) {
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
    case 'ordered':
      return '발주완료'
    case 'received':
      return '입고완료'
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
    case 'ordered':
      return 'erp-badge erp-badge-progress'
    case 'received':
      return 'erp-badge erp-badge-done'
    case 'cancelled':
      return 'erp-badge erp-badge-danger'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

export default async function PurchaseOrdersPage() {
  const purchaseOrders = await getPurchaseOrders()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">발주서관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            발주서 목록을 조회하고 입고 진행 상태를 확인합니다.
          </p>
        </div>

        <ProtectedCreateButton
          href="/purchase-orders/new"
          label="발주서 등록"
          permissionKey="can_po_create"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-4">발주번호</th>
              <th className="px-5 py-4">발주일</th>
              <th className="px-5 py-4">공급처</th>
              <th className="px-5 py-4">작성자</th>
              <th className="px-5 py-4">상태</th>
              <th className="px-5 py-4">총금액</th>
              <th className="px-5 py-4">비고</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400">
                  발주서 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              purchaseOrders.map((purchaseOrder) => (
                <tr key={purchaseOrder.id} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/purchase-orders/${purchaseOrder.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {purchaseOrder.po_no}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{purchaseOrder.po_date}</td>
                  <td className="px-5 py-4">
                    {getCustomerName(purchaseOrder.customers)}
                  </td>
                  <td className="px-5 py-4">
                    {getUserName(purchaseOrder.app_users)}
                  </td>
                  <td className="px-5 py-4">
                    <span className={getStatusStyle(purchaseOrder.status)}>
                      {getStatusLabel(purchaseOrder.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {purchaseOrder.total_amount.toLocaleString()}
                  </td>
                  <td className="px-5 py-4">{purchaseOrder.remarks ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}