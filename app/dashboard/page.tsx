import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  safety_stock_qty: number
}

type InventoryRow = {
  item_id: number
  current_qty: number
}

type ApprovalDocRow = {
  id: number
  doc_no: string
  title: string
  status: string
  drafted_at: string
}

type ProductionOrderRow = {
  id: number
  prod_no: string
  status: string
  prod_date: string
  items: {
    item_name: string
  } | null
}

type PurchaseOrderRow = {
  id: number
  po_no: string
  status: string
  po_date: string
  remarks: string | null
  customers: {
    customer_name: string
  } | null
}

type InventoryTransactionRow = {
  id: number
  trans_type: string
  trans_date: string
}

async function getDashboardData() {
  const [
    { data: itemsData, error: itemsError },
    { data: inventoryData, error: inventoryError },
    { data: approvalsData, error: approvalsError },
    { data: productionOrdersData, error: productionOrdersError },
    { data: purchaseOrdersData, error: purchaseOrdersError },
    { data: inventoryTransactionsData, error: inventoryTransactionsError },
  ] = await Promise.all([
    supabase
      .from('items')
      .select('id, item_code, item_name, safety_stock_qty')
      .eq('is_active', true),
    supabase
      .from('inventory')
      .select('item_id, current_qty'),
    supabase
      .from('approval_docs')
      .select('id, doc_no, title, status, drafted_at')
      .order('id', { ascending: false }),
    supabase
      .from('production_orders')
      .select(`
        id,
        prod_no,
        status,
        prod_date,
        items:item_id (
          item_name
        )
      `)
      .order('id', { ascending: false }),
    supabase
      .from('purchase_orders')
      .select(`
        id,
        po_no,
        status,
        po_date,
        remarks,
        customers:customer_id (
          customer_name
        )
      `)
      .order('id', { ascending: false }),
    supabase
      .from('inventory_transactions')
      .select('id, trans_type, trans_date')
      .order('id', { ascending: false }),
  ])

  if (itemsError) console.error('items error:', itemsError.message)
  if (inventoryError) console.error('inventory error:', inventoryError.message)
  if (approvalsError) console.error('approval_docs error:', approvalsError.message)
  if (productionOrdersError) console.error('production_orders error:', productionOrdersError.message)
  if (purchaseOrdersError) console.error('purchase_orders error:', purchaseOrdersError.message)
  if (inventoryTransactionsError) console.error('inventory_transactions error:', inventoryTransactionsError.message)

  return {
    items: (itemsData as ItemRow[]) ?? [],
    inventory: (inventoryData as InventoryRow[]) ?? [],
    approvals: (approvalsData as ApprovalDocRow[]) ?? [],
    productionOrders: (productionOrdersData as unknown as ProductionOrderRow[]) ?? [],
    purchaseOrders: (purchaseOrdersData as unknown as PurchaseOrderRow[]) ?? [],
    inventoryTransactions: (inventoryTransactionsData as InventoryTransactionRow[]) ?? [],
  }
}

function getApprovalStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return '임시저장'
    case 'submitted':
      return '상신'
    case 'in_review':
      return '결재중'
    case 'approved':
      return '승인'
    case 'rejected':
      return '반려'
    default:
      return status
  }
}

