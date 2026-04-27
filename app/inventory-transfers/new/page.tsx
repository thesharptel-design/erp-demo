'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getAllowedWarehouseIds, getCurrentUserPermissions, hasManagePermission } from '@/lib/permissions'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PageHeader from '@/components/PageHeader'
import {
  InventoryTransferCommandCombobox,
  type TransferComboboxOption,
} from './InventoryTransferCommandCombobox'

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

function hasTracking(row: InventoryRow) {
  const lot = row.lot_no?.trim()
  const sn = row.serial_no?.trim()
  return !!(lot || sn || row.exp_date)
}

export default function NewInventoryTransferPage() {
  const [isLoading, setIsLoading] = useState(true)
  const { isSubmitting: isSaving, run: runSingleSubmit } = useSingleSubmit()
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [items, setItems] = useState<ItemRow[]>([])
  const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<number[] | null>(null)
  const [isTransferAllowed, setIsTransferAllowed] = useState(true)

  /** Narrow candidate 재고 라인; 실제 라인은 아래 콤보에서 선택. */
  const [sourceWarehouseFilterId, setSourceWarehouseFilterId] = useState('')
  const [sourceItemFilterId, setSourceItemFilterId] = useState('')
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
    const canTransfer = !!currentUser && hasManagePermission(currentUser, 'can_material_manage')
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
        setSourceWarehouseFilterId('')
        setSourceItemFilterId('')
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

  const sourceWarehouseFilterOptions = useMemo<TransferComboboxOption[]>(() => {
    let list = warehouses
    if (sourceItemFilterId) {
      const iid = Number(sourceItemFilterId)
      if (Number.isFinite(iid)) {
        const whIds = new Set(
          inventoryRows.filter((r) => r.item_id === iid).map((r) => r.warehouse_id)
        )
        list = warehouses.filter((w) => whIds.has(w.id))
      }
    }
    return list.map((warehouse) => ({
      value: String(warehouse.id),
      label: `${warehouse.code ? `[${warehouse.code}] ` : ''}${warehouse.name}`,
      keywords: [warehouse.code ?? '', warehouse.name],
    }))
  }, [warehouses, inventoryRows, sourceItemFilterId])

  const rowsForItemFilterOptions = useMemo(() => {
    if (!sourceWarehouseFilterId) return inventoryRows
    const wid = Number(sourceWarehouseFilterId)
    if (!Number.isFinite(wid)) return inventoryRows
    return inventoryRows.filter((row) => row.warehouse_id === wid)
  }, [inventoryRows, sourceWarehouseFilterId])

  const sourceItemFilterOptions = useMemo<TransferComboboxOption[]>(() => {
    const sumByItem = new Map<number, number>()
    for (const row of rowsForItemFilterOptions) {
      sumByItem.set(row.item_id, (sumByItem.get(row.item_id) ?? 0) + Number(row.available_qty ?? 0))
    }
    return Array.from(sumByItem.entries())
      .map(([itemId, sum]) => {
        const item = itemMap.get(itemId)
        const label = item
          ? `[${item.item_code}] ${item.item_name} · 가용합 ${sum}`
          : `품목#${itemId} · 가용합 ${sum}`
        return {
          value: String(itemId),
          label,
          keywords: [item?.item_code ?? '', item?.item_name ?? '', String(sum)],
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [rowsForItemFilterOptions, itemMap])

  const filteredInventoryRows = useMemo(() => {
    return inventoryRows.filter((row) => {
      if (sourceWarehouseFilterId && String(row.warehouse_id) !== sourceWarehouseFilterId) return false
      if (sourceItemFilterId && String(row.item_id) !== sourceItemFilterId) return false
      return true
    })
  }, [inventoryRows, sourceWarehouseFilterId, sourceItemFilterId])

  /** Rows used for LOT/SN/EXP badges (single item in scope, or item filter set). */
  const rowsForTrackingBadges = useMemo(() => {
    if (sourceItemFilterId) return filteredInventoryRows
    const ids = new Set(filteredInventoryRows.map((r) => r.item_id))
    if (ids.size === 1) return filteredInventoryRows
    return []
  }, [filteredInventoryRows, sourceItemFilterId])

  const trackingPresence = useMemo(() => {
    let lot = false
    let sn = false
    let exp = false
    for (const r of rowsForTrackingBadges) {
      if (r.lot_no?.trim()) lot = true
      if (r.serial_no?.trim()) sn = true
      if (r.exp_date) exp = true
    }
    return { lot, sn, exp }
  }, [rowsForTrackingBadges])

  const displayItemForRow = useMemo(() => {
    if (sourceItemFilterId) return itemMap.get(Number(sourceItemFilterId)) ?? null
    const ids = new Set(filteredInventoryRows.map((r) => r.item_id))
    if (ids.size === 1) {
      const onlyId = [...ids][0]
      return itemMap.get(onlyId) ?? null
    }
    const picked = sourceInventoryId
      ? inventoryRows.find((r) => String(r.id) === sourceInventoryId)
      : null
    if (picked) return itemMap.get(picked.item_id) ?? null
    return null
  }, [sourceItemFilterId, filteredInventoryRows, itemMap, sourceInventoryId, inventoryRows])

  const sourceInventoryOptions = useMemo(() => {
    return filteredInventoryRows.map((row) => {
      const item = itemMap.get(row.item_id)
      const itemLabel = item ? `[${item.item_code}] ${item.item_name}` : `품목#${row.item_id}`
      const wh = warehouseNameMap.get(row.warehouse_id) ?? `창고#${row.warehouse_id}`
      const tracked = hasTracking(row)
      const qty = Number(row.available_qty ?? 0)
      const trackingParts = [
        row.lot_no?.trim() ? `LOT ${row.lot_no.trim()}` : '',
        row.exp_date ? `EXP ${row.exp_date}` : '',
        row.serial_no?.trim() ? `SN ${row.serial_no.trim()}` : '',
      ].filter(Boolean)

      const label = tracked
        ? `${wh} | ${itemLabel} | 이 라인 전체 가용 ${qty}${trackingParts.length ? ` · ${trackingParts.join(' · ')}` : ''}`
        : `${wh} | ${itemLabel} | 가용 ${qty}`

      return {
        value: String(row.id),
        label,
        keywords: [
          item?.item_code ?? '',
          item?.item_name ?? '',
          wh,
          row.lot_no ?? '',
          row.serial_no ?? '',
          String(qty),
        ],
      } satisfies TransferComboboxOption
    })
  }, [filteredInventoryRows, itemMap, warehouseNameMap])

  const selectedSource = useMemo(
    () => inventoryRows.find((row) => String(row.id) === sourceInventoryId) ?? null,
    [inventoryRows, sourceInventoryId]
  )

  useEffect(() => {
    if (!sourceInventoryId) return
    const row = inventoryRows.find((r) => String(r.id) === sourceInventoryId)
    if (!row) {
      setSourceInventoryId('')
      return
    }
    if (sourceWarehouseFilterId && String(row.warehouse_id) !== sourceWarehouseFilterId) {
      setSourceInventoryId('')
      return
    }
    if (sourceItemFilterId && String(row.item_id) !== sourceItemFilterId) {
      setSourceInventoryId('')
    }
  }, [sourceWarehouseFilterId, sourceItemFilterId, inventoryRows, sourceInventoryId])

  useEffect(() => {
    if (!selectedSource?.serial_no?.trim()) return
    const m = Number(selectedSource.available_qty ?? 0)
    if (m > 0) setTransferQty(String(m))
  }, [selectedSource?.id, selectedSource?.serial_no, selectedSource?.available_qty])

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

  const maxQty = selectedSource ? Number(selectedSource.available_qty ?? 0) : 0
  const isSerialLine = !!(selectedSource?.serial_no?.trim())
  const handleSourceInventoryChange = (id: string) => {
    setSourceInventoryId(id)
  }

  const departureWarehouseLabel =
    selectedSource != null
      ? (warehouseNameMap.get(selectedSource.warehouse_id) ?? '-')
      : sourceWarehouseFilterId
        ? (warehouseNameMap.get(Number(sourceWarehouseFilterId)) ?? '-')
        : '-'

  const scopeHasTracking = trackingPresence.lot || trackingPresence.sn || trackingPresence.exp

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
        setSourceWarehouseFilterId('')
        setSourceItemFilterId('')
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
      <Card className="max-w-4xl">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">자재 이동 화면을 불러오는 중입니다...</p>
        </CardContent>
      </Card>
    )
  }

  if (allowedWarehouseIds !== null && allowedWarehouseIds.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
        <PageHeader title="자재 이동" description="창고 간 재고를 이동하고 입출고 이력을 동시에 기록합니다." />
        <Card className="w-full border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">자재 이동</CardTitle>
            <CardDescription>할당된 창고 권한이 없어 자재 이동을 진행할 수 없습니다.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }
  if (!isTransferAllowed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
        <PageHeader title="자재 이동" description="창고 간 재고를 이동하고 입출고 이력을 동시에 기록합니다." />
        <Card className="w-full border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-foreground">자재 이동</CardTitle>
            <CardDescription>자재 이동 권한이 없습니다.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col gap-4 bg-background p-4 font-sans md:p-6">
      <PageHeader
        title="자재 이동"
        description="창고 간 재고를 이동하고 입출고 이력을 동시에 기록합니다."
      />

      {errorMessage ? <div className="erp-alert-error">{errorMessage}</div> : null}
      {successMessage ? <div className="erp-alert-success">{successMessage}</div> : null}

      <Card className="w-full min-w-0 overflow-visible border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/30">
          <CardTitle className="text-lg font-semibold text-foreground">이동 정보</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <span>위에서 출발 창고와 품목을 고른 뒤, 아래에서 이동할 재고 라인을 선택합니다.</span>
            {scopeHasTracking ? (
              <Badge variant="secondary" className="font-normal">
                추적 재고 — 라인별로 LOT / SN / EXP가 있는 항목만 표시
              </Badge>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 pt-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>출발 창고 (선택)</Label>
              <InventoryTransferCommandCombobox
                value={sourceWarehouseFilterId}
                onChange={setSourceWarehouseFilterId}
                options={sourceWarehouseFilterOptions}
                placeholder="전체 창고"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>품목으로 좁히기 (선택)</Label>
              <InventoryTransferCommandCombobox
                value={sourceItemFilterId}
                onChange={setSourceItemFilterId}
                options={sourceItemFilterOptions}
                placeholder={sourceWarehouseFilterId ? '이 창고의 품목만' : '전체 품목'}
                emptyText="표시할 품목이 없습니다."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
            <div className="flex flex-col gap-3 lg:col-span-6">
              <Label>품목 · 출발 재고 라인</Label>
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <div
                    className="block max-w-full truncate whitespace-nowrap text-sm font-medium text-foreground"
                    title={
                      displayItemForRow
                        ? `[${displayItemForRow.item_code}] ${displayItemForRow.item_name}`
                        : '창고·품목을 선택하면 품목이 표시됩니다.'
                    }
                  >
                    {displayItemForRow
                      ? `[${displayItemForRow.item_code}] ${displayItemForRow.item_name}`
                      : '창고·품목을 선택하면 품목이 표시됩니다.'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rowsForTrackingBadges.length > 0 && trackingPresence.lot ? (
                      <Badge variant="outline">LOT</Badge>
                    ) : null}
                    {rowsForTrackingBadges.length > 0 && trackingPresence.sn ? (
                      <Badge variant="outline">SN</Badge>
                    ) : null}
                    {rowsForTrackingBadges.length > 0 && trackingPresence.exp ? (
                      <Badge variant="outline">EXP</Badge>
                    ) : null}
                  </div>
                  {trackingPresence.sn ? (
                    <p className="text-xs text-amber-800 dark:text-amber-400">
                      SN이 있는 품목입니다. 아래 재고 라인 드랍박스에서 시리얼(SN) 라인을 선택해 주세요.
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full flex-col gap-2">
                  <InventoryTransferCommandCombobox
                    value={sourceInventoryId}
                    onChange={handleSourceInventoryChange}
                    options={sourceInventoryOptions}
                    placeholder={
                      sourceInventoryOptions.length === 0
                        ? '조건에 맞는 재고가 없습니다'
                        : '재고 라인 선택 (LOT / SN / EXP)'
                    }
                    emptyText="가용 재고가 없습니다."
                    disabled={sourceInventoryOptions.length === 0}
                    triggerClassName="relative z-10"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:col-span-3">
              <Label>가용 재고 (선택 라인)</Label>
              <div className="flex min-h-10 items-center rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                {selectedSource ? maxQty : '-'}
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:col-span-3">
              <Label htmlFor="qty">이동 수량</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={maxQty || undefined}
                value={transferQty}
                disabled={isSerialLine}
                readOnly={isSerialLine}
                onChange={(event) => setTransferQty(event.target.value)}
                className={isSerialLine ? 'bg-muted' : ''}
              />
              {isSerialLine ? (
                <p className="text-xs text-muted-foreground">시리얼(SN) 재고는 해당 라인 가용 수량 전체가 이동됩니다.</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>선택된 출발 창고</Label>
              <div className="flex min-h-10 items-center rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm">
                {departureWarehouseLabel}
              </div>
            </div>
            <div className="relative z-20 flex flex-col gap-2">
              <Label>도착 창고</Label>
              <InventoryTransferCommandCombobox
                value={toWarehouseId}
                onChange={setToWarehouseId}
                options={destinationWarehouseOptions}
                placeholder="도착 창고 선택"
                disabled={!selectedSource}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="remarks">비고</Label>
            <Input
              id="remarks"
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              placeholder="이동 사유 또는 참고 내용을 입력하세요"
            />
          </div>

          <Button type="button" onClick={handleTransfer} disabled={isSaving} className="h-9 w-full sm:w-auto">
            {isSaving ? '이동 처리 중...' : '자재 이동 실행'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
