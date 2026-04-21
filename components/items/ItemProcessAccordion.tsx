'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SearchableCombobox from '@/components/SearchableCombobox'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ItemProcessCategories, SopFileRef } from '@/lib/item-config'
import { uploadItemSopFile } from '@/lib/item-sop-storage'

type CheckRow = { id: string; text: string; checked: boolean }

function initCheckRows(category: string, categories: ItemProcessCategories, checks: Record<string, boolean>): CheckRow[] {
  if (!category.trim()) return []
  const labels = category in categories ? [...(categories[category] ?? [])] : []
  const extra = Object.keys(checks).filter((k) => !labels.includes(k))
  const rows: CheckRow[] = [
    ...labels.map((text, i) => ({ id: `L-${category}-${i}`, text, checked: !!checks[text] })),
    ...extra.map((text, j) => ({ id: `E-${category}-${j}-${text}`, text, checked: !!checks[text] })),
  ]
  if (rows.length === 0) {
    return [{ id: `blank-${category}`, text: '', checked: false }]
  }
  return rows
}

function rowsToChecks(rows: CheckRow[]): Record<string, boolean> {
  const o: Record<string, boolean> = {}
  for (const r of rows) {
    const t = r.text.trim()
    if (!t) continue
    if (o[t] !== undefined) continue
    if (r.checked) o[t] = true
  }
  return o
}

type Props = {
  categories: ItemProcessCategories
  category: string
  onCategoryChange: (v: string) => void
  checks: Record<string, boolean>
  /** Bump after 서버 로드 또는 공정명 변경 직후 — 체크 행 템플릿 재구성 */
  checksSyncKey: number
  onChecksChange: (next: Record<string, boolean>) => void
  sopFiles: SopFileRef[]
  pendingSopFiles: File[]
  onPendingSopFilesChange: (files: File[]) => void
  itemId: number | null
  onEditSopUploaded?: (ref: SopFileRef) => Promise<void>
  onEditSopRemove?: (ref: SopFileRef) => Promise<void>
  disabled?: boolean
}

