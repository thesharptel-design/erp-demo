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

type Quote = {
  id: number
  quote_no: string
  quote_date: string
  customer_id: number
  user_id: string
  status: string
  total_amount: number
  remarks: string | null
}

type QuoteItem = {
  id: number
  quote_id: number
  line_no: number
  item_id: number
  qty: number
  unit_price: number
  amount: number
}

type QuoteLine = {
  id?: number
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

export default function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()

  const [quoteId, setQuoteId] = useState<number | null>(null)
  const [quoteNo, setQuoteNo] = useState('')
  const [quoteDate, setQuoteDate] = useState('')
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('draft')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<QuoteLine[]>([])

  const [customers, setCustomers] = useState<Customer[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [items, setItems] = useState<Item[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [showActionButtons, setShowActionButtons] = useState(true)

  useEffect(() => {
    async function loadData() {
      const resolvedParams = await params
      const id = Number(resolvedParams.id)

      if (Number.isNaN(id)) {
        setErrorMessage('잘못된 견적서 경로입니다.')
        setIsLoading(false)
        return
      }

      const [
        { data: quote, error: quoteError },
        { data: quoteItems, error: quoteItemsError },
        { data: customersData, error: customersError },
        { data: usersData, error: usersError },
        { data: itemsData, error: itemsError },
      ] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', id).single(),
        supabase
          .from('quote_items')
          .select('*')
          .eq('quote_id', id)
          .order('line_no'),
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

      if (quoteError || !quote) {
        setErrorMessage('견적서 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (quoteItemsError) {
        setErrorMessage('견적 품목행 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      if (customersError || usersError || itemsError) {
        setErrorMessage('기초 데이터를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const typedQuote = quote as Quote
      const typedLines = ((quoteItems as QuoteItem[]) ?? []).map((line) => ({
        id: line.id,
        item_id: line.item_id,
        qty: line.qty,
        unit_price: line.unit_price,
      }))

      setQuoteId(typedQuote.id)
      setQuoteNo(typedQuote.quote_no)
      setQuoteDate(typedQuote.quote_date)
      setCustomerId(typedQuote.customer_id)
      setUserId(typedQuote.user_id)
      setStatus(typedQuote.status)
      setRemarks(typedQuote.remarks ?? '')
      setLines(typedLines.length > 0 ? typedLines : [{ item_id: '', qty: 1, unit_price: 0 }])

      setCustomers((customersData as Customer[]) ?? [])
      setUsers((usersData as AppUser[]) ?? [])
      setItems((itemsData as Item[]) ?? [])

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
    setSuccessMessage('')
    setActionMessage('')

    if (!quoteId) {
      setErrorMessage('견적서 정보가 올바르지 않습니다.')
      return
    }

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

    const { error: quoteError } = await supabase
      .from('quotes')
      .update({
        quote_date: quoteDate,
        customer_id: customerId,
        user_id: userId,
        total_amount: totalAmount,
        remarks: remarks.trim() || null,
      })
      .eq('id', quoteId)

    if (quoteError) {
      setIsSaving(false)
      setErrorMessage(getQuoteErrorMessage(quoteError))
      return
    }

    const { error: deleteError } = await supabase
      .from('quote_items')
      .delete()
      .eq('quote_id', quoteId)

    if (deleteError) {
      setIsSaving(false)
      setErrorMessage(getQuoteErrorMessage(deleteError))
      return
    }

    const payload = lines.map((line, index) => ({
      quote_id: quoteId,
      line_no: index + 1,
      item_id: line.item_id,
      qty: Number(line.qty) || 0,
      unit_price: Number(line.unit_price) || 0,
      amount: (Number(line.qty) || 0) * (Number(line.unit_price) || 0),
      remarks: null,
    }))

    const { error: lineInsertError } = await supabase
      .from('quote_items')
      .insert(payload)

    if (lineInsertError) {
      setIsSaving(false)
      setErrorMessage(getQuoteErrorMessage(lineInsertError))
      return
    }

    setIsSaving(false)
    setSuccessMessage('견적서 정보가 저장되었습니다.')
    router.refresh()
  }

  async function handlePrintPreview() {
    if (!quoteId) {
      setErrorMessage('견적서 정보가 올바르지 않습니다.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    const { error } = await supabase
      .from('quotes')
      .update({ status: 'approved' })
      .eq('id', quoteId)

    if (error) {
      setErrorMessage(getQuoteErrorMessage(error))
      return
    }

    setStatus('approved')
    setActionMessage(
      `견적서 ${quoteNo}가 출력되었습니다. 교육용 ERP로 해당 기능은 실제 구현하지 않았습니다.`
    )
    router.refresh()
  }

  async function handleEmailPreview() {
    if (!quoteId) {
      setErrorMessage('견적서 정보가 올바르지 않습니다.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setActionMessage('')

    const { error } = await supabase
      .from('quotes')
      .update({ status: 'approved' })
      .eq('id', quoteId)

    if (error) {
      setErrorMessage(getQuoteErrorMessage(error))
      return
    }

    setStatus('approved')
    setActionMessage(
      `견적서 ${quoteNo}가 이메일 발송 처리되었습니다. 교육용 ERP로 해당 기능은 실제 구현하지 않았습니다.`
    )
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">견적서 정보를 불러오는 중입니다...</p>
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
          <h1 className="erp-page-title">견적서 상세 / 수정</h1>
          <p className="erp-page-desc">
            견적서 기본정보와 품목행을 수정하고 출력/이메일 연출을 진행합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="erp-page">
        <div className="erp-card">
          <div className="erp-info-bar">
            견적번호: <span className="font-medium">{quoteNo}</span>
            <span className="mx-2">/</span>
            상태: <span className="font-medium">{status}</span>
          </div>

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
            </>
          )}

          <Link href="/quotes" className="erp-btn-secondary">
            목록으로
          </Link>
        </div>
      </form>
    </div>
  )
}