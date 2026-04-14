import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type InventoryTransactionRow = {
  id: number
  trans_date: string
  trans_type: string
  item_id: number
  qty: number
  ref_table: string | null
  ref_id: number | null
  remarks: string | null
  created_by: string | null
  created_at: string
}

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  item_type: string
  unit: string
}

async function getInventoryTransactionPageData() {
  const [
    { data: transactionData, error: transactionError },
    { data: itemsData, error: itemsError },
  ] = await Promise.all([
    supabase
      .from('inventory_transactions')
      .select(
        'id, trans_date, trans_type, item_id, qty, ref_table, ref_id, remarks, created_by, created_at'
      )
      .order('id', { ascending: false }),
    supabase
      .from('items')
      .select('id, item_code, item_name, item_type, unit')
      .order('id'),
  ])

  if (transactionError) {
    console.error('inventory_transactions error:', transactionError.message)
    return {
      transactions: [],
      items: [],
    }
  }

  if (itemsError) {
    console.error('items error:', itemsError.message)
    return {
      transactions: [],
      items: [],
    }
  }

  return {
    transactions: (transactionData as InventoryTransactionRow[]) ?? [],
    items: (itemsData as ItemRow[]) ?? [],
  }
}

function getItemTypeLabel(itemType: string) {
  switch (itemType) {
    case 'finished':
      return '완제품'
    case 'raw_material':
      return '원재료'
    case 'sub_material':
      return '부자재'
    default:
      return itemType
  }
}

function getTransTypeLabel(transType: string) {
  switch (transType) {
    case 'IN':
      return '입고(격리적치)'
    case 'OUT':
      return '출고'
    case 'PROD_IN':
      return '생산입고'
    case 'MATL_OUT':
      return '자재출고'
    case 'ADJUST':
      return '재고조정'
    case 'QC_RELEASE':
      return 'QC합격해제'
    default:
      return transType
  }
}

function getTransTypeStyle(transType: string) {
  switch (transType) {
    case 'IN':
      return 'erp-badge erp-badge-progress'
    case 'OUT':
      return 'erp-badge erp-badge-danger'
    case 'PROD_IN':
      return 'erp-badge erp-badge-done'
    case 'MATL_OUT':
      return 'erp-badge erp-badge-warning'
    case 'ADJUST':
      return 'erp-badge erp-badge-draft'
    case 'QC_RELEASE':
      return 'erp-badge erp-badge-review'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

function getRefLabel(refTable: string | null, refId: number | null) {
  if (!refTable || !refId) return '-'

  if (refTable === 'purchase_orders') {
    return `발주서 / ${refId}`
  }

  if (refTable === 'production_orders') {
    return `생산지시 / ${refId}`
  }

  if (refTable === 'qc_requests') {
    return `QC / ${refId}`
  }

  return `${refTable} / ${refId}`
}

function getQtyDisplay(transType: string, qty: number) {
  if (transType === 'OUT' || transType === 'MATL_OUT') {
    return `-${qty}`
  }

  return `+${qty}`
}

export default async function InventoryTransactionsPage() {
  const { transactions, items } = await getInventoryTransactionPageData()

  const itemMap = new Map(items.map((item) => [item.id, item]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">재고이력</h1>
        <p className="mt-1 text-sm text-gray-500">
          품목별 입고, 자재출고, 생산입고, QC 합격 해제 등 재고 변동 이력을 조회합니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-4">일시</th>
                <th className="px-5 py-4">품목코드</th>
                <th className="px-5 py-4">품목명</th>
                <th className="px-5 py-4">유형</th>
                <th className="px-5 py-4">변동구분</th>
                <th className="px-5 py-4">수량</th>
                <th className="px-5 py-4">단위</th>
                <th className="px-5 py-4">참조문서</th>
                <th className="px-5 py-4">비고</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-14 text-center text-sm text-gray-400">
                    재고이력 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const item = itemMap.get(tx.item_id)

                  return (
                    <tr key={tx.id} className="border-t border-gray-100">
                      <td className="px-5 py-4">
                        {new Date(tx.trans_date).toLocaleString('ko-KR')}
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href={`/items/${tx.item_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {item?.item_code ?? '-'}
                        </Link>
                      </td>
                      <td className="px-5 py-4 font-medium">
                        <Link
                          href={`/items/${tx.item_id}`}
                          className="hover:underline"
                        >
                          {item?.item_name ?? '-'}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        {item ? getItemTypeLabel(item.item_type) : '-'}
                      </td>
                      <td className="px-5 py-4">
                        <span className={getTransTypeStyle(tx.trans_type)}>
                          {getTransTypeLabel(tx.trans_type)}
                        </span>
                      </td>
                      <td className="px-5 py-4">{getQtyDisplay(tx.trans_type, tx.qty)}</td>
                      <td className="px-5 py-4">{item?.unit ?? '-'}</td>
                      <td className="px-5 py-4">{getRefLabel(tx.ref_table, tx.ref_id)}</td>
                      <td className="px-5 py-4 whitespace-pre-wrap">
                        {tx.remarks ?? '-'}
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