export function ItemProcessAccordion({
  categories,
  category,
  onCategoryChange,
  checks,
  checksSyncKey,
  onChecksChange,
  sopFiles,
  pendingSopFiles,
  onPendingSopFilesChange,
  itemId,
  onEditSopUploaded,
  onEditSopRemove,
  disabled = false,
}: Props) {
  const [sopUploading, setSopUploading] = useState(false)
  const [checkRows, setCheckRows] = useState<CheckRow[]>(() => initCheckRows(category, categories, checks))
  const checksRef = useRef(checks)

  useLayoutEffect(() => {
    checksRef.current = checks
  })

  const categoryKeys = Object.keys(categories)
  const orphanCategory = category.trim() && !categoryKeys.includes(category.trim()) ? category.trim() : null
  const CATEGORY_OPTIONS = [
    { value: '', label: '공정명 미선택' },
    ...(orphanCategory ? [{ value: orphanCategory, label: `${orphanCategory} (현재값)`, keywords: [orphanCategory] }] : []),
    ...categoryKeys.map((k) => ({ value: k, label: k, keywords: [k] })),
  ]

  useEffect(() => {
    setCheckRows(initCheckRows(category, categories, checksRef.current))
  }, [category, categories, checksSyncKey])

  const pushChecks = useCallback(
    (rows: CheckRow[]) => {
      setCheckRows(rows)
      onChecksChange(rowsToChecks(rows))
    },
    [onChecksChange]
  )

  const addRow = () => {
    pushChecks([...checkRows, { id: `row-${crypto.randomUUID()}`, text: '', checked: false }])
  }

  const removeRow = (id: string) => {
    pushChecks(checkRows.filter((r) => r.id !== id))
  }

  const updateRowText = (id: string, text: string) => {
    pushChecks(checkRows.map((r) => (r.id === id ? { ...r, text } : r)))
  }

  const updateRowChecked = (id: string, checked: boolean) => {
    pushChecks(checkRows.map((r) => (r.id === id ? { ...r, checked } : r)))
  }

  return (
    <Accordion type="single" collapsible defaultValue="process" className="col-span-1 w-full rounded-xl border border-gray-200 bg-white md:col-span-2">
      <AccordionItem value="process" className="border-none px-4">
        <AccordionTrigger className="text-sm font-black text-gray-900 hover:no-underline">
          공정 상세 정보 (선택)
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-6 pt-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-gray-700">공정명</label>
              <SearchableCombobox
                value={category}
                onChange={onCategoryChange}
                options={CATEGORY_OPTIONS}
                placeholder="공정명 검색 또는 입력"
                disabled={disabled}
                creatable={!disabled}
                showClearOption={false}
              />
              <p className="mt-1 text-xs text-muted-foreground">목록에 없으면 입력 후 「…로 적용」으로 추가할 수 있습니다.</p>
            </div>

            {category.trim() ? (
              <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-gray-500">공정 체크 항목 (항목명 수정·추가·삭제 가능)</p>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-black" disabled={disabled} onClick={addRow}>
                    항목 추가
                  </Button>
                </div>
                <div className="flex max-h-[min(50vh,22rem)] flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1">
                  {checkRows.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        disabled={disabled}
                        onChange={(e) => updateRowChecked(row.id, e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                      />
                      <Input
                        value={row.text}
                        disabled={disabled}
                        onChange={(e) => updateRowText(row.id, e.target.value)}
                        placeholder="체크 항목 내용"
                        className="min-w-0 flex-1 border-gray-200 text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs font-bold text-red-600"
                        disabled={disabled}
                        onClick={() => removeRow(row.id)}
                      >
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-sm font-bold text-gray-700">SOP 파일</p>
              <p className="mb-2 text-xs text-gray-500">
                {itemId == null
                  ? '저장 후 품목 ID가 생기면 스토리지에 업로드됩니다. 미리 선택한 파일은 등록 완료 시 함께 올라갑니다.'
                  : '파일 선택 시 즉시 업로드됩니다.'}
              </p>
              <label
                className={`inline-flex cursor-pointer rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 ${disabled || sopUploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                파일 추가
                <input
                  type="file"
                  className="hidden"
                  disabled={disabled || sopUploading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.currentTarget.value = ''
                    if (!file) return
                    if (itemId != null && onEditSopUploaded) {
                      setSopUploading(true)
                      const { ref, errorMessage } = await uploadItemSopFile(supabase, itemId, file)
                      setSopUploading(false)
                      if (errorMessage || !ref) {
                        alert(errorMessage ?? '업로드 실패')
                        return
                      }
                      await onEditSopUploaded(ref)
                      return
                    }
                    onPendingSopFilesChange([...pendingSopFiles, file])
                  }}
                />
              </label>

              {pendingSopFiles.length > 0 && (
                <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                  {pendingSopFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
                      <span className="truncate font-medium text-gray-800">{f.name}</span>
                      <button
                        type="button"
                        disabled={disabled}
                        className="shrink-0 text-xs font-bold text-red-600 hover:underline"
                        onClick={() => onPendingSopFilesChange(pendingSopFiles.filter((_, j) => j !== i))}
                      >
                        제거
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {sopFiles.length > 0 && (
                <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {sopFiles.map((f) => (
                    <li key={f.path} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium text-gray-800">{f.name}</span>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          disabled={disabled}
                          className="text-xs font-bold text-blue-600 hover:underline"
                          onClick={async () => {
                            const { data, error } = await supabase.storage.from('sop-files').createSignedUrl(f.path, 120)
                            if (error || !data?.signedUrl) {
                              alert('다운로드 링크 생성 실패')
                              return
                            }
                            window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
                          }}
                        >
                          다운로드
                        </button>
                        {onEditSopRemove ? (
                          <button
                            type="button"
                            disabled={disabled || sopUploading}
                            className="text-xs font-bold text-red-600 hover:underline"
                            onClick={async () => {
                              if (!confirm('이 SOP 파일을 삭제하시겠습니까?')) return
                              await onEditSopRemove(f)
                            }}
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
