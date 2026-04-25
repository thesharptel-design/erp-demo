'use client'

import { useEffect, useMemo, useState } from 'react'
import SearchableCombobox from '@/components/SearchableCombobox'
import { supabase } from '@/lib/supabase'
import { getAllowedWarehouseIds, getCurrentUserPermissions, hasManagePermission } from '@/lib/permissions'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

type Warehouse = {
  id: number
  code: string | null
  name: string
}

type InventoryRow = {
  id: number
  item_id: number
  warehouse_id: number
  current_qty: number
  available_qty: number
  lot_no: string | null
  exp_date: string | null
  serial_no: string | null
}

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  unit: string | null
}

export default function NewInventoryTransferPage() {
  const [isLoading, setIsLoading] = useState(true)
  const { isSubmitting: isSaving, run: runSingleSubmit } = useSingleSubmit()
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<number[] | null>([])
  const [isTransferAllowed, setIsTransferAllowed] = useState(true)

  const [sourceInventoryId, setSourceInventoryId] = useState('')
  const [toWarehouseId, setToWarehouseId] = useState('')
  const [transferQty, setTransferQty] = useState('1')
  const [remarks, setRemarks] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    setErrorMessage('')
    const currentUser = await getCurrentUserPermissions()
    const canTransfer =
      !!currentUser &&
      hasManagePermission(currentUser, 'can_material_manage')
    setIsTransferAllowed(canTransfer)
    if (!canTransfer) {
      setWarehouses([])
      setInventoryRows([])
      setItems([])
      setIsLoading(false)
      return
    }
    const nextAllowedWarehouseIds = await getAllowedWarehouseIds(currentUser)
    setAllowedWarehouseIds(nextAllowedWarehouseIds)

    let warehouseQuery = supabase
      .from('warehouses')
      .select('id, code, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    let inventoryQuery = supabase
      .from('inventory')
      .select('id, item_id, warehouse_id, current_qty, available_qty, lot_no, exp_date, serial_no')
      .gt('available_qty', 0)
      .order('id', { ascending: true })

    if (nextAllowedWarehouseIds !== null) {
      if (nextAllowedWarehouseIds.length === 0) {
        setWarehouses([])
        setInventoryRows([])
        setItems([])
        setSourceInventoryId('')
        setToWarehouseId('')
        setIsLoading(false)
        return
      }
      warehouseQuery = warehouseQuery.in('id', nextAllowedWarehouseIds)
      inventoryQuery = inventoryQuery.in('warehouse_id', nextAllowedWarehouseIds)
    }

    const [{ data: warehouseData }, { data: inventoryData }, { data: itemData }] = await Promise.all([
      warehouseQuery,
      inventoryQuery,
      supabase.from('items').select('id, item_code, item_name, unit').eq('is_active', true),
    ])

    setWarehouses((warehouseData ?? []) as Warehouse[])
    setInventoryRows((inventoryData ?? []) as InventoryRow[])
    setItems((itemData ?? []) as ItemRow[])
    setIsLoading(false)
  }

  const warehouseNameMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const warehouse of warehouses) {
      map.set(warehouse.id, `${warehouse.code ? `[${warehouse.code}] ` : ''}${warehouse.name}`)
    }
    return map
  }, [warehouses])

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const sourceInventoryOptions = useMemo(
    () =>
      inventoryRows.map((row) => {
        const item = itemMap.get(row.item_id)
        const itemLabel = item ? `[${item.item_code}] ${item.item_name}` : `품목#${row.item_id}`
        const extra = [
          row.lot_no ? `LOT:${row.lot_no}` : '',
          row.exp_date ? `EXP:${row.exp_date}` : '',
          row.serial_no ? `SN:${row.serial_no}` : '',
        ]
          .filter(Boolean)
          .join(' / ')
        return {
          value: String(row.id),
          label: `${warehouseNameMap.get(row.warehouse_id) ?? `창고#${row.warehouse_id}`} | ${itemLabel} | 가용:${row.available_qty}${extra ? ` | ${extra}` : ''}`,
          keywords: [item?.item_code ?? '', item?.item_name ?? '', warehouseNameMap.get(row.warehouse_id) ?? '', row.lot_no ?? '', row.serial_no ?? ''],
        }
      }),
    [inventoryRows, itemMap, warehouseNameMap]
  )

  const selectedSource = useMemo(
    () => inventoryRows.find((row) => String(row.id) === sourceInventoryId) ?? null,
    [inventoryRows, sourceInventoryId]
  )

  const destinationWarehouseOptions = useMemo(() => {
    if (!selectedSource) return []
    return warehouses
      .filter((warehouse) => warehouse.id !== selectedSource.warehouse_id)
      .map((warehouse) => ({
        value: String(warehouse.id),
        label: `${warehouse.code ? `[${warehouse.code}] ` : ''}${warehouse.name}`,
        keywords: [warehouse.code ?? '', warehouse.name],
      }))
  }, [warehouses, selectedSource])

  const selectedItem = selectedSource ? itemMap.get(selectedSource.item_id) : null
  const maxQty = selectedSource ? Number(selectedSource.available_qty ?? 0) : 0

  const handleTransfer = async () => {
    setErrorMessage('')
    setSuccessMessage('')

    if (!sourceInventoryId) {
      setErrorMessage('이동할 재고를 선택하세요.')
      return
    }
    if (!toWarehouseId) {
      setErrorMessage('도착 창고를 선택하세요.')
      return
    }
    const qty = Number(transferQty)
    if (!qty || qty <= 0) {
      setErrorMessage('이동 수량은 0보다 커야 합니다.')
      return
    }
    if (maxQty > 0 && qty > maxQty) {
      setErrorMessage(`이동 수량은 가용재고(${maxQty})를 초과할 수 없습니다.`)
      return
    }

    await runSingleSubmit(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const response = await fetch('/api/inventory/transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            source_inventory_id: Number(sourceInventoryId),
            to_warehouse_id: Number(toWarehouseId),
            qty,
            remarks: remarks.trim(),
          }),
        })

        const result = await response.json()
        if (!response.ok) {
          setErrorMessage(result?.error ?? '자재 이동에 실패했습니다.')
          return
        }

        setSuccessMessage('자재 이동이 완료되었습니다.')
        setSourceInventoryId('')
        setToWarehouseId('')
        setTransferQty('1')
        setRemarks('')
        await loadData()
      } catch (error) {
        console.error(error)
        setErrorMessage('자재 이동 중 오류가 발생했습니다.')
      }
    })
  }

  if (isLoading) {
    return (
      <div className="erp-card">
        <p className="text-sm text-gray-500">자재 이동 화면을 불러오는 중입니다...</p>
      </div>
    )
  }

  if (allowedWarehouseIds !== null && allowedWarehouseIds.length === 0) {
    return (
      <div className="erp-card">
        <h1 className="erp-page-title">자재 이동</h1>
        <p className="mt-2 text-sm text-gray-600">할당된 창고 권한이 없어 자재 이동을 진행할 수 없습니다.</p>
      </div>
    )
  }
  if (!isTransferAllowed) {
    return (
      <div className="erp-card">
        <h1 className="erp-page-title">자재 이동</h1>
        <p className="mt-2 text-sm text-gray-600">자재 이동 권한이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="erp-page">
      <div className="erp-page-header">
        <h1 className="erp-page-title">자재 이동</h1>
        <p className="erp-page-desc">창고 간 재고를 이동하고 입출고 이력을 동시에 기록합니다.</p>
      </div>

      {errorMessage ? <div className="erp-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="erp-alert-success">{successMessage}</div> : null}

      <div className="erp-card overflow-visible">
        <h2 className="erp-card-title">이동 정보</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="erp-field md:col-span-2 xl:col-span-4">
            <label className="erp-label">출발 재고 선택</label>
            <SearchableCombobox
              value={sourceInventoryId}
              onChange={setSourceInventoryId}
              options={sourceInventoryOptions}
              placeholder="출발 재고를 선택하세요"
            />
          </div>

          <div className="erp-field">
            <label className="erp-label">출발 창고</label>
            <div className="erp-readonly-box">
              {selectedSource ? (warehouseNameMap.get(selectedSource.warehouse_id) ?? '-') : '-'}
            </div>
          </div>

          <div className="erp-field relative z-50">
            <label className="erp-label">도착 창고</label>
            <SearchableCombobox
              value={toWarehouseId}
              onChange={setToWarehouseId}
              options={destinationWarehouseOptions}
              placeholder="도착 창고 선택"
              listMaxHeightClass="max-h-80 overflow-y-auto custom-scrollbar"
            />
          </div>

          <div className="erp-field">
            <label className="erp-label">품목</label>
            <div className="erp-readonly-box">
              {selectedItem ? `[${selectedItem.item_code}] ${selectedItem.item_name}` : '-'}
            </div>
          </div>

          <div className="erp-field">
            <label className="erp-label">가용 재고</label>
            <div className="erp-readonly-box">{selectedSource ? maxQty : '-'}</div>
          </div>

          <div className="erp-field">
            <label className="erp-label">이동 수량</label>
            <input
              type="number"
              min={1}
              max={maxQty || undefined}
              value={transferQty}
              onChange={(event) => setTransferQty(event.target.value)}
              className="erp-input"
            />
          </div>

          <div className="erp-field md:col-span-2 xl:col-span-3">
            <label className="erp-label">비고</label>
            <input
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              className="erp-input"
              placeholder="이동 사유 또는 참고 내용을 입력하세요"
            />
          </div>
        </div>

        <div className="mt-4">
          <button type="button" onClick={handleTransfer} disabled={isSaving} className="erp-btn-primary">
            {isSaving ? '이동 처리 중...' : '자재 이동 실행'}
          </button>
        </div>
      </div>
    </div>
  )
}
