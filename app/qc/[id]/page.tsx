'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type QcRequest = {
  id: number
  qc_no: string
  production_order_id: number | null
  item_id: number
  request_date: string
  qc_type: 'raw_material' | 'sample' | 'final_product'
  qc_status: 'requested' | 'received' | 'testing' | 'pass' | 'fail' | 'hold'
  result_status: 'pending' | 'pass' | 'fail'
  sample_qty: number | null
  tester_name: string | null
  result_comment: string | null
  result_date: string | null
  source_table: string | null
  source_id: number | null
  stock_released: boolean
}

type ProductionOrder = {
  prod_no: string
}

type Item = {
  item_code: string
  item_name: string
}

type InventoryRow = {
  id: number
  item_id: number
  warehouse_id: number
  current_qty: number
  available_qty: number
  quarantine_qty: number
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

function getSourceLabel(sourceTable: string | null, sourceId: number | null) {
  if (!sourceTable || !sourceId) return '-'

  if (sourceTable === 'production_orders') {
    return `생산지시 / ${sourceId}`
  }

  if (sourceTable === 'purchase_orders') {
    return `발주서 / ${sourceId}`
  }

  return `${sourceTable} / ${sourceId}`
}

function getResultStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '대기'
    case 'pass':
      return '합격'
    case 'fail':
      return '불합격'
    default:
      return status
  }
}

function getStatusButtonClass(
  current: 'requested' | 'received' | 'testing' | 'pass' | 'fail' | 'hold',
  target: 'requested' | 'received' | 'testing' | 'pass' | 'fail' | 'hold'
) {
  const isActive = current === target

  if (target === 'requested') {
    return isActive
      ? 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-300 bg-gray-100 px-4 text-sm font-medium text-gray-800'
      : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
  }

  if (target === 'received') {
    return isActive
      ? 'inline-flex h-11 items-center justify-center rounded-xl border border-yellow-300 bg-yellow-100 px-4 text-sm font-medium text-yellow-800'
      : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
  }

  if (target === 'testing') {
    return isActive
      ? 'inline-flex h-11 items-center justify-center rounded-xl border border-blue-300 bg-blue-100 px-4 text-sm font-medium text-blue-800'
      : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
  }

  if (target === 'pass') {
    return isActive
      ? 'inline-flex h-11 items-center justify-center rounded-xl border border-green-300 bg-green-100 px-4 text-sm font-medium text-green-800'
      : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
  }

  if (target === 'fail') {
    return isActive
      ? 'inline-flex h-11 items-center justify-center rounded-xl border border-red-300 bg-red-100 px-4 text-sm font-medium text-red-800'
      : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
  }

  return isActive
    ? 'inline-flex h-11 items-center justify-center rounded-xl border border-orange-300 bg-orange-100 px-4 text-sm font-medium text-orange-800'
    : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
}

