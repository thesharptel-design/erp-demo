import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type InventoryRow = {
  id: number
  item_id: number
  current_qty: number
}

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  item_type: string
  unit: string
  safety_stock_qty: number
  is_active: boolean
}

async function getInventoryPageData() {
  const [
    { data: inventoryData, error: inventoryError },
    { data: itemsData, error: itemsError },
  ] = await Promise.all([
    supabase
      .from('inventory')
      .select('id, item_id, current_qty')
      .order('item_id'),
    supabase
      .from('items')
      .select('id, item_code, item_name, item_type, unit, safety_stock_qty, is_active')
      .order('id'),
  ])

  if (inventoryError) {
    console.error('inventory error:', inventoryError.message)
  }

  if (itemsError) {
    console.error('items error:', itemsError.message)
  }

  return {
    inventory: (inventoryData as InventoryRow[]) ?? [],
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

function getStockStatus(currentQty: number, safetyStockQty: number) {
  if (currentQty <= 0) {
    return {
      label: '재고없음',
      className: 'erp-badge erp-badge-danger',
    }
  }

  if (currentQty < safetyStockQty) {
    return {
      label: '부족',
      className: 'erp-badge erp-badge-warning',
    }
  }

  return {
    label: '정상',
    className: 'erp-badge erp-badge-done',
  }
}

export default async function InventoryPage() {
  const { inventory, items } = await getInventoryPageData()

  const inventoryMap = new Map(
    inventory.map((row) => [row.item_id, row.current_qty])
  )

  const rows = items.map((item) => {
    const currentQty = inventoryMap.get(item.id) ?? 0
    const stockStatus = getStockStatus(currentQty, item.safety_stock_qty ?? 0)

    return {
      ...item,
      currentQty,
      stockStatus,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">재고조회</h1>
        <p className="mt-1 text-sm text-gray-500">
          품목별 현재고와 안전재고를 확인합니다.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-4">품목코드</th>
              <th className="px-5 py-4">품목명</th>
              <th className="px-5 py-4">유형</th>
              <th className="px-5 py-4">단위</th>
              <th className="px-5 py-4">현재고</th>
              <th className="px-5 py-4">안전재고</th>
              <th className="px-5 py-4">재고상태</th>
              <th className="px-5 py-4">사용여부</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-14 text-center text-sm text-gray-400">
                  재고 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-5 py-4">
                    <Link
                      href={`/items/${row.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {row.item_code}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/items/${row.id}`}
                      className="hover:underline"
                    >
                      {row.item_name}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{getItemTypeLabel(row.item_type)}</td>
                  <td className="px-5 py-4">{row.unit}</td>
                  <td className="px-5 py-4">{row.currentQty}</td>
                  <td className="px-5 py-4">{row.safety_stock_qty}</td>
                  <td className="px-5 py-4">
                    <span className={row.stockStatus.className}>
                      {row.stockStatus.label}
                    </span>
                  </td>
                  <td className="px-5 py-4">{row.is_active ? '사용' : '미사용'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}