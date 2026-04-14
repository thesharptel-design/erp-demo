'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedCreateButton from '@/components/ProtectedCreateButton'

type ProductionOrderRow = {
  id: number
  prod_no: string
  prod_date: string
  item_id: number
  plan_qty: number
  completed_qty: number
  status: string
  remarks: string | null
  inbound_completed: boolean
}

type ItemRow = {
  id: number
  item_code: string
  item_name: string
}

type QcRequestRow = {
  id: number
  production_order_id: number | null
  qc_no: string
  qc_type: 'raw_material' | 'sample' | 'final_product'
  qc_status: 'requested' | 'received' | 'testing' | 'pass' | 'fail' | 'hold'
  result_status?: 'pending' | 'pass' | 'fail'
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

function getQcTypeLabel(qcType: string) {
  switch (qcType) {
    case 'raw_material':
      return '원자재 QC'
    case 'sample':
      return '샘플 QC'
    case 'final_product':
      return '완제품 QC'
    default:
      return qcType
  }
}

function getQcStatusLabel(status: string) {
  switch (status) {
    case 'requested':
      return '의뢰됨'
    case 'received':
      return '접수됨'
    case 'testing':
      return '시험중'
    case 'pass':
      return '합격'
    case 'fail':
      return '불합격'
    case 'hold':
      return '보류'
    default:
      return status
  }
}

function getQcStatusStyle(status: string) {
  switch (status) {
    case 'requested':
      return 'erp-badge erp-badge-draft'
    case 'received':
      return 'erp-badge erp-badge-review'
    case 'testing':
      return 'erp-badge erp-badge-progress'
    case 'pass':
      return 'erp-badge erp-badge-done'
    case 'fail':
      return 'erp-badge erp-badge-danger'
    case 'hold':
      return 'erp-badge erp-badge-warning'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

function getInboundLabel(inboundCompleted: boolean) {
  return inboundCompleted ? '입고완료' : '미입고'
}

function getInboundStyle(inboundCompleted: boolean) {
  return inboundCompleted
    ? 'erp-badge erp-badge-done'
    : 'erp-badge erp-badge-draft'
}

function getQcDisplayText(qc?: QcRequestRow) {
  if (!qc) return '미의뢰'
  return `${getQcTypeLabel(qc.qc_type)} / ${getQcStatusLabel(qc.qc_status)}`
}

export default function ProductionOrdersPage() {
  const [productionOrders, setProductionOrders] = useState<ProductionOrderRow[]>([])
  const [itemsMap, setItemsMap] = useState<Map<number, string>>(new Map())
  const [qcMap, setQcMap] = useState<Map<number, QcRequestRow>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        setErrorMessage('')
        setIsLoading(true)

        const [
          { data: ordersData, error: ordersError },
          { data: itemsData, error: itemsError },
          { data: qcData, error: qcError },
        ] = await Promise.all([
          supabase
            .from('production_orders')
            .select(`
              id,
              prod_no,
              prod_date,
              item_id,
              plan_qty,
              completed_qty,
              status,
              remarks,
              inbound_completed
            `)
            .order('id', { ascending: false }),

          supabase
            .from('items')
            .select('id, item_code, item_name'),

          supabase
            .from('qc_requests')
            .select('id, production_order_id, qc_no, qc_type, qc_status, result_status')
            .not('production_order_id', 'is', null)
            .order('id', { ascending: false }),
        ])

        if (ordersError || itemsError || qcError) {
          console.error('production orders page load error:', {
            ordersError,
            itemsError,
            qcError,
          })
          setErrorMessage('생산지시 데이터를 불러오지 못했습니다.')
          setIsLoading(false)
          return
        }

        const orderRows = (ordersData as ProductionOrderRow[]) ?? []
        const itemRows = (itemsData as ItemRow[]) ?? []
        const qcRows = (qcData as QcRequestRow[]) ?? []

        const nextItemsMap = new Map<number, string>(
          itemRows.map((row) => [row.id, `${row.item_code} / ${row.item_name}`])
        )

        const nextQcMap = new Map<number, QcRequestRow>()
        for (const row of qcRows) {
          if (!row.production_order_id) continue
          if (!nextQcMap.has(row.production_order_id)) {
            nextQcMap.set(row.production_order_id, row)
          }
        }

        setProductionOrders(orderRows)
        setItemsMap(nextItemsMap)
        setQcMap(nextQcMap)
      } catch (error) {
        console.error('production orders page unexpected error:', error)
        setErrorMessage('생산지시 데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  const rows = useMemo(() => {
    return productionOrders.map((order) => {
      const qc = qcMap.get(order.id)

      return {
        ...order,
        itemLabel: itemsMap.get(order.item_id) ?? '-',
        qc,
      }
    })
  }, [productionOrders, itemsMap, qcMap])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">생산지시관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            생산지시, 완제품 QC 진행 상태, 입고 상태를 통합 조회합니다.
          </p>
        </div>

        <ProtectedCreateButton
          href="/production-orders/new"
          label="생산지시 등록"
          permissionKey="can_prod_complete"
        />
      </div>

      {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-4">생산지시번호</th>
                <th className="px-5 py-4">생산일</th>
                <th className="px-5 py-4">완제품</th>
                <th className="px-5 py-4">계획수량</th>
                <th className="px-5 py-4">완료수량</th>
                <th className="px-5 py-4">생산상태</th>
                <th className="px-5 py-4">QC유형</th>
                <th className="px-5 py-4">QC상태</th>
                <th className="px-5 py-4">입고상태</th>
                <th className="px-5 py-4">비고</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-14 text-center text-sm text-gray-400">
                    생산지시 데이터를 불러오는 중입니다.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-14 text-center text-sm text-gray-400">
                    생산지시 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-5 py-4 font-medium">
                      <Link
                        href={`/production-orders/${row.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {row.prod_no}
                      </Link>
                    </td>
                    <td className="px-5 py-4">{row.prod_date}</td>
                    <td className="px-5 py-4">{row.itemLabel}</td>
                    <td className="px-5 py-4">{row.plan_qty}</td>
                    <td className="px-5 py-4">{row.completed_qty}</td>
                    <td className="px-5 py-4">
                      <span className={getProductionStatusStyle(row.status)}>
                        {getProductionStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {row.qc ? getQcTypeLabel(row.qc.qc_type) : '-'}
                    </td>
                    <td className="px-5 py-4">
                      {row.qc ? (
                        <span className={getQcStatusStyle(row.qc.qc_status)}>
                          {getQcStatusLabel(row.qc.qc_status)}
                        </span>
                      ) : (
                        <span className="erp-badge erp-badge-draft">미의뢰</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={getInboundStyle(row.inbound_completed)}>
                        {getInboundLabel(row.inbound_completed)}
                      </span>
                    </td>
                    <td className="px-5 py-4">{row.remarks ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}