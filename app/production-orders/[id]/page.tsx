'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserPermissions } from '@/lib/permissions'

type Item = {
  id: number
  item_code: string
  item_name: string
  item_type: string
}

type Bom = {
  id: number
  parent_item_id: number
  bom_code: string
  version_no: string
  status: string
}

type BomItem = {
  id: number
  bom_id: number
  line_no: number
  child_item_id: number
  qty: number
  remarks: string | null
}

type AppUser = {
  id: string
  user_name: string
  login_id: string
}

type ProductionOrder = {
  id: number
  prod_no: string
  prod_date: string
  item_id: number
  bom_id: number | null
  plan_qty: number
  completed_qty: number
  status: string
  user_id: string
  remarks: string | null
}

type InventoryRow = {
  id: number
  item_id: number
  current_qty: number
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

function getProductionOrderErrorMessage(error: SupabaseErrorLike) {
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

  return '생산지시 저장 중 오류가 발생했습니다. 다시 시도해 주세요.'
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

export default function ProductionOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()

  const [prodId, setProdId] = useState<number | null>(null)
  const [prodNo, setProdNo] = useState('')
  const [prodDate, setProdDate] = useState('')
  const [itemId, setItemId] = useState<number | ''>('')
  const [bomId, setBomId] = useState<number | ''>('')
  const [planQty, setPlanQty] = useState('1')
  const [completedQty, setCompletedQty] = useState('0')
  const [status, setStatus] = useState('planned')
  const [userId, setUserId] = useState('')
  const [remarks, setRemarks] = useState('')

  const [items, setItems] = useState<Item[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [users, setUsers] = useState<AppUser[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [showActionButtons, setShowActionButtons] = useState(true)
  const [canProdComplete, setCanProdComplete] = useState(false)

  useEffect(() => {
    async function loadData() {
      const resolvedParams = await params
      const id = Number(resolvedParams.id)

      if (Number.isNaN(id)) {
        setErrorMessage('잘못된 생산지시 경로입니다.')
        setIsLoading(false)
        return
      }

      const [
        { data: prod, error: prodError },
        { data: itemsData, error: itemsError },
        { data: bomsData, error: bomsError },
        { data: usersData, error: usersError },
        permissions,
      ] = await Promise.all([
        supabase.from('production_orders').select('*').eq('id', id).single(),
        supabase
          .from('items')
          .select('id, item_code, item_name, item_type')
          .eq('item_type', 'finished')
          .order('item_name'),
        supabase
          .from('boms')
          .select('id, parent_item_id, bom_code, version_no, status')
          .eq('status', 'active')
          .order('id'),
        supabase
          .from('app_users')
          .select('id, user_name, login_id')
          .order('user_name'),
        getCurrentUserPermissions(),
      ])

      if (prodError || !prod) {
        setErrorMessage('생산지시 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (itemsError || bomsError || usersError) {
        setErrorMessage('기초 데이터를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const typedProd = prod as ProductionOrder

      setProdId(typedProd.id)
      setProdNo(typedProd.prod_no)
      setProdDate(typedProd.prod_date)
      setItemId(typedProd.item_id)
      setBomId(typedProd.bom_id ?? '')
      setPlanQty(String(typedProd.plan_qty))
      setCompletedQty(String(typedProd.completed_qty))
      setStatus(typedProd.status)
      setUserId(typedProd.user_id)
      setRemarks(typedProd.remarks ?? '')

      setItems((itemsData as Item[]) ?? [])
      setBoms((bomsData as Bom[]) ?? [])
      setUsers((usersData as AppUser[]) ?? [])
      setCanProdComplete(permissions?.can_prod_complete ?? false)

      setIsLoading(false)
    }

    loadData()
  }, [params])

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  )

  const filteredBoms = useMemo(
    () => boms.filter((bom) => bom.parent_item_id === itemId),
    [boms, itemId]
  )

  function handleFinishedItemChange(value: string) {
    const nextItemId = value ? Number(value) : ''
    setItemId(nextItemId)

    const matchedBom = boms.find((bom) => bom.parent_item_id === nextItemId)
    setBomId(matchedBom ? matchedBom.id : '')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    if (!prodId) {
      setErrorMessage('생산지시 정보가 올바르지 않습니다.')
      return
    }

    if (!itemId) {
      setErrorMessage('완제품을 선택하십시오.')
      return
    }

    if (!bomId) {
      setErrorMessage('BOM을 선택하십시오.')
      return
    }

    if (!userId) {
      setErrorMessage('작성자를 선택하십시오.')
      return
    }

    if (Number(planQty) <= 0) {
      setErrorMessage('계획수량은 1 이상이어야 합니다.')
      return
    }

    setIsSaving(true)

    const { error } = await supabase
      .from('production_orders')
      .update({
        prod_date: prodDate,
        item_id: itemId,
        bom_id: bomId,
        plan_qty: Number(planQty),
        completed_qty: Number(completedQty) || 0,
        user_id: userId,
        remarks: remarks.trim() || null,
      })
      .eq('id', prodId)

    setIsSaving(false)

    if (error) {
      setErrorMessage(getProductionOrderErrorMessage(error))
      return
    }

    setSuccessMessage('생산지시 정보가 저장되었습니다.')
    router.refresh()
  }

  async function handleStartProduction() {
    if (!prodId) {
      setErrorMessage('생산지시 정보가 올바르지 않습니다.')
      return
    }

    if (status === 'completed') {
      setErrorMessage('이미 생산완료된 지시입니다.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    const { error } = await supabase
      .from('production_orders')
      .update({ status: 'in_progress' })
      .eq('id', prodId)

    if (error) {
      setErrorMessage(getProductionOrderErrorMessage(error))
      return
    }

    setStatus('in_progress')
    setActionMessage(
      `생산지시 ${prodNo}가 생산중 상태로 변경되었습니다. 교육용 ERP로 실제 생산 시작 처리는 구현하지 않았습니다.`
    )
    router.refresh()
  }

  async function handleCompleteProduction() {
    if (!prodId) {
      setErrorMessage('생산지시 정보가 올바르지 않습니다.')
      return
    }

    if (!canProdComplete) {
      setErrorMessage('현재 사용자에게는 생산 완료 권한이 없습니다.')
      return
    }

    if (!bomId) {
      setErrorMessage('연결된 BOM 정보가 없습니다.')
      return
    }

    if (!itemId) {
      setErrorMessage('완제품 정보가 없습니다.')
      return
    }

    if (status === 'completed') {
      setErrorMessage('이미 생산완료 처리된 지시입니다.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    const now = new Date().toISOString()
    const planQtyNumber = Number(planQty) || 0

    const { data: bomItemsData, error: bomItemsError } = await supabase
      .from('bom_items')
      .select('*')
      .eq('bom_id', bomId)
      .order('line_no')

    if (bomItemsError) {
      setErrorMessage(getProductionOrderErrorMessage(bomItemsError))
      return
    }

    const bomItems = (bomItemsData as BomItem[]) ?? []

    for (const bomItem of bomItems) {
      const requiredQty = Number(bomItem.qty) * planQtyNumber

      const { data: inventoryRow, error: inventorySelectError } = await supabase
        .from('inventory')
        .select('id, item_id, current_qty')
        .eq('item_id', bomItem.child_item_id)
        .maybeSingle()

      if (inventorySelectError) {
        setErrorMessage(getProductionOrderErrorMessage(inventorySelectError))
        return
      }

      if (!inventoryRow) {
        setErrorMessage('자재 재고 정보가 없습니다. 먼저 기초 재고를 확인하십시오.')
        return
      }

      const materialInventory = inventoryRow as InventoryRow

      if (Number(materialInventory.current_qty) < requiredQty) {
        const materialItem = itemMap.get(bomItem.child_item_id)

        setErrorMessage(
          `자재 재고가 부족합니다. ${
            materialItem?.item_name ?? '자재'
          }의 필요수량은 ${requiredQty}, 현재고는 ${Number(materialInventory.current_qty)}입니다.`
        )
        return
      }
    }

    for (const bomItem of bomItems) {
      const requiredQty = Number(bomItem.qty) * planQtyNumber

      const { data: inventoryRow, error: inventorySelectError } = await supabase
        .from('inventory')
        .select('id, item_id, current_qty')
        .eq('item_id', bomItem.child_item_id)
        .maybeSingle()

      if (inventorySelectError) {
        setErrorMessage(getProductionOrderErrorMessage(inventorySelectError))
        return
      }

      if (!inventoryRow) {
        setErrorMessage('자재 재고 정보가 없습니다. 먼저 기초 재고를 확인하십시오.')
        return
      }

      const materialInventory = inventoryRow as InventoryRow
      const newQty = Number(materialInventory.current_qty) - requiredQty

      const { error: inventoryUpdateError } = await supabase
        .from('inventory')
        .update({
          current_qty: newQty,
          updated_at: now,
        })
        .eq('id', materialInventory.id)

      if (inventoryUpdateError) {
        setErrorMessage(getProductionOrderErrorMessage(inventoryUpdateError))
        return
      }

      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert({
          trans_date: now,
          trans_type: 'MATL_OUT',
          item_id: bomItem.child_item_id,
          qty: requiredQty,
          ref_table: 'production_orders',
          ref_id: prodId,
          remarks: `생산지시 ${prodNo} 자재출고`,
          created_by: userId || null,
          created_at: now,
        })

      if (txError) {
        setErrorMessage(getProductionOrderErrorMessage(txError))
        return
      }
    }

    const { data: finishedInventoryRow, error: finishedInventorySelectError } = await supabase
      .from('inventory')
      .select('id, item_id, current_qty')
      .eq('item_id', itemId)
      .maybeSingle()

    if (finishedInventorySelectError) {
      setErrorMessage(getProductionOrderErrorMessage(finishedInventorySelectError))
      return
    }

    if (finishedInventoryRow) {
      const finishedInventory = finishedInventoryRow as InventoryRow

      const { error: finishedUpdateError } = await supabase
        .from('inventory')
        .update({
          current_qty: Number(finishedInventory.current_qty) + planQtyNumber,
          updated_at: now,
        })
        .eq('id', finishedInventory.id)

      if (finishedUpdateError) {
        setErrorMessage(getProductionOrderErrorMessage(finishedUpdateError))
        return
      }
    } else {
      const { error: finishedInsertError } = await supabase
        .from('inventory')
        .insert({
          item_id: itemId,
          current_qty: planQtyNumber,
          updated_at: now,
        })

      if (finishedInsertError) {
        setErrorMessage(getProductionOrderErrorMessage(finishedInsertError))
        return
      }
    }

    const { error: prodInTxError } = await supabase
      .from('inventory_transactions')
      .insert({
        trans_date: now,
        trans_type: 'PROD_IN',
        item_id: itemId,
        qty: planQtyNumber,
        ref_table: 'production_orders',
        ref_id: prodId,
        remarks: `생산지시 ${prodNo} 완제품입고`,
        created_by: userId || null,
        created_at: now,
      })

    if (prodInTxError) {
      setErrorMessage(getProductionOrderErrorMessage(prodInTxError))
      return
    }

    const { error: prodUpdateError } = await supabase
      .from('production_orders')
      .update({
        status: 'completed',
        completed_qty: planQtyNumber,
      })
      .eq('id', prodId)

    if (prodUpdateError) {
      setErrorMessage(getProductionOrderErrorMessage(prodUpdateError))
      return
    }

    setStatus('completed')
    setCompletedQty(String(planQtyNumber))
    setActionMessage(
      `생산지시 ${prodNo}가 완료되었습니다. 자재가 차감되고 완제품이 입고 처리되었습니다.`
    )
    router.refresh()
  }

  const isCompleted = status === 'completed'

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">생산지시 정보를 불러오는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <Link href="/production-orders" className="erp-back-link">
          ← 생산지시 목록으로
        </Link>
        <div>
          <h1 className="erp-page-title">생산지시 상세 / 수정</h1>
          <p className="erp-page-desc">
            생산지시 기본정보를 수정하고 생산 진행/완료를 처리합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="erp-page">
        <div className="erp-card">
          <div className="erp-info-bar">
            생산지시번호: <span className="font-medium">{prodNo}</span>
            <span className="mx-2">/</span>
            상태: <span className="font-medium">{getStatusLabel(status)}</span>
          </div>

          <h2 className="erp-card-title">기본정보</h2>

          <div className="erp-grid-2">
            <div className="erp-field">
              <label className="erp-label">생산일</label>
              <input
                type="date"
                value={prodDate}
                onChange={(e) => setProdDate(e.target.value)}
                disabled={isCompleted}
                className="erp-input"
              />
            </div>

            <div className="erp-field">
              <label className="erp-label">완제품</label>
              <select
                value={itemId}
                onChange={(e) => handleFinishedItemChange(e.target.value)}
                disabled={isCompleted}
                className="erp-select"
              >
                <option value="">완제품 선택</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.item_code} / {item.item_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="erp-field">
              <label className="erp-label">BOM</label>
              <select
                value={bomId}
                onChange={(e) => setBomId(e.target.value ? Number(e.target.value) : '')}
                disabled={isCompleted}
                className="erp-select"
              >
                <option value="">BOM 선택</option>
                {filteredBoms.map((bom) => (
                  <option key={bom.id} value={bom.id}>
                    {bom.bom_code} / 버전 {bom.version_no}
                  </option>
                ))}
              </select>
            </div>

            <div className="erp-field">
              <label className="erp-label">계획수량</label>
              <input
                type="number"
                min={1}
                value={planQty}
                onChange={(e) => setPlanQty(e.target.value)}
                disabled={isCompleted}
                className="erp-input"
              />
            </div>

            <div className="erp-field">
              <label className="erp-label">완료수량</label>
              <input
                type="number"
                value={completedQty}
                onChange={(e) => setCompletedQty(e.target.value)}
                disabled={isCompleted}
                className="erp-input"
              />
            </div>

            <div className="erp-field">
              <label className="erp-label">작성자</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={isCompleted}
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

            <div className="erp-field md:col-span-2">
              <label className="erp-label">비고</label>
              <input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={isCompleted}
                className="erp-input"
              />
            </div>
          </div>
        </div>

        {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}
        {successMessage && <div className="erp-alert-success">{successMessage}</div>}
        {actionMessage && <div className="erp-alert-info">{actionMessage}</div>}

        <div className="erp-btn-row">
          <button
            type="submit"
            disabled={isSaving || isCompleted}
            className="erp-btn-primary"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          {showActionButtons && (
            <>
              <button
                type="button"
                onClick={handleStartProduction}
                disabled={isCompleted}
                className="erp-btn-secondary"
              >
                생산시작
              </button>

              <button
                type="button"
                onClick={handleCompleteProduction}
                disabled={isCompleted || !canProdComplete}
                className="erp-btn-secondary"
              >
                생산완료
              </button>
            </>
          )}

          <Link href="/production-orders" className="erp-btn-secondary">
            목록으로
          </Link>
        </div>
      </form>
    </div>
  )
}