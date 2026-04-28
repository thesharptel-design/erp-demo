'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { supabase } from '@/lib/supabase'

type WarehouseOption = { id: number; name: string }

type MissingRow = {
  transaction_id: number | null
  inventory_id: number
  trans_date: string | null
  warehouse_id: number
  warehouse_name: string
  item_id: number
  item_code: string
  item_name: string
  qty: number
  lot_no: string | null
  exp_date: string | null
  serial_no: string | null
  need_lot: boolean
  need_exp: boolean
  need_sn: boolean
  missing_fields: string[]
  completed_qty: number
  total_qty: number
  progress_pct: number
}

function todayText() {
  return new Date().toISOString().slice(0, 10)
}

export default function InboundCompleteTrackingPage() {
  const [rows, setRows] = useState<MissingRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [dateFrom, setDateFrom] = useState(todayText())
  const [dateTo, setDateTo] = useState(todayText())
  const [warehouseId, setWarehouseId] = useState('all')
  const [itemKeyword, setItemKeyword] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(true)

  const [selectedInventoryId, setSelectedInventoryId] = useState<number | null>(null)
  const selectedRow = useMemo(
    () => rows.find((row) => row.inventory_id === selectedInventoryId) ?? null,
    [rows, selectedInventoryId]
  )

  const [lotNo, setLotNo] = useState('')
  const [expDate, setExpDate] = useState('')
  const [serialNo, setSerialNo] = useState('')
  const [reason, setReason] = useState('입고 후 추적정보 보완')
  const [lastTrackingByItemKey, setLastTrackingByItemKey] = useState<Record<string, { lotNo: string; expDate: string; serialNo: string }>>({})
  const [prefilledFromHistory, setPrefilledFromHistory] = useState(false)

  const selectedItemKey = useMemo(() => {
    if (!selectedRow) return ''
    return `${selectedRow.warehouse_id}:${selectedRow.item_id}`
  }, [selectedRow])

  useEffect(() => {
    if (!selectedRow) {
      setLotNo('')
      setExpDate('')
      setSerialNo('')
      setPrefilledFromHistory(false)
      return
    }
    const hasRowValue = Boolean(selectedRow.lot_no || selectedRow.exp_date || selectedRow.serial_no)
    if (hasRowValue) {
      setLotNo(selectedRow.lot_no ?? '')
      setExpDate(selectedRow.exp_date ?? '')
      setSerialNo(selectedRow.serial_no ?? '')
      setPrefilledFromHistory(false)
      return
    }

    const cached = lastTrackingByItemKey[selectedItemKey]
    if (cached) {
      setLotNo(cached.lotNo)
      setExpDate(cached.expDate)
      setSerialNo(cached.serialNo)
      setPrefilledFromHistory(true)
      return
    }

    setLotNo('')
    setExpDate('')
    setSerialNo('')
    setPrefilledFromHistory(false)
  }, [selectedItemKey, selectedRow, lastTrackingByItemKey])

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token ?? ''
      if (!accessToken) {
        setRows([])
        setWarehouses([])
        setError('로그인이 필요합니다.')
        return
      }

      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        item_keyword: itemKeyword,
        warehouse_id: warehouseId === 'all' ? '' : warehouseId,
        only_missing: String(onlyMissing),
      })
      const response = await fetch(`/api/inbound/tracking-missing?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result?.error ?? '누락건 조회에 실패했습니다.')
        setRows([])
        return
      }

      const nextRows = (result.rows ?? []) as MissingRow[]
      setRows(nextRows)
      setWarehouses((result.warehouses ?? []) as WarehouseOption[])
      if (nextRows.length > 0 && !nextRows.some((row) => row.inventory_id === selectedInventoryId)) {
        setSelectedInventoryId(nextRows[0].inventory_id)
      }
      if (nextRows.length === 0) {
        setSelectedInventoryId(null)
      }
    } catch (e: any) {
      setError(String(e?.message ?? e))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, itemKeyword, onlyMissing, selectedInventoryId, warehouseId])

  const handleRefresh = useCallback(() => {
    const today = todayText()
    setDateFrom(today)
    setDateTo(today)
    setWarehouseId('all')
    setItemKeyword('')
    setOnlyMissing(true)
    setSelectedInventoryId(null)
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const handleSave = async () => {
    if (!selectedRow) {
      setError('보완할 행을 선택해주세요.')
      return
    }
    if (!reason.trim()) {
      setError('보완 사유를 입력해주세요.')
      return
    }
    if (selectedRow.need_lot && !lotNo.trim()) {
      setError('LOT 관리 품목은 LOT 번호가 필수입니다.')
      return
    }
    if (selectedRow.need_exp && !expDate.trim()) {
      setError('EXP 관리 품목은 유효기간이 필수입니다.')
      return
    }
    if (selectedRow.need_sn && !serialNo.trim()) {
      setError('SN 관리 품목은 시리얼 번호가 필수입니다.')
      return
    }
    const completeQtyNum = 1

    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token ?? ''
      if (!accessToken) {
        setError('로그인이 필요합니다.')
        return
      }

      const response = await fetch('/api/inbound/complete-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          inventory_id: selectedRow.inventory_id,
          transaction_id: selectedRow.transaction_id,
          complete_qty: completeQtyNum,
          lot_no: lotNo.trim(),
          exp_date: expDate.trim(),
          serial_no: serialNo.trim(),
          reason: reason.trim(),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result?.error ?? '보완 저장에 실패했습니다.')
        return
      }

      if (selectedItemKey) {
        setLastTrackingByItemKey((prev) => ({
          ...prev,
          [selectedItemKey]: {
            lotNo: lotNo.trim(),
            expDate: expDate.trim(),
            serialNo: serialNo.trim(),
          },
        }))
      }
      setPrefilledFromHistory(false)
      setSuccess('추적정보 보완 저장이 완료되었습니다.')
      await loadRows()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 md:p-6">
      <div className="rounded-xl border-2 border-black bg-white p-4">
        <PageHeader
          title="입고 보완 입력"
          description="입고 후 누락된 SN/LOT/EXP를 보완합니다."
          className="gap-0"
          descriptionClassName="text-xs font-bold text-gray-500"
        />
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
      {success ? <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm font-bold text-green-700">{success}</div> : null}

      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm" />
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded border border-gray-300 px-3 py-2 text-sm">
            <option value="all">전체 창고</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={String(wh.id)}>
                {wh.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={itemKeyword}
            onChange={(e) => setItemKeyword(e.target.value)}
            placeholder="품목코드/품목명 검색"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-bold text-gray-700">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            미입력만
          </label>
          <button type="button" onClick={handleRefresh} className="rounded bg-black px-3 py-2 text-sm font-black text-white">
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-300 bg-white">
          <div className="border-b bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">누락건 목록 ({rows.length}건)</div>
          <div className="max-h-[520px] overflow-y-auto p-2">
            {loading ? (
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-8 text-center text-sm font-bold text-gray-500">불러오는 중...</div>
            ) : rows.length === 0 ? (
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-8 text-center text-sm font-bold text-gray-500">조건에 맞는 누락건이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <button
                    key={`${row.transaction_id}-${row.inventory_id}`}
                    type="button"
                    onClick={() => setSelectedInventoryId(row.inventory_id)}
                    className={`w-full rounded border p-3 text-left ${
                      selectedInventoryId === row.inventory_id ? 'border-black bg-black/5' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-black text-blue-700">{row.item_code}</span>
                      <span className="font-bold text-gray-800">{row.item_name}</span>
                    </div>
                    <div className="mt-1 text-xs font-bold text-gray-600">
                      {row.warehouse_name} · 잔여수량 {row.qty}
                      {row.trans_date ? ` · ${new Date(row.trans_date).toLocaleString('ko-KR')}` : ''}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                        진행 {row.progress_pct}% ({row.completed_qty}/{row.total_qty})
                      </span>
                      {row.missing_fields.length === 0 ? (
                        <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-black text-green-700">완료</span>
                      ) : (
                        row.missing_fields.map((field) => (
                          <span key={field} className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-700">
                            {field} 누락
                          </span>
                        ))
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-300 bg-white p-4">
          {!selectedRow ? (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-8 text-center text-sm font-bold text-gray-500">
              왼쪽 목록에서 보완할 행을 선택해주세요.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                <p className="font-black text-gray-800">
                  [{selectedRow.item_code}] {selectedRow.item_name}
                </p>
                <p className="mt-1 text-xs font-bold text-gray-600">
                  {selectedRow.warehouse_name} · 잔여수량 {selectedRow.qty}
                  {selectedRow.transaction_id ? ` · TX #${selectedRow.transaction_id}` : ''}
                </p>
                <p className="mt-1 text-xs font-black text-indigo-700">
                  진행률 {selectedRow.progress_pct}% (완료 {selectedRow.completed_qty} / 총 {selectedRow.total_qty})
                </p>
              </div>

              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
                보완은 1개 단위로 저장됩니다. 잔여 수량만큼 반복 입력해주세요.
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-black text-gray-600">LOT</label>
                  <input
                    type="text"
                    value={lotNo}
                    onChange={(e) => setLotNo(e.target.value)}
                    placeholder={selectedRow.need_lot ? 'LOT 필수' : '해당없음'}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${prefilledFromHistory && selectedRow.need_lot ? 'bg-gray-100 text-gray-700' : ''}`}
                    disabled={!selectedRow.need_lot}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-black text-gray-600">EXP</label>
                  <input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${prefilledFromHistory && selectedRow.need_exp ? 'bg-gray-100 text-gray-700' : ''}`}
                    disabled={!selectedRow.need_exp}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-black text-gray-600">SN</label>
                  <input
                    type="text"
                    value={serialNo}
                    onChange={(e) => setSerialNo(e.target.value)}
                    placeholder={selectedRow.need_sn ? 'SN 필수' : '해당없음'}
                    className={`w-full rounded border border-gray-300 px-3 py-2 text-sm ${prefilledFromHistory && selectedRow.need_sn ? 'bg-gray-100 text-gray-700' : ''}`}
                    disabled={!selectedRow.need_sn}
                  />
                </div>
              </div>

              {prefilledFromHistory ? (
                <p className="text-[11px] font-bold text-gray-500">
                  같은 품목의 최근 입력값을 불러왔습니다. 필요 시 수정 후 저장하세요.
                </p>
              ) : null}

              <div>
                <label className="mb-1 block text-xs font-black text-gray-600">보완 사유</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="보완 사유 입력"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="rounded bg-black px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  {saving ? '저장 중...' : '보완 저장'}
                </button>
                <Link href="/inbound/new" className="rounded border border-gray-300 px-4 py-3 text-center text-sm font-black text-gray-700">
                  입고 등록으로
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
