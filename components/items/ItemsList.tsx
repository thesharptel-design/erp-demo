'use client'

import * as XLSX from 'xlsx'
import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import SearchableCombobox from '@/components/SearchableCombobox'
import { ItemProcessDetailGrid } from '@/components/items/ItemProcessDetailGrid'
import { pruneProcessMetadataToMaster, type ItemProcessCategories, type ProcessMetadata } from '@/lib/item-config'
import { cn } from '@/lib/utils'
import { fetchItemProcessCategories } from '@/lib/item-process-config'
import { deleteSopFilesForItem } from '@/lib/item-sop-storage'
import { canEditItemsMaster, getCurrentUserPermissions, type CurrentUserPermissions } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  item_spec: string | null
  unit: string | null
  is_active: boolean
  is_lot_managed: boolean
  is_exp_managed: boolean
  is_sn_managed: boolean
  manufacturer: string | null
  remarks: string | null
  process_metadata: ProcessMetadata | Record<string, unknown> | null
}

function getCategory(meta: ItemRow['process_metadata']): string | null {
  if (!meta || typeof meta !== 'object') return null
  const c = (meta as ProcessMetadata).category
  if (c == null || String(c).trim() === '') return null
  return String(c).trim()
}

function hasProcessDetail(meta: ItemRow['process_metadata']): boolean {
  const m = meta as ProcessMetadata | null | undefined
  if (!m || typeof m !== 'object') return false
  if (m.category != null && String(m.category).trim() !== '') return true
  if (m.checks && Object.keys(m.checks).length > 0) return true
  if (m.sopFiles && m.sopFiles.length > 0) return true
  return false
}

function parseBoolCell(v: unknown): boolean {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  return ['y', 'yes', '1', 'true', 'o', '예', 'ㅇ', 'v'].includes(s)
}

function rowString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    if (k in row && row[k] != null && String(row[k]).trim() !== '') {
      return String(row[k]).trim()
    }
  }
  return ''
}

function downloadExcelTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['품목코드', '품목명', '규격', '단위', '제조사', '비고', 'LOT관리', 'EXP관리', 'SN관리'],
    ['SAMPLE-001', '샘플 품목', '10mg', 'EA', '', '', 'N', 'N', 'N'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '품목')
  XLSX.writeFile(wb, '품목_일괄업로드_템플릿.xlsx')
}

/** Header filter: process_metadata.category empty */
const FILTER_CATEGORY_UNSET = '__unset__'

const PAGE_SIZE = 25

function PeekableTruncated({
  text,
  className,
  onPeek,
}: {
  text: string | null | undefined
  className?: string
  onPeek: (full: string) => void
}) {
  const s = (text ?? '').trim()
  const display = s || '—'
  return (
    <span
      className={cn('block min-w-0 truncate', display !== '—' && 'cursor-pointer hover:underline', className)}
      title={display !== '—' ? display : undefined}
      role={display !== '—' ? 'button' : undefined}
      tabIndex={display !== '—' ? 0 : undefined}
      onClick={() => {
        if (display !== '—') onPeek(display)
      }}
      onKeyDown={(e) => {
        if (display !== '—' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onPeek(display)
        }
      }}
    >
      {display}
    </span>
  )
}

