'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

type AppUser = {
  id: string
  user_name: string
  login_id: string
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

function getProductionOrderErrorMessage(error: SupabaseErrorLike) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    if (message.includes('prod_no')) {
      return '생산지시번호가 중복되었습니다. 다시 시도해 주세요.'
    }
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

function makeProdNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return `PR-${y}${m}${d}-${hh}${mm}${ss}`
}

export default function NewProductionOrderPage() {
  const router = useRouter()

  const [items, setItems] = useState<Item[]>([])
  const [boms, setBoms] = useState<Bom[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [prodDate, setProdDate] = useState(new Date().toISOString().slice(0, 10))
  const [itemId, setItemId] = useState<number | ''>('')
  const [bomId, setBomId] = useState<number | ''>('')
  const [planQty, setPlanQty] = useState('1')
  const [userId, setUserId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      const [
        { data: itemsData, error: itemsError },
        { data: bomsData, error: bomsError },
        { data: usersData, error: usersError },
      ] = await Promise.all([
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
      ])

      if (itemsError || bomsError || usersError) {
        setErrorMessage('기초 데이터를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const fetchedUsers = (usersData as AppUser[]) ?? []

      setItems((itemsData as Item[]) ?? [])
      setBoms((bomsData as Bom[]) ?? [])
      setUsers(fetchedUsers)

      const defaultProductionUser = fetchedUsers.find((u) => u.login_id === 'production')
      if (defaultProductionUser) setUserId(defaultProductionUser.id)

      setIsLoading(false)
    }

    loadData()
  }, [])

  const filteredBoms = boms.filter((bom) => bom.parent_item_id === itemId)

  function handleFinishedItemChange(value: string) {
    const nextItemId = value ? Number(value) : ''
    setItemId(nextItemId)

    const matchedBom = boms.find((bom) => bom.parent_item_id === nextItemId)
    setBomId(matchedBom ? matchedBom.id : '')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

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

    const prodNo = makeProdNo()

    const { data, error } = await supabase
      .from('production_orders')
      .insert({
        prod_no: prodNo,
        prod_date: prodDate,
        item_id: itemId,
        bom_id: bomId,
        plan_qty: Number(planQty),
        completed_qty: 0,
        status: 'planned',
        user_id: userId,
        remarks: remarks.trim() || null,
      })
      .select('id')
      .single()

    if (error || !data) {
      setIsSaving(false)
      setErrorMessage(
        getProductionOrderErrorMessage(error ?? { message: '생산지시 저장 실패' })
      )
      return
    }

    const createdId = data.id as number

    setIsSaving(false)
    router.push(`/production-orders/${createdId}`)
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">생산지시 등록 화면을 준비하는 중입니다...</p>
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
          <h1 className="erp-page-title">생산지시 등록</h1>
          <p className="erp-page-desc">
            생산지시 기본정보를 입력합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="erp-page">
        <div className="erp-card">
          <h2 className="erp-card-title">기본정보</h2>

          <div className="erp-grid-2">
            <div className="erp-field">
              <label className="erp-label">생산일</label>
              <input
                type="date"
                value={prodDate}
                onChange={(e) => setProdDate(e.target.value)}
                className="erp-input"
              />
            </div>

            <div className="erp-field">
              <label className="erp-label">완제품</label>
              <select
                value={itemId}
                onChange={(e) => handleFinishedItemChange(e.target.value)}
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
                className="erp-input"
              />
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
                placeholder="예: 교육용 생산지시"
              />
            </div>
          </div>
        </div>

        {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}

        <div className="erp-btn-row">
          <button
            type="submit"
            disabled={isSaving}
            className="erp-btn-primary"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          <Link href="/production-orders" className="erp-btn-secondary">
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}