export default function QcDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()

  const [qc, setQc] = useState<QcRequest | null>(null)
  const [prodNo, setProdNo] = useState('-')
  const [itemLabel, setItemLabel] = useState('-')

  const [qcStatus, setQcStatus] = useState<
    'requested' | 'received' | 'testing' | 'pass' | 'fail' | 'hold'
  >('requested')
  const [sampleQty, setSampleQty] = useState('')
  const [testerName, setTesterName] = useState('')
  const [resultComment, setResultComment] = useState('')

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true)
        setErrorMessage('')
        setSuccessMessage('')
        setActionMessage('')

        const resolvedParams = await params
        const id = Number(resolvedParams.id)

        if (Number.isNaN(id)) {
          setErrorMessage('잘못된 QC 경로입니다.')
          setIsLoading(false)
          return
        }

        const { data, error } = await supabase
          .from('qc_requests')
          .select(`
            id,
            qc_no,
            production_order_id,
            item_id,
            request_date,
            qc_type,
            qc_status,
            result_status,
            sample_qty,
            tester_name,
            result_comment,
            result_date,
            source_table,
            source_id,
            stock_released
          `)
          .eq('id', id)
          .single()

        if (error || !data) {
          setErrorMessage('QC 정보를 불러오지 못했습니다.')
          setIsLoading(false)
          return
        }

        const qcRow = data as QcRequest

        setQc(qcRow)
        setQcStatus(qcRow.qc_status)
        setSampleQty(qcRow.sample_qty !== null ? String(qcRow.sample_qty) : '')
        setTesterName(qcRow.tester_name ?? '')
        setResultComment(qcRow.result_comment ?? '')

        if (qcRow.production_order_id) {
          const { data: prodData } = await supabase
            .from('production_orders')
            .select('prod_no')
            .eq('id', qcRow.production_order_id)
            .single()

          if (prodData) {
            const prod = prodData as ProductionOrder
            setProdNo(prod.prod_no)
          } else {
            setProdNo('-')
          }
        } else {
          setProdNo('-')
        }

        const { data: itemData } = await supabase
          .from('items')
          .select('item_code, item_name')
          .eq('id', qcRow.item_id)
          .single()

        if (itemData) {
          const item = itemData as Item
          setItemLabel(`${item.item_code} / ${item.item_name}`)
        } else {
          setItemLabel('-')
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('QC 정보를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [params])

  async function releaseRawMaterialStockIfNeeded(nextQcStatus: QcRequest['qc_status']) {
    if (!qc) return { released: false }

    if (qc.qc_type !== 'raw_material') {
      return { released: false }
    }

    if (nextQcStatus !== 'pass') {
      return { released: false }
    }

    if (qc.stock_released) {
      return { released: false, alreadyReleased: true }
    }

    const releaseQty = sampleQty ? Number(sampleQty) : Number(qc.sample_qty ?? 0)

    if (!releaseQty || releaseQty <= 0) {
      throw new Error('원자재 QC 합격 처리에는 검사 수량이 필요합니다.')
    }

    const { data: defaultWarehouse } = await supabase
      .from('warehouses')
      .select('id')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    const warehouseId = defaultWarehouse?.id
    if (!warehouseId) {
      throw new Error('활성 창고가 없어 재고 전환을 진행할 수 없습니다.')
    }

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory')
      .select('id, item_id, warehouse_id, current_qty, available_qty, quarantine_qty')
      .eq('item_id', qc.item_id)
      .eq('warehouse_id', warehouseId)
      .single()

    if (inventoryError || !inventoryData) {
      throw new Error('재고 정보를 찾을 수 없습니다.')
    }

    const inventory = inventoryData as InventoryRow
    const beforeCurrentQty = Number(inventory.current_qty || 0)
    const beforeAvailableQty = Number(inventory.available_qty || 0)
    const beforeQuarantineQty = Number(inventory.quarantine_qty || 0)

    if (beforeQuarantineQty < releaseQty) {
      throw new Error(
        `격리재고가 부족합니다. 현재 격리재고 ${beforeQuarantineQty}, 전환 필요수량 ${releaseQty}`
      )
    }

    const afterCurrentQty = beforeCurrentQty
    const afterAvailableQty = beforeAvailableQty + releaseQty
    const afterQuarantineQty = beforeQuarantineQty - releaseQty
    const now = new Date().toISOString()

    const { error: inventoryUpdateError } = await supabase
      .from('inventory')
      .update({
        current_qty: afterCurrentQty,
        available_qty: afterAvailableQty,
        quarantine_qty: afterQuarantineQty,
        updated_at: now,
      })
      .eq('id', inventory.id)

    if (inventoryUpdateError) {
      throw new Error(`재고 전환 오류: ${inventoryUpdateError.message}`)
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error: txError } = await supabase
      .from('inventory_transactions')
      .insert({
        trans_date: now,
        trans_type: 'QC_RELEASE',
        item_id: qc.item_id,
        qty: releaseQty,
        ref_table: 'qc_requests',
        ref_id: qc.id,
        remarks: `원자재 QC 합격으로 격리재고 해제 (available +${releaseQty}, quarantine -${releaseQty})`,
        created_by: user?.id ?? null,
        created_at: now,
        warehouse_id: warehouseId,
        inventory_id: inventory.id,
      })

    if (txError) {
      throw new Error(`재고이력 저장 오류: ${txError.message}`)
    }

    const { error: qcReleaseError } = await supabase
      .from('qc_requests')
      .update({
        stock_released: true,
      })
      .eq('id', qc.id)

    if (qcReleaseError) {
      throw new Error(`QC 해제 상태 저장 오류: ${qcReleaseError.message}`)
    }

    return {
      released: true,
      releasedQty: releaseQty,
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!qc) return

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')
    setIsSaving(true)

    try {
      const mappedResultStatus =
        qcStatus === 'pass'
          ? 'pass'
          : qcStatus === 'fail'
          ? 'fail'
          : 'pending'

      const nextResultDate =
        qcStatus === 'pass' || qcStatus === 'fail'
          ? new Date().toISOString().slice(0, 10)
          : null

      const { error } = await supabase
        .from('qc_requests')
        .update({
          qc_status: qcStatus,
          result_status: mappedResultStatus,
          sample_qty: sampleQty ? Number(sampleQty) : null,
          tester_name: testerName.trim() || null,
          result_comment: resultComment.trim() || null,
          result_date: nextResultDate,
        })
        .eq('id', qc.id)

      if (error) {
        throw new Error(`QC 결과 저장 오류: ${error.message}`)
      }

      const releaseResult = await releaseRawMaterialStockIfNeeded(qcStatus)

      const refreshedQc: QcRequest = {
        ...qc,
        qc_status: qcStatus,
        result_status: mappedResultStatus,
        sample_qty: sampleQty ? Number(sampleQty) : null,
        tester_name: testerName.trim() || null,
        result_comment: resultComment.trim() || null,
        result_date: nextResultDate,
        stock_released: releaseResult.released ? true : qc.stock_released,
      }

      setQc(refreshedQc)
      setSuccessMessage('QC 결과가 저장되었습니다.')

      if (releaseResult.released) {
        setActionMessage(
          `원자재 QC 합격 처리와 함께 격리재고 ${releaseResult.releasedQty}가 사용가능재고로 전환되었습니다.`
        )
      } else if (releaseResult.alreadyReleased) {
        setActionMessage('이 원자재 QC는 이미 재고 전환이 완료된 상태입니다.')
      }

      router.refresh()
    } catch (error) {
      console.error(error)
      setErrorMessage(
        error instanceof Error ? error.message : 'QC 저장 중 오류가 발생했습니다.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">QC 정보를 불러오는 중입니다...</p>
      </div>
    )
  }

  if (!qc) {
    return (
      <div className="erp-card">
        <p className="text-sm text-red-500">QC 정보를 찾을 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <Link href="/qc" className="erp-back-link">
          ← QC 목록으로
        </Link>
        <div>
          <h1 className="erp-page-title">QC 결과 입력</h1>
          <p className="erp-page-desc">
            바이오형 QC 흐름 기준으로 접수, 시험, 판정 결과를 등록합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="erp-page">
        <div className="erp-card">
          <div className="erp-grid-2">
            <div className="erp-field">
              <label className="erp-label">QC번호</label>
              <div className="erp-readonly-box">{qc.qc_no}</div>
            </div>

            <div className="erp-field">
              <label className="erp-label">QC유형</label>
              <div className="erp-readonly-box">{getQcTypeLabel(qc.qc_type)}</div>
            </div>

            <div className="erp-field">
              <label className="erp-label">생산지시번호</label>
              <div className="erp-readonly-box">{prodNo}</div>
            </div>

            <div className="erp-field">
              <label className="erp-label">원본 문서</label>
              <div className="erp-readonly-box">
                {getSourceLabel(qc.source_table, qc.source_id)}
              </div>
            </div>

            <div className="erp-field">
              <label className="erp-label">의뢰일</label>
              <div className="erp-readonly-box">{qc.request_date}</div>
            </div>

            <div className="erp-field">
              <label className="erp-label">현재 결과상태</label>
              <div className="erp-readonly-box">{getResultStatusLabel(qc.result_status)}</div>
            </div>

            <div className="erp-field md:col-span-2">
              <label className="erp-label">품목</label>
              <div className="erp-readonly-box">{itemLabel}</div>
            </div>

            <div className="erp-field">
              <label className="erp-label">
                {qc.qc_type === 'sample' ? '샘플 수량' : '검사 수량'}
              </label>
              <input
                type="number"
                value={sampleQty}
                onChange={(e) => setSampleQty(e.target.value)}
                className="erp-input"
                placeholder={qc.qc_type === 'sample' ? '예: 2' : '예: 10'}
              />
            </div>

            <div className="erp-field">
              <label className="erp-label">시험자</label>
              <input
                value={testerName}
                onChange={(e) => setTesterName(e.target.value)}
                className="erp-input"
                placeholder="예: QC담당자"
              />
            </div>

            {qc.qc_type === 'raw_material' && (
              <>
                <div className="erp-field">
                  <label className="erp-label">재고 해제 상태</label>
                  <div className="erp-readonly-box">
                    {qc.stock_released ? '해제완료' : '미해제'}
                  </div>
                </div>

                <div className="erp-field">
                  <label className="erp-label">재고 반영 규칙</label>
                  <div className="erp-readonly-box">
                    합격 시 격리재고 → 사용가능재고 전환
                  </div>
                </div>
              </>
            )}

            <div className="erp-field md:col-span-2">
              <label className="erp-label">QC 상태</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setQcStatus('requested')}
                  className={getStatusButtonClass(qcStatus, 'requested')}
                >
                  의뢰됨
                </button>
                <button
                  type="button"
                  onClick={() => setQcStatus('received')}
                  className={getStatusButtonClass(qcStatus, 'received')}
                >
                  접수됨
                </button>
                <button
                  type="button"
                  onClick={() => setQcStatus('testing')}
                  className={getStatusButtonClass(qcStatus, 'testing')}
                >
                  시험중
                </button>
                <button
                  type="button"
                  onClick={() => setQcStatus('pass')}
                  className={getStatusButtonClass(qcStatus, 'pass')}
                >
                  합격
                </button>
                <button
                  type="button"
                  onClick={() => setQcStatus('fail')}
                  className={getStatusButtonClass(qcStatus, 'fail')}
                >
                  불합격
                </button>
                <button
                  type="button"
                  onClick={() => setQcStatus('hold')}
                  className={getStatusButtonClass(qcStatus, 'hold')}
                >
                  보류
                </button>
              </div>
            </div>

            <div className="erp-field md:col-span-2">
              <label className="erp-label">결과 의견</label>
              <textarea
                value={resultComment}
                onChange={(e) => setResultComment(e.target.value)}
                className="erp-textarea"
                rows={4}
                placeholder="시험 결과, 판정 의견, 특이사항을 입력하십시오."
              />
            </div>
          </div>
        </div>

        {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}
        {successMessage && <div className="erp-alert-success">{successMessage}</div>}
        {actionMessage && <div className="erp-alert-info">{actionMessage}</div>}

        <div className="erp-btn-row">
          <button type="submit" disabled={isSaving} className="erp-btn-primary">
            {isSaving ? '저장 중...' : '결과 저장'}
          </button>

          {qc.production_order_id && (
            <Link
              href={`/production-orders/${qc.production_order_id}`}
              className="erp-btn-secondary"
            >
              생산지시 보기
            </Link>
          )}

          <Link href="/qc" className="erp-btn-secondary">
            QC 목록으로
          </Link>
        </div>
      </form>
    </div>
  )
}