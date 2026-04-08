'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type QcRequestRow = {
  id: number
  qc_no: string
  production_order_id: number
  item_id: number
  request_date: string
  result_status: 'pending' | 'pass' | 'fail'
  result_comment: string | null
  result_date: string | null
  created_at: string
}

type ProductionOrderRow = {
  id: number
  prod_no: string
}

type ItemRow = {
  id: number
  item_code: string
  item_name: string
}

function getQcStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '검사대기'
    case 'pass':
      return '합격'
    case 'fail':
      return '불합격'
    default:
      return status
  }
}

function getQcStatusStyle(status: string) {
  switch (status) {
    case 'pending':
      return 'erp-badge erp-badge-review'
    case 'pass':
      return 'erp-badge erp-badge-done'
    case 'fail':
      return 'erp-badge erp-badge-danger'
    default:
      return 'erp-badge erp-badge-draft'
  }
}

export default function QcPage() {
  const [qcRequests, setQcRequests] = useState<QcRequestRow[]>([])
  const [productionOrdersMap, setProductionOrdersMap] = useState<Map<number, string>>(new Map())
  const [itemsMap, setItemsMap] = useState<Map<number, string>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      setErrorMessage('')

      const [
        { data: qcData, error: qcError },
        { data: productionData, error: productionError },
        { data: itemData, error: itemError },
      ] = await Promise.all([
        supabase
          .from('qc_requests')
          .select(`
            id,
            qc_no,
            production_order_id,
            item_id,
            request_date,
            result_status,
            result_comment,
            result_date,
            created_at
          `)
          .order('id', { ascending: false }),

        supabase
          .from('production_orders')
          .select('id, prod_no'),

        supabase
          .from('items')
          .select('id, item_code, item_name'),
      ])

      if (qcError || productionError || itemError) {
        console.error('qc page load error:', {
          qcError,
          productionError,
          itemError,
        })
        setErrorMessage('QC 데이터를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const qcRows = ((qcData ?? []) as unknown[]) as QcRequestRow[]
      const productionRows = ((productionData ?? []) as unknown[]) as ProductionOrderRow[]
      const itemRows = ((itemData ?? []) as unknown[]) as ItemRow[]

      setQcRequests(qcRows)
      setProductionOrdersMap(new Map(productionRows.map((row) => [row.id, row.prod_no])))
      setItemsMap(
        new Map(itemRows.map((row) => [row.id, `${row.item_code} / ${row.item_name}`]))
      )
      setIsLoading(false)
    }

    loadData()
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">QC관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          생산지시에서 넘어온 샘플 QC 요청을 조회하고 결과를 관리합니다.
        </p>
      </div>

      {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-4">QC번호</th>
              <th className="px-5 py-4">생산지시번호</th>
              <th className="px-5 py-4">품목</th>
              <th className="px-5 py-4">의뢰일</th>
              <th className="px-5 py-4">상태</th>
              <th className="px-5 py-4">결과일</th>
              <th className="px-5 py-4">비고</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400">
                  QC 요청 데이터를 불러오는 중입니다.
                </td>
              </tr>
            ) : qcRequests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400">
                  QC 요청 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              qcRequests.map((qc) => (
                <tr key={qc.id} className="border-t border-gray-100">
                  <td className="px-5 py-4 font-medium">
                    <Link
                      href={`/qc/${qc.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {qc.qc_no}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    {productionOrdersMap.get(qc.production_order_id) ?? '-'}
                  </td>
                  <td className="px-5 py-4">
                    {itemsMap.get(qc.item_id) ?? '-'}
                  </td>
                  <td className="px-5 py-4">{qc.request_date}</td>
                  <td className="px-5 py-4">
                    <span className={getQcStatusStyle(qc.result_status)}>
                      {getQcStatusLabel(qc.result_status)}
                    </span>
                  </td>
                  <td className="px-5 py-4">{qc.result_date ?? '-'}</td>
                  <td className="px-5 py-4">{qc.result_comment ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}