function getApprovalStatusStyle(status: string) {
  switch (status) {
    case 'draft':
      return 'erp-badge erp-badge-draft'
    case 'submitted':
      return 'erp-badge erp-badge-progress'
    case 'in_review':
      return 'erp-badge erp-badge-review'
    case 'approved':
      return 'erp-badge erp-badge-done'
    case 'rejected':
      return 'erp-badge erp-badge-danger'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

function getProductionStatusLabel(status: string) {
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

function getProductionStatusStyle(status: string) {
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

function getPurchaseStatusLabel(status: string) {
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

function getPurchaseStatusStyle(status: string) {
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

export default async function DashboardPage() {
  const {
    items,
    inventory,
    approvals,
    productionOrders,
    purchaseOrders,
    inventoryTransactions,
  } = await getDashboardData()

  const inventoryMap = new Map(
    inventory.map((row) => [row.item_id, row.current_qty])
  )

  const shortageCount = items.filter((item) => {
    const currentQty = inventoryMap.get(item.id) ?? 0
    return currentQty < (item.safety_stock_qty ?? 0)
  }).length

  const pendingApprovalCount = approvals.filter((doc) =>
    ['submitted', 'in_review'].includes(doc.status)
  ).length

  const plannedProductionCount = productionOrders.filter((order) =>
    ['planned', 'in_progress'].includes(order.status)
  ).length

  const today = new Date().toISOString().slice(0, 10)

  const todayInboundCount = inventoryTransactions.filter((tx) => {
    const txDate = tx.trans_date.slice(0, 10)
    return txDate === today && ['IN', 'PROD_IN'].includes(tx.trans_type)
  }).length

  const recentApprovals = approvals.slice(0, 5)
  const recentProductionOrders = productionOrders.slice(0, 5)
  const recentPurchaseOrders = purchaseOrders.slice(0, 5)

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">대시보드</h1>
          <p className="erp-page-desc">
            주요 업무 현황과 최근 처리 내역을 한눈에 확인합니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="erp-card p-5">
          <p className="text-sm font-medium text-gray-500">부족재고 품목</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
            {shortageCount}
          </p>
          <p className="mt-2 text-sm text-gray-500">안전재고 미만 품목 수</p>
        </div>

        <div className="erp-card p-5">
          <p className="text-sm font-medium text-gray-500">미결재 문서</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
            {pendingApprovalCount}
          </p>
          <p className="mt-2 text-sm text-gray-500">상신 / 결재중 문서 수</p>
        </div>

        <div className="erp-card p-5">
          <p className="text-sm font-medium text-gray-500">생산대기 건수</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
            {plannedProductionCount}
          </p>
          <p className="mt-2 text-sm text-gray-500">생산예정 / 생산중 건수</p>
        </div>

        <div className="erp-card p-5">
          <p className="text-sm font-medium text-gray-500">금일 입고 건수</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
            {todayInboundCount}
          </p>
          <p className="mt-2 text-sm text-gray-500">입고 / 생산입고 기준</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="erp-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">최근 발주</h2>
            <Link href="/purchase-orders" className="text-sm text-blue-600 hover:underline">
              전체보기
            </Link>
          </div>

          <div className="space-y-3">
            {recentPurchaseOrders.length === 0 ? (
              <p className="text-sm text-gray-400">최근 발주 데이터가 없습니다.</p>
            ) : (
              recentPurchaseOrders.map((po) => (
                <Link
                  key={po.id}
                  href={`/purchase-orders/${po.id}`}
                  className="block rounded-xl border border-gray-200 px-4 py-4 transition hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{po.po_no}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {po.customers?.customer_name ?? '-'} / {po.po_date}
                      </p>
                    </div>
                    <span className={getPurchaseStatusStyle(po.status)}>
                      {getPurchaseStatusLabel(po.status)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="erp-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">최근 생산지시</h2>
            <Link href="/production-orders" className="text-sm text-blue-600 hover:underline">
              전체보기
            </Link>
          </div>

          <div className="space-y-3">
            {recentProductionOrders.length === 0 ? (
              <p className="text-sm text-gray-400">최근 생산지시 데이터가 없습니다.</p>
            ) : (
              recentProductionOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/production-orders/${order.id}`}
                  className="block rounded-xl border border-gray-200 px-4 py-4 transition hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{order.prod_no}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {order.items?.item_name ?? '-'} / {order.prod_date}
                      </p>
                    </div>
                    <span className={getProductionStatusStyle(order.status)}>
                      {getProductionStatusLabel(order.status)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="erp-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">최근 결재문서</h2>
            <Link href="/approvals" className="text-sm text-blue-600 hover:underline">
              전체보기
            </Link>
          </div>

          <div className="space-y-3">
            {recentApprovals.length === 0 ? (
              <p className="text-sm text-gray-400">최근 결재문서가 없습니다.</p>
            ) : (
              recentApprovals.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/approvals/${doc.id}`}
                  className="block rounded-xl border border-gray-200 px-4 py-4 transition hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{doc.doc_no}</p>
                      <p className="mt-1 truncate text-sm text-gray-500">{doc.title}</p>
                    </div>
                    <span className={getApprovalStatusStyle(doc.status)}>
                      {getApprovalStatusLabel(doc.status)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="erp-card">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">빠른 이동</h2>
          <p className="mt-1 text-sm text-gray-500">
            주요 메뉴로 바로 이동합니다.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Link href="/customers" className="erp-btn-secondary w-full">
            거래처관리
          </Link>
          <Link href="/items" className="erp-btn-secondary w-full">
            품목관리
          </Link>
          <Link href="/quotes" className="erp-btn-secondary w-full">
            견적서관리
          </Link>
          <Link href="/purchase-orders" className="erp-btn-secondary w-full">
            발주서관리
          </Link>
          <Link href="/production-orders" className="erp-btn-secondary w-full">
            생산지시관리
          </Link>
          <Link href="/inventory" className="erp-btn-secondary w-full">
            재고조회
          </Link>
          <Link href="/inventory-transactions" className="erp-btn-secondary w-full">
            재고이력
          </Link>
          <Link href="/approvals" className="erp-btn-secondary w-full">
            기안/결재
          </Link>
        </div>
      </div>
    </div>
  )
}