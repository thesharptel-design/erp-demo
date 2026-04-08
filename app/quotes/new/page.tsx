'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
  sales_price: number
}

type QuoteLine = {
  item_id: number | ''
  qty: number
  unit_price: number
}

type SupabaseErrorLike = {
  code?: string
  message: string
}

function getQuoteErrorMessage(error: SupabaseErrorLike) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    if (message.includes('quote_no')) {
      return '견적번호가 중복되었습니다. 다시 시도해 주세요.'
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

  return '견적서 저장 중 오류가 발생했습니다. 다시 시도해 주세요.'
}

function makeQuoteNo() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')

  return `QT-${y}${m}${d}-${hh}${mm}${ss}`
}

export default function NewQuotePage() {
  const router = useRouter()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10))
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [userId, setUserId] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<QuoteLine[]>([
    { item_id: '', qty: 1, unit_price: 0 },
  ])
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadData() {
      const [
        { data: customersData, error: customersError },
        { data: usersData, error: usersError },
        { data: itemsData, error: itemsError },
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id, customer_name')
          .in('customer_type', ['sales', 'both'])
          .order('customer_name'),
        supabase
          .from('app_users')
          .select('id, user_name, login_id')
          .order('user_name'),
        supabase
          .from('items')
          .select('id, item_code, item_name, sales_price')
          .order('item_name'),
      ])

      if (customersError || usersError || itemsError) {
        setErrorMessage('기초 데이터를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const fetchedUsers = (usersData as AppUser[]) ?? []

      setCustomers((customersData as Customer[]) ?? [])
      setUsers(fetchedUsers)
      setItems((itemsData as Item[]) ?? [])

      const defaultSalesUser = fetchedUsers.find((u) => u.login_id === 'sales')
      if (defaultSalesUser) setUserId(defaultSalesUser.id)

      setIsLoading(false)
    }

    loadData()
  }, [])

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  )

  const totalAmount = lines.reduce((sum, line) => {
    return sum + Number(line.qty || 0) * Number(line.unit_price || 0)
  }, 0)

  function updateLine(index: number, patch: Partial<QuoteLine>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line))
    )
  }

  function handleItemChange(index: number, itemIdValue: string) {
    const itemId = itemIdValue ? Number(itemIdValue) : ''
    const item = typeof itemId === 'number' ? itemMap.get(itemId) : null

    updateLine(index, {
      item_id: itemId,
      unit_price: item?.sales_price ?? 0,
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

    if (!customerId) {
      setErrorMessage('거래처를 선택하십시오.')
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

    const quoteNo = makeQuoteNo()

    const { data: quoteData, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        quote_no: quoteNo,
        quote_date: quoteDate,
        customer_id: customerId,
        user_id: userId,
        status: 'draft',
        total_amount: totalAmount,
        remarks: remarks.trim() || null,
      })
      .select('id')
      .single()

    if (quoteError || !quoteData) {
      setIsSaving(false)
      setErrorMessage(getQuoteErrorMessage(quoteError ?? { message: '견적서 저장 실패' }))
      return
    }

    const createdId = quoteData.id as number

    const payload = lines.map((line, index) => ({
      quote_id: createdId,
      line_no: index + 1,
      item_id: line.item_id,
      qty: Number(line.qty) || 0,
      unit_price: Number(line.unit_price) || 0,
      amount: (Number(line.qty) || 0) * (Number(line.unit_price) || 0),
      remarks: null,
    }))

    const { error: lineError } = await supabase
      .from('quote_items')
      .insert(payload)

    if (lineError) {
      setIsSaving(false)
      setErrorMessage(getQuoteErrorMessage(lineError))
      return
    }

    setIsSaving(false)
    router.push(`/quotes/${createdId}`)
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">견적서 등록 화면을 준비하는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <Link href="/quotes" className="erp-back-link">
          ← 견적서 목록으로
        </Link>
        <div>
          <h1 className="erp-page-title">견적서 등록</h1>
          <p className="erp-page-desc">
            견적서 기본정보와 품목행을 입력합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="erp-page">
        <div className="erp-card">
          <h2 className="erp-card-title">기본정보</h2>

          <div className="erp-grid-2">
            <div className="erp-field">
              <label className="erp-label">견적일</label>
              <input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                className="erp-input"
              />
            </div>

            <div className="erp-field">
              <label className="erp-label">거래처</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
                className="erp-select"
              >
                <option value="">거래처 선택</option>
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
                placeholder="예: 교육용 샘플 견적"
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
                  key={index}
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

        <div className="erp-btn-row">
          <button
            type="submit"
            disabled={isSaving}
            className="erp-btn-primary"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          <Link href="/quotes" className="erp-btn-secondary">
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}