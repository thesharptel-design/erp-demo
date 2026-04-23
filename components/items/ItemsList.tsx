'use client'

import * as XLSX from 'xlsx'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { type ProcessMetadata } from '@/lib/item-config'
import { cn } from '@/lib/utils'
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

type UploadConflictPolicy = 'skip' | 'overwrite' | 'rename_add'

type ExcelUploadRow = {
  item_code: string
  item_name: string
  item_spec: string | null
  unit: string
  manufacturer: string | null
  remarks: string | null
  is_lot_managed: boolean
  is_exp_managed: boolean
  is_sn_managed: boolean
}

type PendingExcelUpload = {
  fileName: string
  rows: ExcelUploadRow[]
  conflictCodeCount: number
  conflictNameCount: number
  duplicateInFileCount: number
  skippedInvalidCount: number
  conflictRows: Array<{
    rowNo: number
    item_code: string
    item_name: string
    codeConflict: boolean
    nameConflict: boolean
  }>
}

type UploadSummary = {
  requested: number
  inserted: number
  skipped: number
  overwritten: number
  renamedInserted: number
  failed: number
}

function normalizeText(v: string | null | undefined) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
}

function buildRenamedValue(base: string, used: Set<string>, suffixLabel: string) {
  const seed = base.trim() || suffixLabel
  let attempt = 1
  while (attempt <= 9999) {
    const candidate = `${seed}-${suffixLabel}${String(attempt).padStart(2, '0')}`
    const key = normalizeText(candidate)
    if (!used.has(key)) return candidate
    attempt += 1
  }
  return `${seed}-${suffixLabel}${Date.now()}`
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

export default function ItemsList() {
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [permUser, setPermUser] = useState<CurrentUserPermissions | null>(null)
  const [permLoading, setPermLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPolicy, setUploadPolicy] = useState<UploadConflictPolicy>('skip')
  const [confirmUploadOpen, setConfirmUploadOpen] = useState(false)
  const [pendingUpload, setPendingUpload] = useState<PendingExcelUpload | null>(null)
  const [uploadOverrides, setUploadOverrides] = useState<Record<number, UploadConflictPolicy>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [filterItemCode, setFilterItemCode] = useState('')
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
    const itemsRes = await supabase
      .from('items')
      .select(
        'id, item_code, item_name, item_spec, unit, is_active, is_lot_managed, is_exp_managed, is_sn_managed, manufacturer, remarks, process_metadata'
      )
      .order('id', { ascending: true })

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
  }, [filterItemCode, filterItemName, filterManufacturer, filterRemarks])

  const filteredItems = useMemo(() => {
    const codeQuery = filterItemCode.trim().toLowerCase()
    const nameQuery = filterItemName.trim().toLowerCase()
    const manufacturerQuery = filterManufacturer.trim().toLowerCase()
    const remarksQuery = filterRemarks.trim().toLowerCase()

    return items.filter((r) => {
      if (codeQuery && !r.item_code.toLowerCase().includes(codeQuery)) return false

      if (nameQuery && !r.item_name.toLowerCase().includes(nameQuery)) return false
      if (manufacturerQuery && !(r.manufacturer ?? '').trim().toLowerCase().includes(manufacturerQuery)) return false
      if (remarksQuery && !(r.remarks ?? '').trim().toLowerCase().includes(remarksQuery)) return false
      return true
    })
  }, [items, filterItemCode, filterItemName, filterManufacturer, filterRemarks])

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

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) {
        toast.error('시트를 찾을 수 없습니다.')
        return
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const parsedRows: ExcelUploadRow[] = []
      const fileCodeSeen = new Set<string>()
      const fileNameSeen = new Set<string>()
      let duplicateInFileCount = 0
      let skippedInvalidCount = 0

      for (const row of rawRows) {
        const itemCode = rowString(row, '품목코드', 'item_code', '코드')
        const itemName = rowString(row, '품목명', 'item_name', '이름')
        if (!itemCode || !itemName) {
          skippedInvalidCount += 1
          continue
        }
        if (itemCode.toUpperCase() === 'SAMPLE-001') continue

        const codeKey = normalizeText(itemCode)
        const nameKey = normalizeText(itemName)
        if (fileCodeSeen.has(codeKey) || fileNameSeen.has(nameKey)) {
          duplicateInFileCount += 1
        }
        fileCodeSeen.add(codeKey)
        fileNameSeen.add(nameKey)

        parsedRows.push({
          item_code: itemCode,
          item_name: itemName,
          item_spec: rowString(row, '규격', 'item_spec') || null,
          unit: rowString(row, '단위', 'unit') || 'EA',
          manufacturer: rowString(row, '제조사', 'manufacturer') || null,
          remarks: rowString(row, '비고', 'remarks') || null,
          is_lot_managed: parseBoolCell(row['LOT관리'] ?? row['is_lot_managed']),
          is_exp_managed: parseBoolCell(row['EXP관리'] ?? row['is_exp_managed']),
          is_sn_managed: parseBoolCell(row['SN관리'] ?? row['is_sn_managed']),
        })
      }

      if (parsedRows.length === 0) {
        toast.message('처리할 유효 행이 없습니다. 품목코드·품목명을 확인하세요.')
        return
      }

      const codes = Array.from(new Set(parsedRows.map((r) => r.item_code.trim())))
      const names = Array.from(new Set(parsedRows.map((r) => r.item_name.trim())))

      const [codeConflictRes, nameConflictRes] = await Promise.all([
        supabase.from('items').select('id,item_code').in('item_code', codes),
        supabase.from('items').select('id,item_name').in('item_name', names),
      ])

      const conflictCodeCount = (codeConflictRes.data ?? []).length
      const conflictNameCount = (nameConflictRes.data ?? []).length
      const codeConflictSet = new Set((codeConflictRes.data ?? []).map((r) => normalizeText(r.item_code)))
      const nameConflictSet = new Set((nameConflictRes.data ?? []).map((r) => normalizeText(r.item_name)))

      const conflictRows = parsedRows
        .map((row, index) => {
          const codeConflict = codeConflictSet.has(normalizeText(row.item_code))
          const nameConflict = nameConflictSet.has(normalizeText(row.item_name))
          return {
            rowNo: index + 1,
            item_code: row.item_code,
            item_name: row.item_name,
            codeConflict,
            nameConflict,
          }
        })
        .filter((r) => r.codeConflict || r.nameConflict)

      setPendingUpload({
        fileName: file.name,
        rows: parsedRows,
        conflictCodeCount,
        conflictNameCount,
        duplicateInFileCount,
        skippedInvalidCount,
        conflictRows,
      })
      setUploadOverrides({})
      setConfirmUploadOpen(true)
    } catch (e) {
      toast.error('엑셀 분석 중 오류', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const runExcelUploadWithPolicy = async () => {
    if (!pendingUpload) return

    setUploading(true)
    setConfirmUploadOpen(false)

    const summary: UploadSummary = {
      requested: pendingUpload.rows.length,
      inserted: 0,
      skipped: 0,
      overwritten: 0,
      renamedInserted: 0,
      failed: 0,
    }
    const rowErrors: string[] = []

    try {
      const codeSet = new Set(pendingUpload.rows.map((r) => r.item_code.trim()))
      const nameSet = new Set(pendingUpload.rows.map((r) => r.item_name.trim()))
      const [codeRes, nameRes] = await Promise.all([
        supabase
          .from('items')
          .select('id,item_code,item_name')
          .in('item_code', Array.from(codeSet)),
        supabase
          .from('items')
          .select('id,item_code,item_name')
          .in('item_name', Array.from(nameSet)),
      ])

      const existingByCode = new Map<string, { id: number; item_code: string; item_name: string | null }>()
      const existingByName = new Map<string, { id: number; item_code: string; item_name: string | null }>()
      const usedCodeKeys = new Set<string>()
      const usedNameKeys = new Set<string>()

      for (const row of (codeRes.data ?? []) as { id: number; item_code: string; item_name: string | null }[]) {
        const key = normalizeText(row.item_code)
        existingByCode.set(key, row)
        usedCodeKeys.add(key)
        if (row.item_name) usedNameKeys.add(normalizeText(row.item_name))
      }
      for (const row of (nameRes.data ?? []) as { id: number; item_code: string; item_name: string | null }[]) {
        const key = normalizeText(row.item_name)
        existingByName.set(key, row)
        usedCodeKeys.add(normalizeText(row.item_code))
        if (row.item_name) usedNameKeys.add(key)
      }

      for (const [idx, row] of pendingUpload.rows.entries()) {
        const basePayload = {
          item_code: row.item_code.trim(),
          item_name: row.item_name.trim(),
          item_spec: row.item_spec,
          unit: row.unit.trim() || 'EA',
          item_type: 'finished',
          manufacturer: row.manufacturer,
          remarks: row.remarks,
          sales_price: 0,
          purchase_price: 0,
          is_active: true,
          is_lot_managed: row.is_lot_managed,
          is_exp_managed: row.is_exp_managed,
          is_sn_managed: row.is_sn_managed,
        }

        const codeKey = normalizeText(basePayload.item_code)
        const nameKey = normalizeText(basePayload.item_name)
        const hasCodeConflict = existingByCode.has(codeKey)
        const hasNameConflict = existingByName.has(nameKey)
        const hasConflict = hasCodeConflict || hasNameConflict
        const effectivePolicy = hasConflict ? (uploadOverrides[idx] ?? uploadPolicy) : uploadPolicy

        if (hasConflict && effectivePolicy === 'skip') {
          summary.skipped += 1
          continue
        }

        if (hasConflict && effectivePolicy === 'overwrite') {
          const target = existingByCode.get(codeKey) ?? existingByName.get(nameKey)
          if (!target) {
            summary.failed += 1
            rowErrors.push(`${basePayload.item_code}: 덮어쓰기 대상 행을 찾지 못했습니다.`)
            continue
          }

          const { error } = await supabase.from('items').update(basePayload).eq('id', target.id)
          if (error) {
            summary.failed += 1
            rowErrors.push(`${basePayload.item_code}: ${error.message}`)
            continue
          }

          summary.overwritten += 1
          existingByCode.set(normalizeText(basePayload.item_code), {
            id: target.id,
            item_code: basePayload.item_code,
            item_name: basePayload.item_name,
          })
          existingByName.set(normalizeText(basePayload.item_name), {
            id: target.id,
            item_code: basePayload.item_code,
            item_name: basePayload.item_name,
          })
          usedCodeKeys.add(normalizeText(basePayload.item_code))
          usedNameKeys.add(normalizeText(basePayload.item_name))
          continue
        }

        const payload = { ...basePayload }
        let isRenamedInsert = false

        if (hasConflict && effectivePolicy === 'rename_add') {
          if (hasCodeConflict) {
            payload.item_code = buildRenamedValue(payload.item_code, usedCodeKeys, 'COPY')
          }
          if (hasNameConflict) {
            payload.item_name = buildRenamedValue(payload.item_name, usedNameKeys, 'NEW')
          }
          isRenamedInsert = true
        }

        const { error } = await supabase.from('items').insert(payload)
        if (error) {
          summary.failed += 1
          rowErrors.push(`${basePayload.item_code}: ${error.message}`)
          continue
        }

        if (isRenamedInsert) summary.renamedInserted += 1
        else summary.inserted += 1

        usedCodeKeys.add(normalizeText(payload.item_code))
        usedNameKeys.add(normalizeText(payload.item_name))
        existingByCode.set(normalizeText(payload.item_code), { id: -1, item_code: payload.item_code, item_name: payload.item_name })
        existingByName.set(normalizeText(payload.item_name), { id: -1, item_code: payload.item_code, item_name: payload.item_name })
      }

      await loadItems()

      toast.success(`엑셀 업로드 완료 (${summary.requested}건 요청)`, {
        description: [
          `신규 등록 ${summary.inserted}건`,
          `건너뛰기 ${summary.skipped}건`,
          `덮어쓰기 ${summary.overwritten}건`,
          `이름/코드 변경 추가 ${summary.renamedInserted}건`,
          `실패 ${summary.failed}건`,
        ].join('\n'),
      })

      if (pendingUpload.skippedInvalidCount > 0) {
        toast.message(`빈 코드/이름 등 유효하지 않은 ${pendingUpload.skippedInvalidCount}행은 자동 제외했습니다.`)
      }
      if (rowErrors.length > 0) {
        toast.error('일부 행 처리 실패', { description: rowErrors.slice(0, 8).join('\n') })
      }
    } catch (e) {
      toast.error('엑셀 업로드 처리 중 오류', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setUploading(false)
      setPendingUpload(null)
      setUploadOverrides({})
    }
  }

  const colCount = 9

  return (
    <div className="flex w-full flex-col space-y-6">
      <div className="mb-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-gray-900">품목 관리</h1>
          <p className="mt-1 text-sm font-bold text-gray-500">
            품목 목록과 추적/이력 관리 여부를 조회합니다.
            {!permLoading && !canEdit ? (
              <span className="mt-1 block text-amber-700">시스템 관리자 이상만 등록·수정·삭제할 수 있습니다.</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex h-9 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-3 text-[11px] font-black text-gray-800 hover:bg-gray-50"
            disabled={loading}
            onClick={() => void loadItems()}
          >
            새로고침
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex h-9 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-3 text-[11px] font-black text-gray-800 hover:bg-gray-50"
            onClick={downloadExcelTemplate}
          >
            템플릿
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex h-9 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-3 text-[11px] font-black text-gray-800 hover:bg-gray-50"
            disabled={uploading || !canEdit}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? '업로드 중…' : '엑셀 업로드'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex h-9 items-center justify-center rounded-xl border-2 border-black bg-white px-3 text-[11px] font-black text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-gray-50 active:translate-y-1 active:shadow-none"
            disabled={selectedIds.size === 0 || bulkDeleting || !canEdit}
            onClick={() => setConfirmBulkOpen(true)}
          >
            일괄 삭제 ({selectedIds.size})
          </Button>
          {canEdit ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="inline-flex h-9 items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-3 text-[11px] font-black text-gray-800 hover:bg-gray-50"
            >
              <Link href="/items/process-config">공정 설정</Link>
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              asChild
              size="sm"
              className="inline-flex h-9 items-center justify-center rounded-xl border-2 border-black bg-blue-600 px-3 text-[11px] font-black text-white shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all hover:bg-blue-700 active:translate-y-1 active:shadow-none"
            >
              <Link href="/items/new">개별 등록</Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled
              title="시스템 관리자 이상만 등록할 수 있습니다."
              className="inline-flex h-9 items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-100 px-3 text-[11px] font-black text-gray-400"
            >
              개별 등록
            </Button>
          )}
        </div>
      </div>

      <Card size="sm" className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <CardHeader className="border-b-2 border-black pb-3">
          <div>
            <CardTitle className="text-xl font-black tracking-tight text-gray-900">품목 목록</CardTitle>
            <CardDescription className="text-sm font-bold text-gray-500">맨 위 필터로 목록을 좁힐 수 있습니다.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <div className="min-h-[min(68vh,calc(100dvh-15rem))] overflow-x-auto rounded-t-2xl bg-white">
              <Table className="w-full min-w-[960px] table-fixed text-sm">
                <TableHeader className="sticky top-0 z-20 border-b-2 border-black bg-gray-50 text-left text-xs font-black uppercase tracking-wider text-gray-400">
                  <TableRow>
                    <TableHead className="w-10 px-1">
                      <Checkbox
                        checked={headerCheckedState}
                        onCheckedChange={(v) => toggleSelectAll(v === true)}
                        disabled={!canEdit}
                        aria-label="현재 목록 전체 선택"
                      />
                    </TableHead>
                    <TableHead className="w-[12%] min-w-0 px-2 py-4">품목코드</TableHead>
                    <TableHead className="w-[20%] min-w-0 px-3 py-4">품목명</TableHead>
                    <TableHead className="w-[12%] min-w-0 px-3 py-4">제조사</TableHead>
                    <TableHead className="w-[18%] min-w-0 px-3 py-4">규격</TableHead>
                    <TableHead className="w-[4rem] shrink-0 px-2 py-4">단위</TableHead>
                    <TableHead className="w-[16%] min-w-0 px-3 py-4">비고</TableHead>
                    <TableHead className="w-[6rem] shrink-0 px-2 py-4 text-center">상태</TableHead>
                    <TableHead className="w-[5.5rem] shrink-0 px-2 py-4 text-center">관리</TableHead>
                  </TableRow>
                  <TableRow className="border-b border-gray-200 bg-gray-100/80 text-[11px] font-bold normal-case tracking-normal text-gray-600 hover:bg-gray-100/80">
                    <TableHead className="py-2 text-[10px] font-semibold text-gray-500">필터</TableHead>
                    <TableHead className="relative z-30 px-2 py-2 align-middle font-semibold">
                      <SearchableCombobox
                        className="min-w-[7rem] text-xs"
                        value={filterItemCode}
                        onChange={setFilterItemCode}
                        options={itemCodeOptions}
                        placeholder="품목코드"
                        creatable
                        dropdownPlacement="auto"
                        showClearOption={false}
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="relative z-30 px-2 py-2 align-middle font-semibold">
                      <SearchableCombobox
                        className="min-w-[8rem] text-xs"
                        value={filterItemName}
                        onChange={setFilterItemName}
                        options={nameOptions}
                        placeholder="품목명"
                        creatable
                        dropdownPlacement="auto"
                        showClearOption={false}
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="relative z-30 px-2 py-2 align-middle font-semibold">
                      <SearchableCombobox
                        className="min-w-[6rem] text-xs"
                        value={filterManufacturer}
                        onChange={setFilterManufacturer}
                        options={manufacturerOptions}
                        placeholder="제조사"
                        creatable
                        dropdownPlacement="auto"
                        showClearOption={false}
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="py-1.5" />
                    <TableHead className="py-1.5" />
                    <TableHead className="relative z-30 px-2 py-2 align-middle font-semibold">
                      <SearchableCombobox
                        className="min-w-[6rem] text-xs"
                        value={filterRemarks}
                        onChange={setFilterRemarks}
                        options={remarksOptions}
                        placeholder="비고"
                        creatable
                        dropdownPlacement="auto"
                        showClearOption={false}
                        listMaxHeightClass="max-h-[min(14rem,45vh)] overflow-y-auto"
                      />
                    </TableHead>
                    <TableHead className="py-1.5" />
                    <TableHead className="py-1.5" />
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 bg-white">
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colCount} className="min-h-[48vh] align-middle p-12 text-center text-sm font-bold text-gray-400">
                        표시할 품목이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={colCount} className="min-h-[48vh] align-middle p-12 text-center text-sm font-bold text-gray-400">
                        조건에 맞는 품목이 없습니다. 필터를 바꿔 보세요.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageSlice.map((item) => (
                      <TableRow
                        key={item.id}
                        data-state={selectedIds.has(item.id) ? 'selected' : undefined}
                        className="[&_td]:min-w-0 [&_td]:py-2 transition-colors hover:bg-gray-50"
                      >
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
                              <Badge
                                variant="outline"
                                className={
                                  item.is_active
                                    ? 'border-emerald-300 bg-emerald-50 font-black text-emerald-700'
                                    : 'border-red-300 bg-red-50 font-black text-red-700'
                                }
                              >
                                {item.is_active ? '사용중' : '중단'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              {canEdit ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-[11px] font-black text-gray-700 hover:bg-gray-50"
                                  asChild
                                >
                                  <Link href={`/items/${item.id}`}>정보 수정</Link>
                                </Button>
                              ) : (
                                <span className="text-xs font-bold text-muted-foreground">조회</span>
                              )}
                            </TableCell>
                          </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && filteredItems.length > 0 ? (
            <div className="flex flex-col gap-3 border-t-2 border-black bg-gray-50 px-4 py-3 text-[11px] font-bold text-gray-600 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <span>
                조건 일치 {filteredItems.length}건
                {totalPages > 1
                  ? ` · ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredItems.length)}번째 표시`
                  : null}
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-2 border-black bg-white px-3 text-xs font-black text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    이전
                  </Button>
                  <span className="min-w-[4.5rem] text-center font-black text-gray-700">
                    {page} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-2 border-black bg-white px-3 text-xs font-black text-gray-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-100 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none"
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

      <AlertDialog
        open={confirmUploadOpen}
        onOpenChange={(open) => {
          setConfirmUploadOpen(open)
          if (!open) {
            setPendingUpload(null)
            setUploadOverrides({})
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>엑셀 업로드 충돌 처리 옵션</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUpload
                ? [
                    `파일: ${pendingUpload.fileName}`,
                    `요청 ${pendingUpload.rows.length}건`,
                    `코드 충돌 ${pendingUpload.conflictCodeCount}건`,
                    `이름 충돌 ${pendingUpload.conflictNameCount}건`,
                    `파일 내 중복 ${pendingUpload.duplicateInFileCount}건`,
                  ].join(' · ')
                : '충돌 처리 방식을 선택하세요.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="upload-policy"
                checked={uploadPolicy === 'skip'}
                onChange={() => setUploadPolicy('skip')}
              />
              <span className="font-bold text-gray-800">건너뛰기 (중복 행은 제외)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="upload-policy"
                checked={uploadPolicy === 'overwrite'}
                onChange={() => setUploadPolicy('overwrite')}
              />
              <span className="font-bold text-gray-800">덮어쓰기 (기존 품목 수정)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="upload-policy"
                checked={uploadPolicy === 'rename_add'}
                onChange={() => setUploadPolicy('rename_add')}
              />
              <span className="font-bold text-gray-800">이름/코드 변경 후 추가</span>
            </label>
          </div>
          {pendingUpload && pendingUpload.conflictRows.length > 0 ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs font-black text-gray-600">
                예외 행 지정 ({pendingUpload.conflictRows.length}건 충돌, 기본 정책: {uploadPolicy})
              </p>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {pendingUpload.conflictRows.slice(0, 20).map((row) => {
                  const rowIdx = row.rowNo - 1
                  const rowPolicy = uploadOverrides[rowIdx] ?? uploadPolicy
                  return (
                    <div key={`${row.rowNo}-${row.item_code}`} className="flex flex-col gap-1 rounded-md border border-gray-100 bg-gray-50 px-2 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-black text-gray-700">#{row.rowNo}</span>
                        <span className="font-bold text-gray-800">{row.item_code}</span>
                        <span className="text-gray-600">{row.item_name}</span>
                      </div>
                      <div className="text-[11px] font-bold text-amber-700">
                        {row.codeConflict ? '코드 중복' : ''}{row.codeConflict && row.nameConflict ? ' · ' : ''}
                        {row.nameConflict ? '이름 중복' : ''}
                      </div>
                      <select
                        value={rowPolicy}
                        onChange={(e) => {
                          const next = e.target.value as UploadConflictPolicy
                          setUploadOverrides((prev) => {
                            const base = { ...prev }
                            if (next === uploadPolicy) delete base[rowIdx]
                            else base[rowIdx] = next
                            return base
                          })
                        }}
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-bold text-gray-800"
                      >
                        <option value="skip">건너뛰기</option>
                        <option value="overwrite">덮어쓰기</option>
                        <option value="rename_add">이름/코드 변경 추가</option>
                      </select>
                    </div>
                  )
                })}
                {pendingUpload.conflictRows.length > 20 ? (
                  <p className="px-1 text-[11px] font-bold text-gray-500">
                    충돌이 많아 상위 20건만 표시됩니다. 표시되지 않은 행은 기본 정책을 따릅니다.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={uploading || !pendingUpload}
              onClick={(e) => {
                e.preventDefault()
                void runExcelUploadWithPolicy()
              }}
            >
              {uploading ? '처리 중…' : '선택 방식으로 업로드'}
            </AlertDialogAction>
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
