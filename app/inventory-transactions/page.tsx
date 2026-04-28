'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  InventoryTransferCommandCombobox,
  type TransferComboboxOption,
} from '@/app/inventory-transfers/new/InventoryTransferCommandCombobox'
import { ChevronDown, ChevronRight, FilterX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import PageHeader from '@/components/PageHeader'
import InlineAlertMirror from '@/components/InlineAlertMirror'
import { formatTransactionRemarksForDisplay } from '@/lib/inventory-transaction-remarks'
import { cn } from '@/lib/utils'

type Warehouse = {
  id: number
  name: string
}

type TxRow = {
  id: number
  trans_date: string
  trans_type: string
  qty: number
  remarks: string | null
  created_by: string | null
  lot_no: string | null
  serial_no: string | null
  exp_date: string | null
  warehouse_id: number | null
  inventory_id: number | null
  items?: { item_code: string; item_name: string; unit: string | null; process_metadata?: unknown } | null
  warehouses?: { name: string | null } | null
  processor_name?: string
}

type TxFilter = 'ALL' | 'IN' | 'OUT'

type SummaryGroup = {
  key: string
  dateKey: string
  direction: 'IN' | 'OUT' | 'NEUTRAL'
  transDate: string
  qty: number
  itemCode: string
  itemName: string
  unit: string | null
  warehouseName: string | null
  processorName: string | null
  remarks: string
  rows: TxRow[]
}

const IN_TYPES = new Set(['IN', 'PROD_IN', 'QC_RELEASE', 'CANCEL_IN'])
const OUT_TYPES = new Set(['OUT', 'MATL_OUT'])
const PAGE_SIZE_OPTIONS = [20, 25, 30, 50] as const
/** Empty-looking trigger; popover uses `commandInputPlaceholder`. */
const FILTER_TRIGGER_PLACEHOLDER = '\u00A0'

function transDateDayKey(iso: string): string {
  const s = String(iso ?? '').trim()
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  try {
    return new Date(s).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function transDateSecondKey(iso: string): string {
  const s = String(iso ?? '').trim()
  if (!s) return ''
  try {
    return new Date(s).toISOString().slice(0, 19)
  } catch {
    return s
  }
}

export default function InventoryTransactionsPage() {
  const [transactions, setTransactions] = useState<TxRow[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [filter, setFilter] = useState<TxFilter>('ALL')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState('')
  const [itemFilter, setItemFilter] = useState('')
  const [remarksFilter, setRemarksFilter] = useState('')
  const [processorFilter, setProcessorFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25)
  const [expandedSummaryKeys, setExpandedSummaryKeys] = useState<string[]>([])

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(null)
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token ?? ''

      if (!accessToken) {
        setWarehouses([])
        setTransactions([])
        setWarehouseFilter('all')
        setLoading(false)
        return
      }

      const res = await fetch('/api/inventory/transactions', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      const payload = (await res.json()) as {
        error?: string
        transactions?: TxRow[]
        warehouses?: Warehouse[]
      }

      if (!res.ok) {
        setFetchError(payload.error ?? `조회 실패 (${res.status})`)
        setWarehouses([])
        setTransactions([])
        setLoading(false)
        return
      }

      setWarehouses(payload.warehouses ?? [])
      setTransactions(payload.transactions ?? [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '데이터 로드 실패'
      setFetchError(message)
      console.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTransactions()
  }, [fetchTransactions])

  useEffect(() => {
    const validIds = new Set(warehouses.map((w) => String(w.id)))
    if (warehouseFilter !== 'all' && !validIds.has(warehouseFilter)) {
      setWarehouseFilter('all')
    }
  }, [warehouses, warehouseFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [filter, warehouseFilter, dateFilter, itemFilter, remarksFilter, processorFilter, pageSize])

  useEffect(() => {
    setExpandedSummaryKeys([])
  }, [filter, warehouseFilter, dateFilter, itemFilter, remarksFilter, processorFilter])

  const dateFilterOptions = useMemo<TransferComboboxOption[]>(() => {
    const set = new Set<string>()
    for (const tx of transactions) {
      const k = transDateDayKey(tx.trans_date)
      if (k) set.add(k)
    }
    return Array.from(set)
      .sort((a, b) => b.localeCompare(a))
      .map((d) => ({
        value: d,
        label: new Date(d + 'T12:00:00').toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
        }),
        keywords: [d],
      }))
  }, [transactions])

  const itemFilterOptions = useMemo<TransferComboboxOption[]>(() => {
    const map = new Map<string, string>()
    for (const tx of transactions) {
      const code = (tx.items?.item_code ?? '').trim()
      if (!code) continue
      if (!map.has(code)) map.set(code, (tx.items?.item_name ?? '').trim())
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
      .map(([code, name]) => ({
        value: code,
        label: name ? `[${code}] ${name}` : code,
        keywords: [code, name],
      }))
  }, [transactions])

  const warehouseFilterOptions = useMemo<TransferComboboxOption[]>(
    () => [
      { value: 'all', label: '전체 창고', keywords: ['전체'] },
      ...warehouses.map((wh) => ({
        value: String(wh.id),
        label: wh.name,
        keywords: [wh.name],
      })),
    ],
    [warehouses]
  )

  const remarksFilterOptions = useMemo<TransferComboboxOption[]>(() => {
    const set = new Set<string>()
    for (const tx of transactions) {
      const r = (tx.remarks ?? '').trim()
      if (r) set.add(r)
    }
    const rows = Array.from(set).sort((a, b) => b.localeCompare(a))
    const opts: TransferComboboxOption[] = []
    if (transactions.some((tx) => !(tx.remarks ?? '').trim())) {
      opts.push({ value: '__EMPTY__', label: '(비고 없음)', keywords: ['비고', '없음'] })
    }
    for (const r of rows.slice(0, 200)) {
      opts.push({
        value: r,
        label: r.length > 72 ? `${r.slice(0, 72)}…` : r,
        keywords: [r],
      })
    }
    return opts
  }, [transactions])

  const processorFilterOptions = useMemo<TransferComboboxOption[]>(() => {
    const set = new Set<string>()
    for (const tx of transactions) {
      const p = (tx.processor_name ?? '').trim()
      if (p) set.add(p)
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((p) => ({ value: p, label: p, keywords: [p] }))
  }, [transactions])

  const resolveDirection = (tx: TxRow): 'IN' | 'OUT' | 'NEUTRAL' => {
    if (IN_TYPES.has(tx.trans_type)) return 'IN'
    if (OUT_TYPES.has(tx.trans_type)) return 'OUT'
    if (tx.trans_type === 'ADJUST') {
      if ((tx.remarks ?? '').includes('증가')) return 'IN'
      if ((tx.remarks ?? '').includes('감소')) return 'OUT'
    }
    return 'NEUTRAL'
  }

  const getTypeLabel = (tx: TxRow) => {
    const direction = resolveDirection(tx)
    if (direction === 'IN')
      return (
        <Badge className="border-blue-200 bg-blue-100 font-semibold text-blue-800 hover:bg-blue-100">입고</Badge>
      )
    if (direction === 'OUT')
      return (
        <Badge className="border-red-200 bg-red-100 font-semibold text-red-800 hover:bg-red-100">출고</Badge>
      )
    return (
      <Badge variant="secondary" className="font-semibold">
        조정
      </Badge>
    )
  }

  const getSignedQty = (tx: TxRow) => {
    const direction = resolveDirection(tx)
    if (direction === 'OUT') return `-${tx.qty}`
    return `+${tx.qty}`
  }

  const filteredData = useMemo(() => {
    return transactions.filter((tx) => {
      const direction = resolveDirection(tx)
      const matchType =
        filter === 'ALL' ||
        (filter === 'IN' && direction === 'IN') ||
        (filter === 'OUT' && direction === 'OUT')

      if (dateFilter) {
        if (transDateDayKey(tx.trans_date) !== dateFilter) return false
      }

      if (itemFilter) {
        if ((tx.items?.item_code ?? '').trim() !== itemFilter) return false
      }

      if (warehouseFilter !== 'all') {
        if (String(tx.warehouse_id ?? '') !== warehouseFilter) return false
      }

      if (remarksFilter) {
        if (remarksFilter === '__EMPTY__') {
          if ((tx.remarks ?? '').trim()) return false
        } else if ((tx.remarks ?? '').trim() !== remarksFilter) {
          return false
        }
      }

      if (processorFilter) {
        if ((tx.processor_name ?? '').trim() !== processorFilter) return false
      }

      return matchType
    })
  }, [
    transactions,
    filter,
    warehouseFilter,
    dateFilter,
    itemFilter,
    remarksFilter,
    processorFilter,
  ])

  const summaryGroups = useMemo<SummaryGroup[]>(() => {
    const groups = new Map<string, SummaryGroup>()
    for (const tx of filteredData) {
      const direction = resolveDirection(tx)
      const dayKey = transDateDayKey(tx.trans_date)
      const secondKey = transDateSecondKey(tx.trans_date)
      const itemCode = (tx.items?.item_code ?? '').trim()
      const warehouseName = tx.warehouses?.name ?? null
      const processorName = tx.processor_name ?? null
      const remarks = formatTransactionRemarksForDisplay(tx.remarks, tx.warehouses?.name) || ''
      const key = [dayKey, secondKey, direction, itemCode, String(tx.warehouse_id ?? ''), processorName ?? '', remarks].join('|')

      const prev = groups.get(key)
      if (!prev) {
        groups.set(key, {
          key,
          dateKey: dayKey,
          direction,
          transDate: tx.trans_date,
          qty: Number(tx.qty ?? 0),
          itemCode,
          itemName: tx.items?.item_name ?? '',
          unit: tx.items?.unit ?? null,
          warehouseName,
          processorName,
          remarks,
          rows: [tx],
        })
        continue
      }

      prev.qty += Number(tx.qty ?? 0)
      prev.rows.push(tx)
      if (new Date(tx.trans_date).getTime() > new Date(prev.transDate).getTime()) {
        prev.transDate = tx.trans_date
      }
    }
    return Array.from(groups.values()).sort((a, b) => new Date(b.transDate).getTime() - new Date(a.transDate).getTime())
  }, [filteredData])

  const pagedRows = summaryGroups

  const totalPages = Math.max(1, Math.ceil(pagedRows.length / pageSize))

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return pagedRows.slice(start, start + pageSize)
  }, [pagedRows, currentPage, pageSize])

  const comboTrigger = 'h-9 min-h-9 w-full shrink-0 px-2 text-xs font-medium'

  const resetColumnFilters = useCallback(() => {
    setFilter('ALL')
    setWarehouseFilter('all')
    setDateFilter('')
    setItemFilter('')
    setRemarksFilter('')
    setProcessorFilter('')
  }, [])

  const handleRefresh = useCallback(() => {
    resetColumnFilters()
    setCurrentPage(1)
    setExpandedSummaryKeys([])
    void fetchTransactions()
  }, [fetchTransactions, resetColumnFilters])

  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
      <PageHeader
        title="입출고 현황 (수불부)"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
            새로고침
          </Button>
        }
      />

      {fetchError ? <InlineAlertMirror message={fetchError} variant="error" /> : null}

      <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border shadow-sm">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-6">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={filter === 'ALL' ? 'default' : 'outline'}
                size="sm"
                className="min-h-9 flex-1 sm:flex-none"
                onClick={() => setFilter('ALL')}
              >
                전체
              </Button>
              <Button
                type="button"
                variant={filter === 'IN' ? 'default' : 'outline'}
                size="sm"
                className="min-h-9 flex-1 sm:flex-none"
                onClick={() => setFilter('IN')}
              >
                입고
              </Button>
              <Button
                type="button"
                variant={filter === 'OUT' ? 'default' : 'outline'}
                size="sm"
                className="min-h-9 flex-1 sm:flex-none"
                onClick={() => setFilter('OUT')}
              >
                출고
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                title="열 필터 초기화"
                aria-label="열 필터 초기화"
                onClick={resetColumnFilters}
              >
                <FilterX className="size-3.5" aria-hidden />
              </Button>
            </div>
          </div>

          <div className="flex min-h-[min(60vh,32rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[56rem] table-fixed border-collapse text-left text-sm text-card-foreground">
                <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 backdrop-blur-sm">
                  <tr>
                    <th className="w-[10.5rem] min-w-[9.25rem] align-top px-2 py-2 text-right md:w-[11.5rem] md:px-3">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">일시</span>
                      <InventoryTransferCommandCombobox
                        value={dateFilter}
                        onChange={setDateFilter}
                        options={dateFilterOptions}
                        placeholder={FILTER_TRIGGER_PLACEHOLDER}
                        commandInputPlaceholder="검색…"
                        emptyText="일자 목록이 없습니다."
                        disabled={transactions.length === 0}
                        triggerClassName={comboTrigger}
                      />
                    </th>
                    <th className="w-[4.5rem] min-w-[4rem] align-top px-2 py-2 text-center md:px-3">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">구분</span>
                      <div className="h-9 shrink-0" aria-hidden />
                    </th>
                    <th className="min-w-[12rem] align-top px-2 py-2 md:min-w-[14rem] md:px-3">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">품목</span>
                      <InventoryTransferCommandCombobox
                        value={itemFilter}
                        onChange={setItemFilter}
                        options={itemFilterOptions}
                        placeholder={FILTER_TRIGGER_PLACEHOLDER}
                        commandInputPlaceholder="검색…"
                        emptyText="품목이 없습니다."
                        disabled={transactions.length === 0}
                        triggerClassName={comboTrigger}
                      />
                    </th>
                    <th className="min-w-[8.5rem] align-top px-2 py-2 md:min-w-[10rem] md:px-3">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">창고</span>
                      <InventoryTransferCommandCombobox
                        value={warehouseFilter}
                        onChange={setWarehouseFilter}
                        options={warehouseFilterOptions}
                        placeholder={FILTER_TRIGGER_PLACEHOLDER}
                        commandInputPlaceholder="검색…"
                        showClearOption={false}
                        triggerPlaceholderValues={['all']}
                        disabled={transactions.length === 0}
                        triggerClassName={comboTrigger}
                      />
                    </th>
                    <th className="w-[5.5rem] min-w-[4.5rem] align-top px-2 py-2 text-right md:px-3">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">수량</span>
                      <div className="h-9 shrink-0" aria-hidden />
                    </th>
                    <th className="hidden min-w-[8rem] max-w-[18rem] align-top px-2 py-2 lg:table-cell md:px-3">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">비고</span>
                      <InventoryTransferCommandCombobox
                        value={remarksFilter}
                        onChange={setRemarksFilter}
                        options={remarksFilterOptions}
                        placeholder={FILTER_TRIGGER_PLACEHOLDER}
                        commandInputPlaceholder="검색…"
                        emptyText="비고 목록이 없습니다."
                        disabled={transactions.length === 0}
                        triggerClassName={comboTrigger}
                      />
                    </th>
                    <th className="hidden min-w-[6rem] align-top px-2 py-2 text-center xl:table-cell md:px-3">
                      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">처리자</span>
                      <InventoryTransferCommandCombobox
                        value={processorFilter}
                        onChange={setProcessorFilter}
                        options={processorFilterOptions}
                        placeholder={FILTER_TRIGGER_PLACEHOLDER}
                        commandInputPlaceholder="검색…"
                        emptyText="처리자 없음"
                        disabled={transactions.length === 0}
                        triggerClassName={comboTrigger}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                        불러오는 중…
                      </td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                        조건에 맞는 입출고 내역이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    (pageRows as SummaryGroup[]).map((group) => {
                      if (group.rows.length <= 1) {
                        const tx = group.rows[0]
                        const dir = resolveDirection(tx)
                        return (
                          <tr key={tx.id} className="transition-colors hover:bg-muted/40">
                            <td className="whitespace-nowrap px-2 py-3 text-right text-xs font-medium text-muted-foreground md:px-3">
                              {new Date(tx.trans_date).toLocaleString('ko-KR', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-2 py-3 text-center md:px-3">{getTypeLabel(tx)}</td>
                            <td className="min-w-0 px-2 py-3 md:px-3">
                              <div className="truncate font-semibold text-foreground" title={tx.items?.item_name ?? ''}>
                                {tx.items?.item_name || '—'}
                              </div>
                              <div className="mt-0.5 truncate text-xs font-medium text-primary" title={tx.items?.item_code ?? ''}>
                                {tx.items?.item_code ?? '—'}
                              </div>
                            </td>
                            <td className="min-w-0 whitespace-normal break-words px-2 py-3 text-sm font-medium text-foreground md:px-3">
                              {tx.warehouses?.name ?? <span className="text-muted-foreground">—</span>}
                            </td>
                            <td
                              className={cn(
                                'whitespace-nowrap px-2 py-3 text-right text-base font-semibold tabular-nums md:px-3 md:text-lg',
                                dir === 'OUT' ? 'text-destructive' : 'text-primary'
                              )}
                            >
                              {getSignedQty(tx)}
                              <span className="ml-1 text-xs font-medium text-muted-foreground">{tx.items?.unit}</span>
                            </td>
                            <td className="hidden min-w-0 max-w-[18rem] px-2 py-3 lg:table-cell md:px-3">
                              <div
                                className="whitespace-normal break-words text-sm leading-snug text-muted-foreground"
                                title={formatTransactionRemarksForDisplay(tx.remarks, tx.warehouses?.name)}
                              >
                                {formatTransactionRemarksForDisplay(tx.remarks, tx.warehouses?.name) || '—'}
                              </div>
                              {(tx.lot_no || tx.serial_no) && (
                                <div className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground">
                                  {tx.lot_no ? `[LOT: ${tx.lot_no}]` : ''} {tx.serial_no ? `[SN: ${tx.serial_no}]` : ''}
                                </div>
                              )}
                            </td>
                            <td className="hidden whitespace-nowrap px-2 py-3 text-center text-sm font-medium text-foreground xl:table-cell md:px-3">
                              {tx.processor_name ?? '—'}
                            </td>
                          </tr>
                        )
                      }

                      const isExpanded = expandedSummaryKeys.includes(group.key)
                      const signedQty = group.direction === 'OUT' ? `-${group.qty}` : `+${group.qty}`
                      return (
                        <React.Fragment key={`summary-wrap-${group.key}`}>
                          <tr key={`summary-${group.key}`} className="transition-colors hover:bg-muted/40">
                            <td className="whitespace-nowrap px-2 py-3 text-right text-xs font-medium text-muted-foreground md:px-3">
                              <div className="inline-flex items-center">
                                <button
                                  type="button"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-background text-[10px]"
                                  onClick={() =>
                                    setExpandedSummaryKeys((prev) =>
                                      prev.includes(group.key) ? prev.filter((key) => key !== group.key) : [...prev, group.key]
                                    )
                                  }
                                  aria-label={isExpanded ? '상세 접기' : '상세 펼치기'}
                                >
                                  {isExpanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
                                </button>
                                <span className="ml-1.5">
                                  {new Date(group.transDate).toLocaleString('ko-KR', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            </td>
                            <td className="px-2 py-3 text-center md:px-3">{group.direction === 'IN' ? <Badge className="border-blue-200 bg-blue-100 font-semibold text-blue-800 hover:bg-blue-100">입고</Badge> : group.direction === 'OUT' ? <Badge className="border-red-200 bg-red-100 font-semibold text-red-800 hover:bg-red-100">출고</Badge> : <Badge variant="secondary" className="font-semibold">조정</Badge>}</td>
                            <td className="min-w-0 px-2 py-3 md:px-3">
                              <div className="truncate font-semibold text-foreground" title={group.itemName}>
                                {group.itemName || '—'}
                              </div>
                              <div className="mt-0.5 truncate text-xs font-medium text-primary" title={group.itemCode}>
                                {group.itemCode || '—'}
                              </div>
                            </td>
                            <td className="min-w-0 whitespace-normal break-words px-2 py-3 text-sm font-medium text-foreground md:px-3">
                              {group.warehouseName ?? <span className="text-muted-foreground">—</span>}
                            </td>
                            <td
                              className={cn(
                                'whitespace-nowrap px-2 py-3 text-right text-base font-semibold tabular-nums md:px-3 md:text-lg',
                                group.direction === 'OUT' ? 'text-destructive' : 'text-primary'
                              )}
                            >
                              {signedQty}
                              <span className="ml-1 text-xs font-medium text-muted-foreground">{group.unit}</span>
                            </td>
                            <td className="hidden min-w-0 max-w-[18rem] px-2 py-3 lg:table-cell md:px-3">
                              <div className="whitespace-normal break-words text-sm leading-snug text-muted-foreground" title={group.remarks}>
                                {group.remarks || '—'}
                              </div>
                            </td>
                            <td className="hidden whitespace-nowrap px-2 py-3 text-center text-sm font-medium text-foreground xl:table-cell md:px-3">
                              {group.processorName ?? '—'}
                            </td>
                          </tr>
                          {isExpanded
                            ? group.rows.map((tx) => {
                                const dir = resolveDirection(tx)
                                return (
                                  <tr key={`detail-${group.key}-${tx.id}`} className="bg-muted/20">
                                    <td className="whitespace-nowrap px-2 py-2 text-right text-xs font-medium text-muted-foreground md:px-3">
                                      └ {new Date(tx.trans_date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </td>
                                    <td className="px-2 py-2 text-center md:px-3">{getTypeLabel(tx)}</td>
                                    <td className="min-w-0 px-2 py-2 md:px-3">
                                      <div className="truncate font-semibold text-foreground" title={tx.items?.item_name ?? ''}>
                                        {tx.items?.item_name || '—'}
                                      </div>
                                      <div className="mt-0.5 truncate text-xs font-medium text-primary" title={tx.items?.item_code ?? ''}>
                                        {tx.items?.item_code ?? '—'}
                                      </div>
                                    </td>
                                    <td className="min-w-0 whitespace-normal break-words px-2 py-2 text-sm font-medium text-foreground md:px-3">
                                      {tx.warehouses?.name ?? <span className="text-muted-foreground">—</span>}
                                    </td>
                                    <td
                                      className={cn(
                                        'whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums md:px-3',
                                        dir === 'OUT' ? 'text-destructive' : 'text-primary'
                                      )}
                                    >
                                      {getSignedQty(tx)}
                                      <span className="ml-1 text-xs font-medium text-muted-foreground">{tx.items?.unit}</span>
                                    </td>
                                    <td className="hidden min-w-0 max-w-[18rem] px-2 py-2 lg:table-cell md:px-3">
                                      <div
                                        className="whitespace-normal break-words text-xs leading-snug text-muted-foreground"
                                        title={formatTransactionRemarksForDisplay(tx.remarks, tx.warehouses?.name)}
                                      >
                                        {formatTransactionRemarksForDisplay(tx.remarks, tx.warehouses?.name) || '—'}
                                      </div>
                                      {(tx.lot_no || tx.serial_no) && (
                                        <div className="mt-1 text-[10px] font-medium tracking-wide text-muted-foreground">
                                          {tx.lot_no ? `[LOT: ${tx.lot_no}]` : ''} {tx.serial_no ? `[SN: ${tx.serial_no}]` : ''}
                                        </div>
                                      )}
                                    </td>
                                    <td className="hidden whitespace-nowrap px-2 py-2 text-center text-xs font-medium text-foreground xl:table-cell md:px-3">
                                      {tx.processor_name ?? '—'}
                                    </td>
                                  </tr>
                                )
                              })
                            : null}
                        </React.Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!loading && filteredData.length > 0 ? (
            <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-muted/30 px-2 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
                <span>페이지당</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
                    setCurrentPage(1)
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-medium text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="페이지당 행 수"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}건
                    </option>
                  ))}
                </select>
                <span>
                  · 총 <span className="font-semibold text-foreground">{pagedRows.length}</span>건 ·{' '}
                  <span className="font-semibold text-foreground">{currentPage}</span> / {totalPages} 페이지
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                >
                  처음
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  이전
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  다음
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[3.5rem] px-2 text-xs font-medium"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                >
                  마지막
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
