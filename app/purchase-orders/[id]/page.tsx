'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserPermissions } from '@/lib/permissions'

type Customer = {
  id: number
  customer_name: string
}

type AppUser = {
  id: string
  user_name: string
  login_id: string
}

type Item = {
  id: number
  item_code: string
  item_name: string
  purchase_price: number
}

type PurchaseOrder = {
  id: number
  po_no: string
  po_date: string
  customer_id: number
  user_id: string
  status: string
  total_amount: number
  remarks: string | null
}

type PurchaseOrderItem = {
  id: number
  purchase_order_id: number
  line_no: number
  item_id: number
  qty: number
  unit_price: number
  amount: number
}

type PurchaseOrderLine = {
  id?: number
  item_id: number | ''
  qty: number
  unit_price: number
}

type InventoryRow = {
  id: number
  item_id: number
  current_qty: number
  available_qty: number
  quarantine_qty: number
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

function getPurchaseOrderErrorMessage(error: SupabaseErrorLike) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    return '중복된 값이 있습니다. 입력 내용을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '저장 권한이 없습니다. 관리자에게 문의하십시오.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  }

  return '발주서 저장 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

function getPurchaseStatusLabel(status: string) {
  switch (status) {
    case 'draft':
      return '초안'
    case 'ordered':
      return '발주완료'
    case 'received':
      return '입고완료'
    default:
      return status
  }
}

function makeQcNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return `QC-${y}${m}${d}-${hh}${mm}${ss}`
}