async function openSignedSopDownload(path: string) {
  const { data, error } = await supabase.storage.from('sop-files').createSignedUrl(path, 300)
  if (error || !data?.signedUrl) {
    toast.error('다운로드 링크를 만들지 못했습니다.', { description: error?.message })
    return
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export default function ItemsList() {
  const [items, setItems] = useState<ItemRow[]>([])
  const [categories, setCategories] = useState<ItemProcessCategories>({})
  const [loading, setLoading] = useState(true)
  const [permUser, setPermUser] = useState<CurrentUserPermissions | null>(null)
  const [permLoading, setPermLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [filterItemCode, setFilterItemCode] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterItemName, setFilterItemName] = useState('')
  const [filterManufacturer, setFilterManufacturer] = useState('')
  const [filterRemarks, setFilterRemarks] = useState('')
  const [page, setPage] = useState(1)
  const [peekText, setPeekText] = useState<string | null>(null)

  const canEdit = useMemo(() => canEditItemsMaster(permUser), [permUser])

  useEffect(() => {
    void (async () => {
      setPermLoading(true)
      const u = await getCurrentUserPermissions()
      setPermUser(u)
      setPermLoading(false)
    })()
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    const [itemsRes, cat] = await Promise.all([
      supabase
        .from('items')
        .select(
          'id, item_code, item_name, item_spec, unit, is_active, is_lot_managed, is_exp_managed, is_sn_managed, manufacturer, remarks, process_metadata'
        )
        .order('id', { ascending: true }),
      fetchItemProcessCategories(supabase),
    ])

    setCategories(cat)

    if (itemsRes.error) {
      toast.error('품목 목록을 불러오지 못했습니다.', { description: itemsRes.error.message })
      setItems([])
    } else {
      setItems((itemsRes.data as ItemRow[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const categoryKeys = useMemo(() => Object.keys(categories), [categories])

  const orphanCategories = useMemo(() => {
    const s = new Set<string>()
    for (const r of items) {
      const c = getCategory(r.process_metadata)
      if (c && !categoryKeys.includes(c)) s.add(c)
    }
    return [...s].sort()
  }, [items, categoryKeys])

  const filterCategoryOptions = useMemo(
    () => [
      { value: '', label: '전체', keywords: ['전체'] },
      { value: FILTER_CATEGORY_UNSET, label: '공정명 미지정', keywords: ['미지정', '공정'] },
      ...orphanCategories.map((k) => ({ value: k, label: `${k} (마스터 외 공정명)`, keywords: [k] })),
      ...categoryKeys.map((k) => ({ value: k, label: k, keywords: [k] })),
    ],
    [categoryKeys, orphanCategories]
  )

  const itemCodeOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of items) {
      const c = r.item_code?.trim()
      if (c) s.add(c)
    }
    return [{ value: '', label: '전체', keywords: ['전체'] }, ...[...s].sort().map((v) => ({ value: v, label: v, keywords: [v] }))]
  }, [items])

  const nameOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of items) {
      const n = r.item_name?.trim()
      if (n) s.add(n)
    }
    return [{ value: '', label: '전체', keywords: ['전체'] }, ...[...s].sort().map((n) => ({ value: n, label: n, keywords: [n] }))]
  }, [items])

  const manufacturerOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of items) {
      const m = r.manufacturer?.trim()
      if (m) s.add(m)
    }
    return [{ value: '', label: '전체', keywords: ['전체'] }, ...[...s].sort().map((m) => ({ value: m, label: m, keywords: [m] }))]
  }, [items])

  const remarksOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of items) {
      const x = r.remarks?.trim()
      if (x) s.add(x)
    }
    return [{ value: '', label: '전체', keywords: ['전체'] }, ...[...s].sort().map((x) => ({ value: x, label: x, keywords: [x] }))]
  }, [items])

  useEffect(() => {
    setPage(1)
  }, [filterItemCode, filterCategory, filterItemName, filterManufacturer, filterRemarks])

  const filteredItems = useMemo(() => {
    return items.filter((r) => {
      if (filterItemCode.trim() && r.item_code !== filterItemCode.trim()) return false
      const c = getCategory(r.process_metadata)
      if (filterCategory === FILTER_CATEGORY_UNSET) {
        if (c != null) return false
      } else if (filterCategory.trim()) {
        if (c !== filterCategory.trim()) return false
      }
      if (filterItemName.trim() && r.item_name !== filterItemName.trim()) return false
      if (filterManufacturer.trim() && (r.manufacturer ?? '').trim() !== filterManufacturer.trim()) return false
      if (filterRemarks.trim() && (r.remarks ?? '').trim() !== filterRemarks.trim()) return false
      return true
    })
  }, [items, filterItemCode, filterCategory, filterItemName, filterManufacturer, filterRemarks])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredItems.slice(start, start + PAGE_SIZE)
  }, [filteredItems, page])

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const headerCheckedState = useMemo(() => {
    if (filteredItems.length === 0) return false
    const n = filteredItems.filter((r) => selectedIds.has(r.id)).length
    if (n === 0) return false
    if (n === filteredItems.length) return true
    return 'indeterminate' as const
  }, [filteredItems, selectedIds])

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        filteredItems.forEach((r) => next.add(r.id))
      } else {
        filteredItems.forEach((r) => next.delete(r.id))
      }
      return next
    })
  }

  const runBulkDelete = async () => {
    if (!canEdit) return
    const ids = [...selectedIds].filter((id) => items.some((r) => r.id === id))
    if (ids.length === 0) {
      setConfirmBulkOpen(false)
      return
    }
    setBulkDeleting(true)
    const failed: { id: number; reason: string }[] = []

    for (const id of ids) {
      const row = items.find((r) => r.id === id)
      const meta = (row?.process_metadata ?? undefined) as ProcessMetadata | undefined
      const { errorMessage } = await deleteSopFilesForItem(supabase, id, meta)
      if (errorMessage) {
        failed.push({ id, reason: `스토리지: ${errorMessage}` })
        continue
      }
      const { error } = await supabase.from('items').delete().eq('id', id)
      if (error) {
        failed.push({ id, reason: error.message })
      }
    }

    setBulkDeleting(false)
    setConfirmBulkOpen(false)
    setSelectedIds(new Set())
    await loadItems()

    if (failed.length === 0) {
      toast.success(`${ids.length}건의 품목을 삭제했습니다.`)
    } else {
      toast.error('일부 품목 삭제에 실패했습니다.', {
        description: failed.map((f) => `#${f.id}: ${f.reason}`).join('\n'),
      })
    }
  }

  const handleExcelFile = async (file: File) => {
    if (!canEdit) {
      toast.message('엑셀 업로드 권한이 없습니다.')
      return
    }
    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) {
        toast.error('시트를 찾을 수 없습니다.')
        return
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      let ok = 0
      const rowErrors: string[] = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const itemCode = rowString(row, '품목코드', 'item_code', '코드')
        const itemName = rowString(row, '품목명', 'item_name', '이름')
        if (!itemCode || !itemName) continue
        if (itemCode.toUpperCase() === 'SAMPLE-001') continue

        const payload = {
          item_code: itemCode,
          item_name: itemName,
          item_spec: rowString(row, '규격', 'item_spec') || null,
          unit: rowString(row, '단위', 'unit') || 'EA',
          item_type: 'finished',
          manufacturer: rowString(row, '제조사', 'manufacturer') || null,
          remarks: rowString(row, '비고', 'remarks') || null,
          sales_price: 0,
          purchase_price: 0,
          is_active: true,
          is_lot_managed: parseBoolCell(row['LOT관리'] ?? row['is_lot_managed']),
          is_exp_managed: parseBoolCell(row['EXP관리'] ?? row['is_exp_managed']),
          is_sn_managed: parseBoolCell(row['SN관리'] ?? row['is_sn_managed']),
        }

        const { error } = await supabase.from('items').insert(payload)
        if (error) {
          rowErrors.push(`${itemCode}: ${error.message}`)
        } else {
          ok += 1
        }
      }

      if (ok > 0) toast.success(`${ok}건 등록 완료`)
      if (rowErrors.length > 0) {
        toast.error('일부 행에서 오류', { description: rowErrors.slice(0, 8).join('\n') })
      }
      if (ok === 0 && rowErrors.length === 0) {
        toast.message('처리할 유효 행이 없습니다. 품목코드·품목명을 확인하세요.')
      }
      await loadItems()
    } catch (e) {
      toast.error('엑셀 처리 중 오류', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const colCount = 11

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">품목 관리</h1>
          <p className="mt-0.5 font-bold text-muted-foreground">
            품목 목록과 추적/이력 관리 여부를 조회합니다.
            {!permLoading && !canEdit ? (
              <span className="mt-1 block text-amber-700">시스템 관리자 이상만 등록·수정·삭제할 수 있습니다.</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleExcelFile(f)
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={downloadExcelTemplate}>
            템플릿 다운로드
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || !canEdit}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? '업로드 중…' : '엑셀 일괄 업로드'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={selectedIds.size === 0 || bulkDeleting || !canEdit}
            onClick={() => setConfirmBulkOpen(true)}
          >
            일괄 삭제 ({selectedIds.size})
          </Button>
          {canEdit ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/items/process-config">공정 상세 설정</Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button asChild size="sm">
              <Link href="/items/new">품목 개별 등록</Link>
            </Button>
          ) : (
            <Button type="button" size="sm" disabled title="시스템 관리자 이상만 등록할 수 있습니다.">
              품목 개별 등록
            </Button>
          )}
        </div>
      </div>

      <Card size="sm" className="shadow-sm">
        <CardHeader className="border-b pb-2">
          <div>
            <CardTitle className="text-base">품목 목록</CardTitle>
            <CardDescription>맨 위 콤보로 목록을 좁힐 수 있습니다. 수정은 「정보 수정」에서 진행합니다.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-2">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed min-w-[1000px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 px-1">
                      <Checkbox
                        checked={headerCheckedState}
                        onCheckedChange={(v) => toggleSelectAll(v === true)}
                        disabled={!canEdit}
                        aria-label="현재 목록 전체 선택"
                      />
                    </TableHead>
                    <TableHead className="w-[10%] min-w-0 px-1">품목코드</TableHead>
                    <TableHead className="w-[8%] min-w-0 px-1">공정명</TableHead>
                    <TableHead className="w-[16%] min-w-0 px-1">품목명</TableHead>
                    <TableHead className="w-[10%] min-w-0 px-1">제조사</TableHead>
                    <TableHead className="w-[5.5rem] shrink-0 px-1 text-center">공정상세</TableHead>
                    <TableHead className="w-[18%] min-w-0 px-1">규격</TableHead>
                    <TableHead className="w-[4rem] shrink-0 px-1">단위</TableHead>
                    <TableHead className="w-[12%] min-w-0 px-1">비고</TableHead>
                    <TableHead className="w-[6rem] shrink-0 px-1">상태</TableHead>
                    <TableHead className="w-[5.5rem] shrink-0 px-1 text-center">관리</TableHead>
                  </TableRow>
                  <TableRow className="border-b bg-muted/30 hover:bg-muted/30">
                    <TableHead className="py-1.5 text-[10px] font-bold text-muted-foreground">필터</TableHead>
                    <TableHead className="py-1.5">
                      <SearchableCombobox
                        className="min-w-[7rem] text-xs"
                        value={filterItemCode}
                        onChange={setFilterItemCode}
                        options={itemCodeOptions}
                        placeholder="품목코드"
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="py-1.5">
                      <SearchableCombobox
                        className="min-w-[6rem] text-xs"
                        value={filterCategory}
                        onChange={setFilterCategory}
                        options={filterCategoryOptions}
                        placeholder="공정명"
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="py-1.5">
                      <SearchableCombobox
                        className="min-w-[8rem] text-xs"
                        value={filterItemName}
                        onChange={setFilterItemName}
                        options={nameOptions}
                        placeholder="품목명"
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="py-1.5">
                      <SearchableCombobox
                        className="min-w-[6rem] text-xs"
                        value={filterManufacturer}
                        onChange={setFilterManufacturer}
                        options={manufacturerOptions}
                        placeholder="제조사"
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="py-1.5" />
                    <TableHead className="py-1.5" />
                    <TableHead className="py-1.5" />
                    <TableHead className="py-1.5">
                      <SearchableCombobox
                        className="min-w-[6rem] text-xs"
                        value={filterRemarks}
                        onChange={setFilterRemarks}
                        options={remarksOptions}
                        placeholder="비고"
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="py-1.5" />
                    <TableHead className="py-1.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colCount} className="py-10 text-center text-muted-foreground">
                        표시할 품목이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colCount} className="py-10 text-center text-muted-foreground">
                        조건에 맞는 품목이 없습니다. 필터를 바꿔 보세요.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageSlice.map((item) => {
                      const meta = (item.process_metadata ?? {}) as ProcessMetadata
                      const displayMeta = pruneProcessMetadataToMaster(meta, categories)
                      const sopFiles = meta.sopFiles ?? []
                      const detailEnabled = hasProcessDetail(item.process_metadata)

                      return (
                        <Fragment key={item.id}>
                          <TableRow data-state={selectedIds.has(item.id) ? 'selected' : undefined} className="[&_td]:min-w-0 [&_td]:py-2">
                            <TableCell className="px-1">
                              <Checkbox
                                checked={selectedIds.has(item.id)}
                                onCheckedChange={(v) => toggleRow(item.id, v === true)}
                                disabled={!canEdit}
                                aria-label={`선택 ${item.item_code}`}
                              />
                            </TableCell>
                            <TableCell className="px-1 font-semibold">
                              <PeekableTruncated text={item.item_code} onPeek={setPeekText} />
                            </TableCell>
                            <TableCell className="px-1 text-sm text-muted-foreground">
                              <PeekableTruncated text={getCategory(item.process_metadata) ?? ''} onPeek={setPeekText} />
                            </TableCell>
                            <TableCell className="px-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <PeekableTruncated text={item.item_name} className="font-semibold" onPeek={setPeekText} />
                                {item.is_lot_managed && (
                                  <Badge variant="outline" className="h-5 border-blue-200 bg-blue-50 px-1.5 py-0 text-[9px] font-black leading-none text-blue-700 uppercase">
                                    LOT
                                  </Badge>
                                )}
                                {item.is_exp_managed && (
                                  <Badge variant="outline" className="h-5 border-green-200 bg-green-50 px-1.5 py-0 text-[9px] font-black leading-none text-green-700 uppercase">
                                    EXP
                                  </Badge>
                                )}
                                {item.is_sn_managed && (
                                  <Badge variant="outline" className="h-5 border-purple-200 bg-purple-50 px-1.5 py-0 text-[9px] font-black leading-none text-purple-700 uppercase">
                                    S/N
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-1 text-sm text-muted-foreground">
                              <PeekableTruncated text={item.manufacturer} onPeek={setPeekText} />
                            </TableCell>
                            <TableCell className="px-1 text-center">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-[11px] font-black"
                                disabled={!detailEnabled}
                                onClick={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
                              >
                                공정상세
                              </Button>
                            </TableCell>
                            <TableCell className="px-1">
                              <PeekableTruncated text={item.item_spec} className="font-medium text-foreground" onPeek={setPeekText} />
                            </TableCell>
                            <TableCell className="px-1 whitespace-nowrap text-muted-foreground">
                              <PeekableTruncated text={item.unit ?? ''} onPeek={setPeekText} />
                            </TableCell>
                            <TableCell className="px-1 text-sm text-muted-foreground">
                              <PeekableTruncated text={item.remarks} onPeek={setPeekText} />
                            </TableCell>
                            <TableCell className="px-1 text-center">
                              <Badge variant={item.is_active ? 'secondary' : 'destructive'} className="font-black">
                                {item.is_active ? '사용중' : '중단'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {canEdit ? (
                                <Button variant="link" size="sm" className="h-auto p-0 font-black" asChild>
                                  <Link href={`/items/${item.id}`}>정보 수정</Link>
                                </Button>
                              ) : (
                                <span className="text-xs font-bold text-muted-foreground">조회</span>
                              )}
                            </TableCell>
                          </TableRow>
                          {expandedId === item.id ? (
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={colCount} className="p-3">
                                <ItemProcessDetailGrid
                                  meta={displayMeta}
                                  categories={categories}
                                  className="w-full"
                                  equalStepWidths
                                  sopCell={
                                    sopFiles.length === 0 ? (
                                      <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-[10px] font-black" disabled>
                                        다운
                                      </Button>
                                    ) : sopFiles.length === 1 ? (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="h-7 px-2 text-[10px] font-black"
                                        onClick={() => void openSignedSopDownload(sopFiles[0].path)}
                                      >
                                        다운
                                      </Button>
                                    ) : (
                                      <div className="flex flex-col items-stretch gap-0.5">
                                        {sopFiles.map((f) => (
                                          <Button
                                            key={f.path}
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="h-6 truncate px-1 text-[9px] font-black"
                                            title={f.name}
                                            onClick={() => void openSignedSopDownload(f.path)}
                                          >
                                            다운
                                          </Button>
                                        ))}
                                      </div>
                                    )
                                  }
                                />
                                <p className="mt-2 text-center text-[10px] font-bold text-muted-foreground">
                                  공정 단계 정의는 「공정 상세 설정」(시스템 관리자)에서 하고, 각 품목에는 「정보 수정」에서 공정명·체크를 적용합니다.
                                </p>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && filteredItems.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] font-bold text-muted-foreground">
              <span>
                조건 일치 {filteredItems.length}건
                {totalPages > 1
                  ? ` · ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredItems.length)}번째 표시`
                  : null}
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-black" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    이전
                  </Button>
                  <span className="min-w-[3.5rem] text-center font-black text-foreground">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-black"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    다음
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={peekText != null} onOpenChange={(o) => !o && setPeekText(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>전체 내용</AlertDialogTitle>
            <AlertDialogDescription>셀에 마우스를 올리거나 클릭해 확인한 전체 텍스트입니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="max-h-[min(60vh,24rem)] overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium text-foreground">{peekText}</p>
          <AlertDialogFooter>
            <AlertDialogAction>닫기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 품목을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              SOP 파일이 있으면 스토리지에서 먼저 삭제한 뒤 DB 행을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkDeleting}
              variant="destructive"
              onClick={(e) => {
                e.preventDefault()
                void runBulkDelete()
              }}
            >
              {bulkDeleting ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
