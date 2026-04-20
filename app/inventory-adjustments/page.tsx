'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SearchableCombobox from '@/components/SearchableCombobox'

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  item_type: string
  unit: string | null
  is_active: boolean
}

type InventoryRow = {
  id: number
  item_id: number
  warehouse_id: number
  current_qty: number
  available_qty: number
  quarantine_qty: number
  lot_no: string | null
  exp_date: string | null
  serial_no: string | null
}

type WarehouseRow = {
  id: number
  name: string
}

type AdjustmentType =
  | 'available_increase'
  | 'available_decrease'
  | 'quarantine_increase'
  | 'quarantine_decrease'

type AdjustmentPreviewRow = {
  item_id: number
  item_code: string
  item_name: string
  item_type: string
  unit: string | null
  current_qty: number
  available_qty: number
  quarantine_qty: number
}

function getItemTypeLabel(itemType: string) {
  switch (itemType) {
    case 'finished':
      return '완제품'
    case 'raw_material':
      return '원재료'
    case 'sub_material':
      return '부자재'
    default:
      return itemType
  }
}

export default function InventoryAdjustmentsPage() {
  const [items, setItems] = useState<ItemRow[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('')
  const [adjustmentType, setAdjustmentType] =
    useState<AdjustmentType>('available_increase')
  const [adjustQty, setAdjustQty] = useState('0')
  const [remarks, setRemarks] = useState('')

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setErrorMessage('')

      const [
        { data: itemsData, error: itemsError },
        { data: inventoryData, error: inventoryError },
        { data: warehouseData, error: warehouseError },
      ] = await Promise.all([
        supabase
          .from('items')
          .select('id, item_code, item_name, item_type, unit, is_active')
          .eq('is_active', true)
          .order('item_name'),
        supabase
          .from('inventory')
          .select('id, item_id, warehouse_id, current_qty, available_qty, quarantine_qty, lot_no, exp_date, serial_no')
          .order('item_id'),
        supabase
          .from('warehouses')
          .select('id, name')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
      ])

      if (itemsError || inventoryError || warehouseError) {
        console.error('inventory adjustment load error:', {
          itemsError,
          inventoryError,
          warehouseError,
        })
        setErrorMessage('재고조정 데이터를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      setItems((itemsData as ItemRow[]) ?? [])
      setInventoryRows((inventoryData as InventoryRow[]) ?? [])
      const nextWarehouses = (warehouseData as WarehouseRow[]) ?? []
      setWarehouses(nextWarehouses)
      if (!selectedWarehouseId && nextWarehouses[0]?.id) {
        setSelectedWarehouseId(nextWarehouses[0].id)
      }
      setIsLoading(false)
    }

    loadData()
  }, [selectedWarehouseId])

  const inventoryMap = useMemo(() => {
    return new Map(
      inventoryRows.map((row) => [
        `${row.item_id}:${row.warehouse_id}`,
        {
          id: row.id,
          current_qty: Number(row.current_qty ?? 0),
          available_qty: Number(row.available_qty ?? 0),
          quarantine_qty: Number(row.quarantine_qty ?? 0),
        },
      ])
    )
  }, [inventoryRows])

  const filteredItems = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()

    return items.filter((item) => {
      if (!keyword) return true

      return (
        item.item_code.toLowerCase().includes(keyword) ||
        item.item_name.toLowerCase().includes(keyword)
      )
    })
  }, [items, searchKeyword])

  const previewRows: AdjustmentPreviewRow[] = useMemo(() => {
    return filteredItems.map((item) => {
      const inventory =
        selectedWarehouseId
          ? inventoryMap.get(`${item.id}:${selectedWarehouseId}`)
          : undefined

      return {
        item_id: item.id,
        item_code: item.item_code,
        item_name: item.item_name,
        item_type: item.item_type,
        unit: item.unit,
        current_qty: inventory?.current_qty ?? 0,
        available_qty: inventory?.available_qty ?? 0,
        quarantine_qty: inventory?.quarantine_qty ?? 0,
      }
    })
  }, [filteredItems, inventoryMap, selectedWarehouseId])

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    const item = items.find((row) => row.id === selectedItemId)
    if (!item) return null

    const inventory =
      selectedWarehouseId
        ? inventoryMap.get(`${item.id}:${selectedWarehouseId}`)
        : undefined

    return {
      ...item,
      current_qty: inventory?.current_qty ?? 0,
      available_qty: inventory?.available_qty ?? 0,
      quarantine_qty: inventory?.quarantine_qty ?? 0,
    }
  }, [selectedItemId, items, inventoryMap, selectedWarehouseId])
  const warehouseOptions = useMemo(
    () => warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] })),
    [warehouses]
  )
  const itemOptions = useMemo(
    () =>
      items.map((item) => ({
        value: String(item.id),
        label: `${item.item_code} / ${item.item_name}`,
        keywords: [item.item_code, item.item_name],
      })),
    [items]
  )
  const adjustmentTypeOptions = useMemo(
    () => [
      { value: 'available_increase', label: '사용가능재고 증가' },
      { value: 'available_decrease', label: '사용가능재고 감소' },
      { value: 'quarantine_increase', label: '격리재고 증가' },
      { value: 'quarantine_decrease', label: '격리재고 감소' },
    ],
    []
  )

  async function handleSaveAdjustment() {
    setErrorMessage('')
    setSuccessMessage('')

    if (!selectedItemId) {
      setErrorMessage('조정할 품목을 선택하십시오.')
      return
    }
    if (!selectedWarehouseId) {
      setErrorMessage('조정 대상 창고를 선택하십시오.')
      return
    }

    const qty = Number(adjustQty)

    if (!qty || qty <= 0) {
      setErrorMessage('조정 수량은 0보다 커야 합니다.')
      return
    }

    if (!remarks.trim()) {
      setErrorMessage('조정 사유를 입력하십시오.')
      return
    }

    setIsSaving(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch('/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          item_id: selectedItemId,
          warehouse_id: selectedWarehouseId,
          adjustment_type: adjustmentType,
          qty,
          remarks: remarks.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setErrorMessage(result?.error ?? '재고조정 중 오류가 발생했습니다.')
        setIsSaving(false)
        return
      }

      setSuccessMessage('재고조정이 저장되었습니다.')
      setAdjustQty('0')
      setRemarks('')

      const { data: inventoryData, error: inventoryError } = await supabase
        .from('inventory')
        .select('id, item_id, warehouse_id, current_qty, available_qty, quarantine_qty, lot_no, exp_date, serial_no')
        .order('item_id')

      if (!inventoryError) {
        setInventoryRows((inventoryData as InventoryRow[]) ?? [])
      }
    } catch (error) {
      console.error(error)
      setErrorMessage('재고조정 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">재고조정 화면을 불러오는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <div>
          <h1 className="erp-page-title">재고조정</h1>
          <p className="erp-page-desc">
            품목별 사용가능재고와 격리재고를 조정하고, 조정 이력을 기록합니다.
          </p>
        </div>
      </div>

      {errorMessage && <div className="erp-alert-error">{errorMessage}</div>}
      {successMessage && <div className="erp-alert-success">{successMessage}</div>}

      <div className="erp-card">
        <h2 className="erp-card-title">조정 입력</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="erp-field">
            <label className="erp-label">창고 선택</label>
            <SearchableCombobox
              value={selectedWarehouseId ? String(selectedWarehouseId) : ''}
              onChange={(v) => setSelectedWarehouseId(v ? Number(v) : '')}
              options={warehouseOptions}
              placeholder="창고 선택"
            />
          </div>

          <div className="erp-field">
            <label className="erp-label">품목 선택</label>
            <SearchableCombobox
              value={selectedItemId ? String(selectedItemId) : ''}
              onChange={(v) => setSelectedItemId(v ? Number(v) : '')}
              options={itemOptions}
              placeholder="품목 선택"
            />
          </div>

          <div className="erp-field">
            <label className="erp-label">조정 유형</label>
            <SearchableCombobox
              value={adjustmentType}
              onChange={(v) => setAdjustmentType(v as AdjustmentType)}
              options={adjustmentTypeOptions}
              placeholder="조정 유형"
            />
          </div>

          <div className="erp-field">
            <label className="erp-label">조정 수량</label>
            <input
              type="number"
              min={1}
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              className="erp-input"
            />
          </div>

          <div className="erp-field">
            <label className="erp-label">조정 대상 정보</label>
            <div className="erp-readonly-box">
              {selectedItem
                ? `${selectedItem.item_code} / ${selectedItem.item_name}`
                : '-'}
            </div>
          </div>

          <div className="erp-field">
            <label className="erp-label">총재고</label>
            <div className="erp-readonly-box">
              {selectedItem ? selectedItem.current_qty : '-'}
            </div>
          </div>

          <div className="erp-field">
            <label className="erp-label">사용가능재고</label>
            <div className="erp-readonly-box">
              {selectedItem ? selectedItem.available_qty : '-'}
            </div>
          </div>

          <div className="erp-field">
            <label className="erp-label">격리재고</label>
            <div className="erp-readonly-box">
              {selectedItem ? selectedItem.quarantine_qty : '-'}
            </div>
          </div>

          <div className="erp-field">
            <label className="erp-label">품목유형</label>
            <div className="erp-readonly-box">
              {selectedItem ? getItemTypeLabel(selectedItem.item_type) : '-'}
            </div>
          </div>

          <div className="erp-field md:col-span-2 xl:col-span-4">
            <label className="erp-label">조정 사유</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              className="erp-textarea"
              placeholder="예: 실사 차이 반영, 테스트 재고 보정, 오입력 수정"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveAdjustment}
            disabled={isSaving}
            className="erp-btn-primary"
          >
            {isSaving ? '조정 중...' : '재고조정 저장'}
          </button>
        </div>
      </div>

      <div className="erp-card">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="erp-card-title !mb-0">품목별 재고 현황</h2>
            <p className="mt-1 text-sm text-gray-500">
              검색 후 현재 총재고, 사용가능재고, 격리재고를 확인할 수 있습니다.
            </p>
          </div>

          <div className="w-full md:w-80">
            <label className="erp-label">품목 검색</label>
            <input
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="erp-input"
              placeholder="품목코드 또는 품목명 검색"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">품목코드</th>
                <th className="px-4 py-3">품목명</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3">단위</th>
                <th className="px-4 py-3">총재고</th>
                <th className="px-4 py-3">사용가능재고</th>
                <th className="px-4 py-3">격리재고</th>
                <th className="px-4 py-3">선택</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                    조회 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr key={row.item_id} className="border-t border-gray-100">
                    <td className="px-4 py-3">{row.item_code}</td>
                    <td className="px-4 py-3 font-medium">{row.item_name}</td>
                    <td className="px-4 py-3">{getItemTypeLabel(row.item_type)}</td>
                    <td className="px-4 py-3">{row.unit ?? '-'}</td>
                    <td className="px-4 py-3">{row.current_qty}</td>
                    <td className="px-4 py-3">{row.available_qty}</td>
                    <td className="px-4 py-3">{row.quarantine_qty}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedItemId(row.item_id)}
                        className="erp-btn-secondary"
                      >
                        선택
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}