export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()

  const [poId, setPoId] = useState<number | null>(null)
  const [poNo, setPoNo] = useState('')
  const [poDate, setPoDate] = useState('')
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('draft')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<PurchaseOrderLine[]>([])

  const [customers, setCustomers] = useState<Customer[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [items, setItems] = useState<Item[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [showActionButtons, setShowActionButtons] = useState(true)
  const [canReceiveStock, setCanReceiveStock] = useState(false)

  useEffect(() => {
    async function loadData() {
      const resolvedParams = await params
      const id = Number(resolvedParams.id)

      if (Number.isNaN(id)) {
        setErrorMessage('잘못된 발주서 경로입니다.')
        setIsLoading(false)
        return
      }

      const [
        { data: po, error: poError },
        { data: poItems, error: poItemsError },
        { data: customersData, error: customersError },
        { data: usersData, error: usersError },
        { data: itemsData, error: itemsError },
        permissions,
      ] = await Promise.all([
        supabase.from('purchase_orders').select('*').eq('id', id).single(),
        supabase
          .from('purchase_order_items')
          .select('*')
          .eq('purchase_order_id', id)
          .order('line_no'),
        supabase
          .from('customers')
          .select('id, customer_name')
          .in('customer_type', ['purchase', 'both'])
          .order('customer_name'),
        supabase
          .from('app_users')
          .select('id, user_name, login_id')
          .order('user_name'),
        supabase
          .from('items')
          .select('id, item_code, item_name, purchase_price')
          .order('item_name'),
        getCurrentUserPermissions(),
      ])

      if (poError || !po) {
        setErrorMessage('발주서 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (poItemsError) {
        setErrorMessage('발주 품목행 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (customersError || usersError || itemsError) {
        setErrorMessage('기초 데이터를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const typedPo = po as PurchaseOrder
      const typedLines = ((poItems as PurchaseOrderItem[]) ?? []).map((line) => ({
        id: line.id,
        item_id: line.item_id,
        qty: line.qty,
        unit_price: line.unit_price,
      }))

      setPoId(typedPo.id)
      setPoNo(typedPo.po_no)
      setPoDate(typedPo.po_date)
      setCustomerId(typedPo.customer_id)
      setUserId(typedPo.user_id)
      setStatus(typedPo.status)
      setRemarks(typedPo.remarks ?? '')
      setLines(typedLines.length > 0 ? typedLines : [{ item_id: '', qty: 1, unit_price: 0 }])

      setCustomers((customersData as Customer[]) ?? [])
      setUsers((usersData as AppUser[]) ?? [])
      setItems((itemsData as Item[]) ?? [])
      setCanReceiveStock(permissions?.role_name === 'admin' || permissions?.can_receive_stock || false)

      setIsLoading(false)
    }

    loadData()
  }, [params])

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  )

  const totalAmount = lines.reduce((sum, line) => {
    return sum + Number(line.qty || 0) * Number(line.unit_price || 0)
  }, 0)

  function updateLine(index: number, patch: Partial<PurchaseOrderLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    )
  }

  function handleItemChange(index: number, itemIdValue: string) {
    const itemId = itemIdValue ? Number(itemIdValue) : ''
    const item = typeof itemId === 'number' ? itemMap.get(itemId) : null

    updateLine(index, {
      item_id: itemId,
      unit_price: item?.purchase_price ?? 0,
    })
  }

  function addLine() {
    setLines((prev) => [...prev, { item_id: '', qty: 1, unit_price: 0 }])
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    if (!poId) {
      setErrorMessage('발주서 정보가 올바르지 않습니다.')
      return
    }

    if (!customerId) {
      setErrorMessage('공급처를 선택하십시오.')
      return
    }

    if (!userId) {
      setErrorMessage('작성자를 선택하십시오.')
      return
    }

    if (lines.length === 0) {
      setErrorMessage('품목행을 1개 이상 입력하십시오.')
      return
    }

    if (lines.some((line) => !line.item_id)) {
      setErrorMessage('모든 품목행에 품목을 선택하십시오.')
      return
    }

    setIsSaving(true)

    const { error: poError } = await supabase
      .from('purchase_orders')
      .update({
        po_date: poDate,
        customer_id: customerId,
        user_id: userId,
        total_amount: totalAmount,
        remarks: remarks.trim() || null,
      })
      .eq('id', poId)

    if (poError) {
      setIsSaving(false)
      setErrorMessage(getPurchaseOrderErrorMessage(poError))
      return
    }

    const { error: deleteError } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('purchase_order_id', poId)

    if (deleteError) {
      setIsSaving(false)
      setErrorMessage(getPurchaseOrderErrorMessage(deleteError))
      return
    }

    const payload = lines.map((line, index) => ({
      purchase_order_id: poId,
      line_no: index + 1,
      item_id: line.item_id,
      qty: Number(line.qty) || 0,
      unit_price: Number(line.unit_price) || 0,
      amount: (Number(line.qty) || 0) * (Number(line.unit_price) || 0),
      remarks: null,
    }))

    const { error: lineInsertError } = await supabase
      .from('purchase_order_items')
      .insert(payload)

    if (lineInsertError) {
      setIsSaving(false)
      setErrorMessage(getPurchaseOrderErrorMessage(lineInsertError))
      return
    }

    setIsSaving(false)
    setSuccessMessage('발주서 정보가 저장되었습니다.')
    router.refresh()
  }

  async function handlePrintPreview() {
    if (!poId) {
      setErrorMessage('발주서 정보가 올바르지 않습니다.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: 'ordered' })
      .eq('id', poId)

    if (error) {
      setErrorMessage(getPurchaseOrderErrorMessage(error))
      return
    }

    setStatus('ordered')
    setActionMessage(
      `발주서 ${poNo}가 출력되었습니다. 교육용 ERP로 해당 기능은 실제 구현하지 않았습니다.`
    )
    router.refresh()
  }

  async function handleEmailPreview() {
    if (!poId) {
      setErrorMessage('발주서 정보가 올바르지 않습니다.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: 'ordered' })
      .eq('id', poId)

    if (error) {
      setErrorMessage(getPurchaseOrderErrorMessage(error))
      return
    }

    setStatus('ordered')
    setActionMessage(
      `발주서 ${poNo}가 이메일 발송 처리되었습니다. 교육용 ERP로 해당 기능은 실제 구현하지 않았습니다.`
    )
    router.refresh()
  }

  async function handleReceiveStock() {
    if (!poId) {
      setErrorMessage('발주서 정보가 올바르지 않습니다.')
      return
    }

    if (!canReceiveStock) {
      setErrorMessage('현재 사용자에게는 입고 처리 권한이 없습니다.')
      return
    }

    if (status === 'received') {
      setErrorMessage('이미 입고처리된 발주서입니다.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    const { data: poItemsData, error: poItemsError } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', poId)
      .order('line_no')

    if (poItemsError) {
      setErrorMessage(getPurchaseOrderErrorMessage(poItemsError))
      return
    }

    const typedPoItems = (poItemsData as PurchaseOrderItem[]) ?? []
    const now = new Date().toISOString()

    for (const line of typedPoItems) {
      const item = itemMap.get(line.item_id)
      const lineQty = Number(line.qty)

      const { data: inventoryRow, error: inventorySelectError } = await supabase
        .from('inventory')
        .select('id, item_id, current_qty, available_qty, quarantine_qty')
        .eq('item_id', line.item_id)
        .maybeSingle()

      if (inventorySelectError) {
        setErrorMessage(getPurchaseOrderErrorMessage(inventorySelectError))
        return
      }

      if (inventoryRow) {
        const current = inventoryRow as InventoryRow

        const { error: inventoryUpdateError } = await supabase
          .from('inventory')
          .update({
            current_qty: Number(current.current_qty) + lineQty,
            available_qty: Number(current.available_qty),
            quarantine_qty: Number(current.quarantine_qty) + lineQty,
            updated_at: now,
          })
          .eq('id', current.id)

        if (inventoryUpdateError) {
          setErrorMessage(getPurchaseOrderErrorMessage(inventoryUpdateError))
          return
        }
      } else {
        const { error: inventoryInsertError } = await supabase
          .from('inventory')
          .insert({
            item_id: line.item_id,
            current_qty: lineQty,
            available_qty: 0,
            quarantine_qty: lineQty,
            updated_at: now,
          })

        if (inventoryInsertError) {
          setErrorMessage(getPurchaseOrderErrorMessage(inventoryInsertError))
          return
        }
      }

      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert({
          trans_date: now,
          trans_type: 'IN',
          item_id: line.item_id,
          qty: lineQty,
          ref_table: 'purchase_orders',
          ref_id: poId,
          remarks: `발주서 ${poNo} 입고처리 (격리재고 적치)`,
          created_by: userId || null,
          created_at: now,
        })

      if (txError) {
        setErrorMessage(getPurchaseOrderErrorMessage(txError))
        return
      }

      const qcNo = makeQcNo()

      const { error: qcInsertError } = await supabase
        .from('qc_requests')
        .insert({
          qc_no: qcNo,
          qc_type: 'raw_material',
          qc_status: 'requested',
          result_status: 'pending',
          production_order_id: null,
          item_id: line.item_id,
          source_table: 'purchase_orders',
          source_id: poId,
          request_date: now.slice(0, 10),
          sample_qty: lineQty,
          tester_name: null,
          result_comment: item
            ? `${item.item_name} 원자재 입고분 QC 의뢰`
            : '원자재 입고분 QC 의뢰',
          result_date: null,
        })

      if (qcInsertError) {
        setErrorMessage(getPurchaseOrderErrorMessage(qcInsertError))
        return
      }
    }

    const { error: poUpdateError } = await supabase
      .from('purchase_orders')
      .update({ status: 'received' })
      .eq('id', poId)

    if (poUpdateError) {
      setErrorMessage(getPurchaseOrderErrorMessage(poUpdateError))
      return
    }

    setStatus('received')
    setActionMessage(
      `발주서 ${poNo}의 입고처리가 완료되었습니다. 원자재는 격리재고로 적치되었고, 원자재 QC 요청이 자동 생성되었습니다.`
    )
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">발주서 정보를 불러오는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <Link href="/purchase-orders" className="erp-back-link">
          ← 발주서 목록으로
        </Link>
        <div>
          <h1 className="erp-page-title">발주서 상세 / 수정</h1>
          <p className="erp-page-desc">
            발주서 기본정보와 품목행을 수정하고 입고처리를 진행합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="erp-page">
        <div className="erp-card">
          <div className="erp-info-bar">
            발주번호: <span className="font-medium">{poNo}</span>
            <span className="mx-2">/</span>
            상태: <span className="font-medium">{getPurchaseStatusLabel(status)}</span>
          </div>

          <h2 className="erp-card-title">기본정보</h2>

          <div className="erp-grid-2">
            <div className="erp-field">
              <label className="erp-label">발주일</label>
              <input
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
                className="erp-input"
              />
            </div>

            <div className="erp-field">
              <label className="erp-label">공급처</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                className="erp-select"
              >
                <option value="">공급처 선택</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customer_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="erp-field">
              <label className="erp-label">작성자</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="erp-select"
              >
                <option value="">작성자 선택</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.user_name} / {user.login_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="erp-field">
              <label className="erp-label">비고</label>
              <input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="erp-input"
              />
            </div>
          </div>
        </div>

        <div className="erp-card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="erp-card-title !mb-0">품목행</h2>
            <button
              type="button"
              onClick={addLine}
              className="erp-btn-secondary"
            >
              행 추가
            </button>
          </div>

          <div className="erp-lines-wrap">
            {lines.map((line, index) => {
              const amount = Number(line.qty || 0) * Number(line.unit_price || 0)

              return (
                <div
                  key={`${line.id ?? 'new'}-${index}`}
                  className="erp-line-card"
                >
                  <div className="erp-field">
                    <label className="erp-label">품목</label>
                    <select
                      value={line.item_id}
                      onChange={(e) => handleItemChange(index, e.target.value)}
                      className="erp-select"
                    >
                      <option value="">품목 선택</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.item_code} / {item.item_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="erp-field">
                    <label className="erp-label">수량</label>
                    <input
                      type="number"
                      value={line.qty}
                      onChange={(e) =>
                        updateLine(index, { qty: Number(e.target.value) || 0 })
                      }
                      className="erp-input"
                    />
                  </div>

                  <div className="erp-field">
                    <label className="erp-label">단가</label>
                    <input
                      type="number"
                      value={line.unit_price}
                      onChange={(e) =>
                        updateLine(index, {
                          unit_price: Number(e.target.value) || 0,
                        })
                      }
                      className="erp-input"
                    />
                  </div>

                  <div className="erp-field">
                    <label className="erp-label">금액</label>
                    <div className="erp-readonly-box">
                      {amount.toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      disabled={lines.length === 1}
                      className="erp-btn-danger w-full"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="erp-total-box">
            총금액: {totalAmount.toLocaleString()}
          </div>
        </div>

        {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}
        {successMessage && <div className="erp-alert-success">{successMessage}</div>}
        {actionMessage && <div className="erp-alert-info">{actionMessage}</div>}

        <div className="erp-btn-row">
          <button
            type="submit"
            disabled={isSaving}
            className="erp-btn-primary"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          {showActionButtons && (
            <>
              <button
                type="button"
                onClick={handlePrintPreview}
                className="erp-btn-secondary"
              >
                출력
              </button>

              <button
                type="button"
                onClick={handleEmailPreview}
                className="erp-btn-secondary"
              >
                E-mail 발송
              </button>

              <button
                type="button"
                onClick={handleReceiveStock}
                disabled={status === 'received' || !canReceiveStock}
                className="erp-btn-secondary"
              >
                입고처리
              </button>
            </>
          )}

          <Link href="/purchase-orders" className="erp-btn-secondary">
            목록으로
          </Link>
        </div>
      </form>
    </div>
  )
}