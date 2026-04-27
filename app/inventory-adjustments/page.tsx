'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAllowedWarehouseIds, getCurrentUserPermissions } from '@/lib/permissions'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import InlineAlertMirror from '@/components/InlineAlertMirror'
import {
  InventoryTransferCommandCombobox,
  type TransferComboboxOption,
} from '@/app/inventory-transfers/new/InventoryTransferCommandCombobox'

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  item_type: string
  unit: string | null
  is_active: boolean
  is_lot_managed: boolean
  is_exp_managed: boolean
  is_sn_managed: boolean
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

const PAGE_SIZE_OPTIONS = [20, 25, 30, 50] as const

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

function formatDateLabel(value: string | null) {
  if (!value) return '-'
  const s = String(value).trim()
  if (!s) return '-'
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return s
}

export default function InventoryAdjustmentsPage() {
  const [items, setItems] = useState<ItemRow[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<number[] | null>([])
  const [isLoading, setIsLoading] = useState(true)
  const { isSubmitting: isSaving, run: runSingleSubmit } = useSingleSubmit()
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<number | ''>('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | ''>('')
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('available_increase')
  const [adjustQty, setAdjustQty] = useState('0')
  const [remarks, setRemarks] = useState('')
  const [selectedTrackedInventoryId, setSelectedTrackedInventoryId] = useState('')
  const [selectedTrackedInventoryIds, setSelectedTrackedInventoryIds] = useState<string[]>([''])
  const [lotNo, setLotNo] = useState('')
  const [expDate, setExpDate] = useState('')
  const [serialNo, setSerialNo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25)

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      setErrorMessage('')

      const currentUser = await getCurrentUserPermissions()
      const nextAllowedWarehouseIds = await getAllowedWarehouseIds(currentUser)
      setAllowedWarehouseIds(nextAllowedWarehouseIds)

      let inventoryQuery = supabase
        .from('inventory')
        .select('id, item_id, warehouse_id, current_qty, available_qty, quarantine_qty, lot_no, exp_date, serial_no')
        .order('item_id')
      let warehouseQuery = supabase
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (nextAllowedWarehouseIds !== null) {
        if (nextAllowedWarehouseIds.length === 0) {
          setItems([])
          setInventoryRows([])
          setWarehouses([])
          setSelectedWarehouseId('')
          setIsLoading(false)
          return
        }
        inventoryQuery = inventoryQuery.in('warehouse_id', nextAllowedWarehouseIds)
        warehouseQuery = warehouseQuery.in('id', nextAllowedWarehouseIds)
      }

      const [
        { data: itemsData, error: itemsError },
        { data: inventoryData, error: inventoryError },
        { data: warehouseData, error: warehouseError },
      ] = await Promise.all([
        supabase
          .from('items')
          .select('id, item_code, item_name, item_type, unit, is_active, is_lot_managed, is_exp_managed, is_sn_managed')
          .eq('is_active', true)
          .order('item_name'),
        inventoryQuery,
        warehouseQuery,
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
      const nextSelectedWarehouseId =
        nextWarehouses.length === 0
          ? ''
          : selectedWarehouseId && nextWarehouses.some((warehouse) => warehouse.id === selectedWarehouseId)
            ? selectedWarehouseId
            : nextWarehouses[0].id
      if (nextSelectedWarehouseId !== selectedWarehouseId) {
        setSelectedWarehouseId(nextSelectedWarehouseId)
      }
      setIsLoading(false)
    }

    void loadData()
  }, [selectedWarehouseId])

  const isIncrease = adjustmentType === 'available_increase' || adjustmentType === 'quarantine_increase'

  const inventorySummaryMap = useMemo(() => {
    const map = new Map<
      string,
      {
        current_qty: number
        available_qty: number
        quarantine_qty: number
      }
    >()
    for (const row of inventoryRows) {
      const key = `${row.item_id}:${row.warehouse_id}`
      const prev = map.get(key) ?? { current_qty: 0, available_qty: 0, quarantine_qty: 0 }
      prev.current_qty += Number(row.current_qty ?? 0)
      prev.available_qty += Number(row.available_qty ?? 0)
      prev.quarantine_qty += Number(row.quarantine_qty ?? 0)
      map.set(key, prev)
    }
    return map
  }, [inventoryRows])

  const filteredItems = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    return items.filter((item) => {
      if (!keyword) return true
      return item.item_code.toLowerCase().includes(keyword) || item.item_name.toLowerCase().includes(keyword)
    })
  }, [items, searchKeyword])

  const previewRows: AdjustmentPreviewRow[] = useMemo(() => {
    return filteredItems.map((item) => {
      const summary = selectedWarehouseId ? inventorySummaryMap.get(`${item.id}:${selectedWarehouseId}`) : undefined
      return {
        item_id: item.id,
        item_code: item.item_code,
        item_name: item.item_name,
        item_type: item.item_type,
        unit: item.unit,
        current_qty: summary?.current_qty ?? 0,
        available_qty: summary?.available_qty ?? 0,
        quarantine_qty: summary?.quarantine_qty ?? 0,
      }
    })
  }, [filteredItems, inventorySummaryMap, selectedWarehouseId])

  const totalPages = Math.max(1, Math.ceil(previewRows.length / pageSize))

  useEffect(() => {
    setCurrentPage(1)
  }, [searchKeyword, selectedWarehouseId, pageSize])

  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return previewRows.slice(start, start + pageSize)
  }, [previewRows, currentPage, pageSize])

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    const item = items.find((row) => row.id === selectedItemId)
    if (!item) return null
    const summary = selectedWarehouseId ? inventorySummaryMap.get(`${item.id}:${selectedWarehouseId}`) : undefined
    return {
      ...item,
      current_qty: summary?.current_qty ?? 0,
      available_qty: summary?.available_qty ?? 0,
      quarantine_qty: summary?.quarantine_qty ?? 0,
    }
  }, [selectedItemId, items, inventorySummaryMap, selectedWarehouseId])

  const hasTrackingManaged = !!(selectedItem?.is_lot_managed || selectedItem?.is_exp_managed || selectedItem?.is_sn_managed)

  const rowsForSelectedItem = useMemo(() => {
    if (!selectedItemId || !selectedWarehouseId) return []
    return inventoryRows.filter((row) => row.item_id === selectedItemId && row.warehouse_id === selectedWarehouseId)
  }, [inventoryRows, selectedItemId, selectedWarehouseId])

  const trackedRows = useMemo(
    () => rowsForSelectedItem.filter((row) => !!(row.lot_no || row.exp_date || row.serial_no)),
    [rowsForSelectedItem]
  )

  const selectedTrackedRow = useMemo(
    () => trackedRows.find((row) => String(row.id) === selectedTrackedInventoryId) ?? null,
    [trackedRows, selectedTrackedInventoryId]
  )
  const selectedTrackedRowsForSn = useMemo(
    () =>
      selectedTrackedInventoryIds
        .map((id) => trackedRows.find((row) => String(row.id) === id) ?? null)
        .filter((row): row is InventoryRow => row !== null),
    [selectedTrackedInventoryIds, trackedRows]
  )
  const isSnDecreaseMode = Boolean(selectedItem?.is_sn_managed && hasTrackingManaged && !isIncrease)

  useEffect(() => {
    setSelectedTrackedInventoryId('')
    setSelectedTrackedInventoryIds([''])
    setLotNo('')
    setExpDate('')
    setSerialNo('')
  }, [selectedItemId, selectedWarehouseId])

  useEffect(() => {
    if (!hasTrackingManaged) {
      setSelectedTrackedInventoryId('')
      setSelectedTrackedInventoryIds([''])
      setLotNo('')
      setExpDate('')
      setSerialNo('')
      return
    }
    if (isIncrease) {
      setSelectedTrackedInventoryId('')
      setSelectedTrackedInventoryIds([''])
      return
    }
    if (selectedItem?.is_sn_managed) {
      setSelectedTrackedInventoryId('')
      setLotNo('')
      setExpDate('')
      setSerialNo('')
      return
    }
    if (selectedTrackedRow) {
      setLotNo(selectedTrackedRow.lot_no ?? '')
      setExpDate(selectedTrackedRow.exp_date ? String(selectedTrackedRow.exp_date).slice(0, 10) : '')
      setSerialNo(selectedTrackedRow.serial_no ?? '')
    } else {
      setLotNo('')
      setExpDate('')
      setSerialNo('')
    }
  }, [isIncrease, hasTrackingManaged, selectedItem?.is_sn_managed, selectedTrackedRow])

  useEffect(() => {
    if (!isSnDecreaseMode) return
    const selectedCount = selectedTrackedRowsForSn.length
    setAdjustQty(String(selectedCount > 0 ? selectedCount : 0))
  }, [isSnDecreaseMode, selectedTrackedRowsForSn])

  const warehouseOptions = useMemo<TransferComboboxOption[]>(
    () => warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] })),
    [warehouses]
  )

  const itemOptions = useMemo<TransferComboboxOption[]>(
    () =>
      items
      .map((item) => {
        const summary = selectedWarehouseId ? inventorySummaryMap.get(`${item.id}:${selectedWarehouseId}`) : undefined
        const availableTotal = summary?.available_qty ?? 0
        return {
          value: String(item.id),
          label: `[${item.item_code}] ${item.item_name} · 가용합 ${availableTotal}`,
          keywords: [item.item_code, item.item_name, String(availableTotal), '가용합'],
          availableTotal,
          itemCode: item.item_code,
        }
      })
      .sort((a, b) => {
        const aHas = a.availableTotal > 0 ? 1 : 0
        const bHas = b.availableTotal > 0 ? 1 : 0
        if (aHas !== bHas) return bHas - aHas
        if (a.availableTotal !== b.availableTotal) return b.availableTotal - a.availableTotal
        return a.itemCode.localeCompare(b.itemCode, 'ko')
      })
      .map(({ value, label, keywords }) => ({ value, label, keywords })),
    [items, inventorySummaryMap, selectedWarehouseId]
  )

  const adjustmentTypeOptions = useMemo<TransferComboboxOption[]>(
    () => [
      { value: 'available_increase', label: '사용가능재고 증가' },
      { value: 'available_decrease', label: '사용가능재고 감소' },
      { value: 'quarantine_increase', label: '격리재고 증가' },
      { value: 'quarantine_decrease', label: '격리재고 감소' },
    ],
    []
  )

  const trackedLineOptions = useMemo<TransferComboboxOption[]>(() => {
    if (!selectedItem || !selectedWarehouseId) return []
    return trackedRows.map((row) => ({
      value: String(row.id),
      label: `[${selectedItem.item_code}] ${selectedItem.item_name} · 가용 ${row.available_qty} · LOT ${row.lot_no ?? '-'} · SN ${row.serial_no ?? '-'} · EXP ${formatDateLabel(row.exp_date)}`,
      keywords: [
        selectedItem.item_code,
        selectedItem.item_name,
        row.lot_no ?? '',
        row.serial_no ?? '',
        formatDateLabel(row.exp_date),
      ],
    }))
  }, [trackedRows, selectedItem, selectedWarehouseId])

  const trackedLineOptionsForSnSlot = useCallback(
    (slotIndex: number): TransferComboboxOption[] => {
      const selectedSet = new Set(
        selectedTrackedInventoryIds.filter((_, index) => index !== slotIndex).filter((value) => value.trim())
      )
      return trackedLineOptions.filter((option) => !selectedSet.has(option.value))
    },
    [selectedTrackedInventoryIds, trackedLineOptions]
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

    let payloadLot: string | null = null
    let payloadExp: string | null = null
    let payloadSn: string | null = null
    let snBatchRows: InventoryRow[] = []

    if (hasTrackingManaged) {
      if (isIncrease) {
        if (selectedItem?.is_lot_managed && !lotNo.trim()) {
          setErrorMessage('LOT 관리 품목은 LOT 번호를 입력해야 합니다.')
          return
        }
        if (selectedItem?.is_exp_managed && !expDate.trim()) {
          setErrorMessage('EXP 관리 품목은 유효기간을 입력해야 합니다.')
          return
        }
        if (selectedItem?.is_sn_managed && !serialNo.trim()) {
          setErrorMessage('SN 관리 품목은 시리얼 번호를 입력해야 합니다.')
          return
        }
        payloadLot = selectedItem?.is_lot_managed ? lotNo.trim() : null
        payloadExp = selectedItem?.is_exp_managed ? expDate.trim() : null
        payloadSn = selectedItem?.is_sn_managed ? serialNo.trim() : null
      } else {
        if (selectedItem?.is_sn_managed) {
          const uniqueRows = new Map<number, InventoryRow>()
          for (const row of selectedTrackedRowsForSn) {
            uniqueRows.set(row.id, row)
          }
          snBatchRows = Array.from(uniqueRows.values())
          if (snBatchRows.length === 0) {
            setErrorMessage('SN 품목 감소 조정에서는 차감할 재고 라인을 1개 이상 선택하십시오.')
            return
          }
          if (qty !== snBatchRows.length) {
            setErrorMessage('SN 품목은 선택한 라인 수와 조정 수량이 같아야 합니다.')
            return
          }
        } else {
          if (trackedRows.length > 0 && !selectedTrackedRow) {
            setErrorMessage('감소 조정에서는 차감할 재고 라인을 선택하십시오.')
            return
          }
          payloadLot = selectedTrackedRow?.lot_no ?? null
          payloadExp = selectedTrackedRow?.exp_date ? String(selectedTrackedRow.exp_date).slice(0, 10) : null
          payloadSn = selectedTrackedRow?.serial_no ?? null
        }
      }
    }

    const snAvailableTotal = snBatchRows.reduce((sum, row) => sum + Number(row.available_qty ?? 0), 0)
    const snQuarantineTotal = snBatchRows.reduce((sum, row) => sum + Number(row.quarantine_qty ?? 0), 0)
    const availableForValidation = selectedTrackedRow?.available_qty ?? selectedItem?.available_qty ?? 0
    const quarantineForValidation = selectedTrackedRow?.quarantine_qty ?? selectedItem?.quarantine_qty ?? 0
    if (adjustmentType === 'available_decrease' && qty > (isSnDecreaseMode ? snAvailableTotal : availableForValidation)) {
      setErrorMessage('선택한 대상의 사용가능재고보다 크게 감소할 수 없습니다.')
      return
    }
    if (adjustmentType === 'quarantine_decrease' && qty > (isSnDecreaseMode ? snQuarantineTotal : quarantineForValidation)) {
      setErrorMessage('선택한 대상의 격리재고보다 크게 감소할 수 없습니다.')
      return
    }

    await runSingleSubmit(async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const token = session?.access_token ?? ''
        const postAdjust = async (requestQty: number, lot: string | null, exp: string | null, sn: string | null) => {
          const response = await fetch('/api/inventory/adjust', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              item_id: selectedItemId,
              warehouse_id: selectedWarehouseId,
              adjustment_type: adjustmentType,
              qty: requestQty,
              remarks: remarks.trim(),
              lot_no: lot,
              exp_date: exp,
              serial_no: sn,
            }),
          })
          const result = await response.json()
          if (!response.ok) throw new Error(result?.error ?? '재고조정 중 오류가 발생했습니다.')
        }

        if (isSnDecreaseMode) {
          for (const row of snBatchRows) {
            await postAdjust(1, row.lot_no ?? null, row.exp_date ? String(row.exp_date).slice(0, 10) : null, row.serial_no ?? null)
          }
          setSuccessMessage(`SN 라인 ${snBatchRows.length}건이 일괄 조정되었습니다.`)
          setSelectedTrackedInventoryIds([''])
        } else {
          await postAdjust(qty, payloadLot, payloadExp, payloadSn)
          setSuccessMessage('재고조정이 저장되었습니다.')
        }

        setAdjustQty('0')
        setRemarks('')
        if (isIncrease) {
          setLotNo('')
          setExpDate('')
          setSerialNo('')
        }

        let inventoryReloadQuery = supabase
          .from('inventory')
          .select('id, item_id, warehouse_id, current_qty, available_qty, quarantine_qty, lot_no, exp_date, serial_no')
          .order('item_id')
        if (allowedWarehouseIds !== null) {
          inventoryReloadQuery = inventoryReloadQuery.in('warehouse_id', allowedWarehouseIds)
        }
        const { data: inventoryData, error: inventoryError } = await inventoryReloadQuery
        if (!inventoryError) {
          setInventoryRows((inventoryData as InventoryRow[]) ?? [])
        }
      } catch (error) {
        console.error(error)
        setErrorMessage('재고조정 중 오류가 발생했습니다.')
      }
    })
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
        <Card className="border-border shadow-sm">
          <CardContent className="py-8 text-sm text-muted-foreground">재고조정 화면을 불러오는 중입니다...</CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
      <PageHeader
        title="재고 실사 / 조정"
        description="창고/품목 기준으로 재고를 확인하고, 실사 결과를 반영해 증감 조정합니다."
      />

      {errorMessage ? <InlineAlertMirror message={errorMessage} variant="error" /> : null}
      {successMessage ? <InlineAlertMirror message={successMessage} variant="success" /> : null}

      <Card className="w-full min-w-0 border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/30">
          <CardTitle className="text-lg font-semibold text-foreground">조정 입력</CardTitle>
          <CardDescription>구조/클릭 흐름은 유지하고, 조정 UX를 자재이동 톤으로 정리했습니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 pt-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>창고 선택</Label>
              <InventoryTransferCommandCombobox
                value={selectedWarehouseId ? String(selectedWarehouseId) : ''}
                onChange={(v) => setSelectedWarehouseId(v ? Number(v) : '')}
                options={warehouseOptions}
                placeholder="창고 선택"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>품목 선택 (합계)</Label>
              <InventoryTransferCommandCombobox
                value={selectedItemId ? String(selectedItemId) : ''}
                onChange={(v) => setSelectedItemId(v ? Number(v) : '')}
                options={itemOptions}
                placeholder="품목 선택"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Label>품목 · 조정 재고 라인</Label>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
              <span
                className="block max-w-full truncate whitespace-nowrap text-sm font-medium text-foreground"
                title={
                  selectedItem
                    ? `[${selectedItem.item_code}] ${selectedItem.item_name} · 가용합 ${selectedItem.available_qty}`
                    : '창고·품목을 선택하면 품목이 표시됩니다.'
                }
              >
                {selectedItem
                  ? `[${selectedItem.item_code}] ${selectedItem.item_name} · 가용합 ${selectedItem.available_qty}`
                  : '창고·품목을 선택하면 품목이 표시됩니다.'}
              </span>
              {selectedItem ? (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedItem.is_lot_managed ? <Badge variant="outline">LOT</Badge> : null}
                  {selectedItem.is_exp_managed ? <Badge variant="outline">EXP</Badge> : null}
                  {selectedItem.is_sn_managed ? <Badge variant="outline">SN</Badge> : null}
                </div>
              ) : null}

              {selectedItem && hasTrackingManaged && !isIncrease ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    감소 조정은 기존 재고 라인을 선택해 해당 LOT/SN/EXP에서 차감합니다.
                  </p>
                  {selectedItem.is_sn_managed ? (
                    <div className="space-y-2">
                      {selectedTrackedInventoryIds.map((selectedId, index) => (
                        <div key={`sn-line-${index}`} className="flex items-center gap-2">
                          <div className="flex-1">
                            <InventoryTransferCommandCombobox
                              value={selectedId}
                              onChange={(value) => {
                                setSelectedTrackedInventoryIds((prev) =>
                                  prev.map((current, currentIndex) => (currentIndex === index ? value : current))
                                )
                              }}
                              options={trackedLineOptionsForSnSlot(index)}
                              placeholder={trackedLineOptions.length ? `SN 차감 라인 선택 #${index + 1}` : '선택 가능한 SN 라인이 없습니다'}
                              emptyText="선택 가능한 라인이 없습니다."
                              disabled={trackedLineOptions.length === 0}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 px-2 text-xs"
                            onClick={() => {
                              setSelectedTrackedInventoryIds((prev) => {
                                if (prev.length <= 1) return ['']
                                return prev.filter((_, currentIndex) => currentIndex !== index)
                              })
                            }}
                            disabled={selectedTrackedInventoryIds.length <= 1}
                          >
                            삭제
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-fit px-2 text-xs"
                        onClick={() => setSelectedTrackedInventoryIds((prev) => [...prev, ''])}
                        disabled={trackedLineOptions.length === 0 || selectedTrackedInventoryIds.length >= trackedLineOptions.length}
                      >
                        + 라인 추가
                      </Button>
                    </div>
                  ) : (
                    <InventoryTransferCommandCombobox
                      value={selectedTrackedInventoryId}
                      onChange={setSelectedTrackedInventoryId}
                      options={trackedLineOptions}
                      placeholder={trackedLineOptions.length ? '차감 재고 라인 선택 (LOT / SN / EXP)' : '선택 가능한 추적 라인이 없습니다'}
                      emptyText="선택 가능한 라인이 없습니다."
                      disabled={trackedLineOptions.length === 0}
                    />
                  )}
                </div>
              ) : null}

              {selectedItem && hasTrackingManaged && isIncrease ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="adjust-lot">LOT 번호</Label>
                    <Input
                      id="adjust-lot"
                      value={lotNo}
                      onChange={(e) => setLotNo(e.target.value)}
                      placeholder={selectedItem.is_lot_managed ? 'LOT 입력 (필수)' : 'LOT 미관리'}
                      disabled={!selectedItem.is_lot_managed}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="adjust-exp">유효기간 (EXP)</Label>
                    <Input
                      id="adjust-exp"
                      type="date"
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      disabled={!selectedItem.is_exp_managed}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="adjust-sn">시리얼 (SN)</Label>
                    <Input
                      id="adjust-sn"
                      value={serialNo}
                      onChange={(e) => setSerialNo(e.target.value)}
                      placeholder={selectedItem.is_sn_managed ? 'SN 입력 (필수)' : 'SN 미관리'}
                      disabled={!selectedItem.is_sn_managed}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
            <div className="flex flex-col gap-2 lg:col-span-4">
              <Label>조정 유형</Label>
              <InventoryTransferCommandCombobox
                value={adjustmentType}
                onChange={(v) => setAdjustmentType(v as AdjustmentType)}
                options={adjustmentTypeOptions}
                placeholder="조정 유형 선택"
              />
            </div>
            <div className="flex flex-col gap-2 lg:col-span-2">
              <Label htmlFor="adjust-qty">조정 수량</Label>
              <Input
                id="adjust-qty"
                type="number"
                min={1}
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                disabled={isSnDecreaseMode}
              />
            </div>
            <div className="flex flex-col gap-2 lg:col-span-2">
              <Label>총재고</Label>
              <div className="flex min-h-10 items-center rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                {selectedItem ? selectedItem.current_qty : '-'}
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:col-span-2">
              <Label>사용가능재고</Label>
              <div className="flex min-h-10 items-center rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                {isSnDecreaseMode
                  ? selectedTrackedRowsForSn.reduce((sum, row) => sum + Number(row.available_qty ?? 0), 0)
                  : selectedTrackedRow
                    ? selectedTrackedRow.available_qty
                    : selectedItem
                      ? selectedItem.available_qty
                      : '-'}
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:col-span-2">
              <Label>격리재고</Label>
              <div className="flex min-h-10 items-center rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                {isSnDecreaseMode
                  ? selectedTrackedRowsForSn.reduce((sum, row) => sum + Number(row.quarantine_qty ?? 0), 0)
                  : selectedTrackedRow
                    ? selectedTrackedRow.quarantine_qty
                    : selectedItem
                      ? selectedItem.quarantine_qty
                      : '-'}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="remarks">조정 사유</Label>
            <Textarea
              id="remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="예: 실사 차이 반영, 테스트 재고 보정, 오입력 수정"
            />
          </div>

          <Button type="button" onClick={handleSaveAdjustment} disabled={isSaving} className="h-9 w-full sm:w-auto">
            {isSaving ? '조정 중...' : '재고조정 저장'}
          </Button>
        </CardContent>
      </Card>

      <Card className="w-full min-w-0 border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/30">
          <CardTitle className="text-lg font-semibold text-foreground">품목별 재고 현황</CardTitle>
          <CardDescription>품목코드/품목명으로 검색해 합계 재고를 확인하고 조정 품목을 선택할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="w-full md:w-80">
            <Label htmlFor="item-search">품목 검색</Label>
            <Input
              id="item-search"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="품목코드 또는 품목명 검색"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">품목코드</th>
                  <th className="px-3 py-3">품목명</th>
                  <th className="px-3 py-3">유형</th>
                  <th className="px-3 py-3">단위</th>
                  <th className="px-3 py-3">총재고</th>
                  <th className="px-3 py-3">사용가능재고</th>
                  <th className="px-3 py-3">격리재고</th>
                  <th className="px-3 py-3">선택</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {previewRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      조회 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.item_id} className="transition-colors hover:bg-muted/30">
                      <td className="px-3 py-3">{row.item_code}</td>
                      <td className="px-3 py-3 font-medium">{row.item_name}</td>
                      <td className="px-3 py-3">{getItemTypeLabel(row.item_type)}</td>
                      <td className="px-3 py-3">{row.unit ?? '-'}</td>
                      <td className="px-3 py-3">{row.current_qty}</td>
                      <td className="px-3 py-3">{row.available_qty}</td>
                      <td className="px-3 py-3">{row.quarantine_qty}</td>
                      <td className="px-3 py-3">
                        <Button
                          type="button"
                          variant={selectedItemId === row.item_id ? 'default' : 'outline'}
                          size="sm"
                          className={cn('h-8 px-3 text-xs', selectedItemId === row.item_id ? '' : 'font-medium')}
                          onClick={() => setSelectedItemId(row.item_id)}
                        >
                          선택
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {previewRows.length > 0 ? (
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
                  · 총 <span className="font-semibold text-foreground">{previewRows.length}</span>건 ·{' '}
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
