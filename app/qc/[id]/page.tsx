'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type QcRequest = {
  id: number
  qc_no: string
  production_order_id: number
  item_id: number
  request_date: string
  result_status: 'pending' | 'pass' | 'fail'
  result_comment: string | null
  result_date: string | null
}

type ProductionOrder = {
  prod_no: string
}

type Item = {
  item_code: string
  item_name: string
}

function getStatusButtonClass(
  current: 'pending' | 'pass' | 'fail',
  target: 'pending' | 'pass' | 'fail'
) {
  const isActive = current === target

  if (target === 'pending') {
    return isActive
      ? 'inline-flex h-11 items-center justify-center rounded-xl border border-yellow-300 bg-yellow-100 px-4 text-sm font-medium text-yellow-800'
      : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
  }

  if (target === 'pass') {
    return isActive
      ? 'inline-flex h-11 items-center justify-center rounded-xl border border-green-300 bg-green-100 px-4 text-sm font-medium text-green-800'
      : 'inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700'
  }

  return isActive
    ? 'inline-flex h-11 items-center justify-center rounded-xl border border-red-300 bg-red-100 px-4 text-sm font-medium text-red-800'
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
  const [resultStatus, setResultStatus] = useState<'pending' | 'pass' | 'fail'>('pending')
  const [resultComment, setResultComment] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      const resolvedParams = await params
      const id = Number(resolvedParams.id)

      const { data, error } = await supabase
        .from('qc_requests')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        setErrorMessage('QC 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const qcRow = data as QcRequest
      setQc(qcRow)
      setResultStatus(qcRow.result_status)
      setResultComment(qcRow.result_comment ?? '')

      const [{ data: prodData }, { data: itemData }] = await Promise.all([
        supabase
          .from('production_orders')
          .select('prod_no')
          .eq('id', qcRow.production_order_id)
          .single(),
        supabase
          .from('items')
          .select('item_code, item_name')
          .eq('id', qcRow.item_id)
          .single(),
      ])

      if (prodData) {
        const prod = prodData as ProductionOrder
        setProdNo(prod.prod_no)
      }

      if (itemData) {
        const item = itemData as Item
        setItemLabel(`${item.item_code} / ${item.item_name}`)
      }

      setIsLoading(false)
    }

    loadData()
  }, [params])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!qc) return

    setErrorMessage('')
    setSuccessMessage('')
    setIsSaving(true)

    const { error } = await supabase
      .from('qc_requests')
      .update({
        result_status: resultStatus,
        result_comment: resultComment.trim() || null,
        result_date: resultStatus === 'pending' ? null : new Date().toISOString().slice(0, 10),
      })
      .eq('id', qc.id)

    setIsSaving(false)

    if (error) {
      setErrorMessage(`QC 결과 저장 오류: ${error.message}`)
      return
    }

    setSuccessMessage('QC 결과가 저장되었습니다.')
    router.refresh()
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
            샘플 QC 결과를 등록합니다.
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
              <label className="erp-label">생산지시번호</label>
              <div className="erp-readonly-box">{prodNo}</div>
            </div>

            <div className="erp-field md:col-span-2">
              <label className="erp-label">품목</label>
              <div className="erp-readonly-box">{itemLabel}</div>
            </div>

            <div className="erp-field">
              <label className="erp-label">의뢰일</label>
              <div className="erp-readonly-box">{qc.request_date}</div>
            </div>

            <div className="erp-field md:col-span-2">
              <label className="erp-label">결과 상태</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setResultStatus('pending')}
                  className={getStatusButtonClass(resultStatus, 'pending')}
                >
                  검사대기
                </button>

                <button
                  type="button"
                  onClick={() => setResultStatus('pass')}
                  className={getStatusButtonClass(resultStatus, 'pass')}
                >
                  합격
                </button>

                <button
                  type="button"
                  onClick={() => setResultStatus('fail')}
                  className={getStatusButtonClass(resultStatus, 'fail')}
                >
                  불합격
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
                placeholder="QC 판정 의견을 입력하십시오."
              />
            </div>
          </div>
        </div>

        {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}
        {successMessage && <div className="erp-alert-success">{successMessage}</div>}

        <div className="erp-btn-row">
          <button
            type="submit"
            disabled={isSaving}
            className="erp-btn-primary"
          >
            {isSaving ? '저장 중...' : '결과 저장'}
          </button>

          <Link href="/qc" className="erp-btn-secondary">
            목록으로
          </Link>
        </div>
      </form>
    </div>
  )
}