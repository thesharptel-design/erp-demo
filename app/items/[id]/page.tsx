'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SearchableCombobox from '@/components/SearchableCombobox'
import { Checkbox } from '@/components/ui/checkbox'
import {
  buildProcessMetadata,
  pruneProcessMetadataToMaster,
  type ItemProcessCategories,
  type ProcessMetadata,
  type SopFileRef,
} from '@/lib/item-config'
import { fetchItemProcessCategories } from '@/lib/item-process-config'
import { getItemErrorMessage } from '@/lib/item-form-errors'
import { deleteSopFilesForItem, uploadItemSopFile } from '@/lib/item-sop-storage'
import { canEditItemsMaster, getCurrentUserPermissions } from '@/lib/permissions'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

export default function ItemEditPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit()
  const resolvedParams = React.use(params)
  const id = resolvedParams.id

  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [itemCode, setItemCode] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemSpec, setItemSpec] = useState('')
  const [unit, setUnit] = useState('EA')
  const [salesPrice, setSalesPrice] = useState('0')
  const [purchasePrice, setPurchasePrice] = useState('0')
  const [manufacturer, setManufacturer] = useState('')
  const [remarks, setRemarks] = useState('')
  const [isLotManaged, setIsLotManaged] = useState(false)
  const [isExpManaged, setIsExpManaged] = useState(false)
  const [isSnManaged, setIsSnManaged] = useState(false)
  const [isActive, setIsActive] = useState(true)

  const [processMeta, setProcessMeta] = useState<ProcessMetadata>({})
  const [processCategories, setProcessCategories] = useState<ItemProcessCategories>({})
  const [canEdit, setCanEdit] = useState(false)
  const [sopUploading, setSopUploading] = useState(false)

  const itemIdNum = Number(id)

  async function persistProcessMetadata(nextSop: SopFileRef[]) {
    const process_metadata = buildProcessMetadata(
      {
        category: processMeta.category ?? '',
        checks: processMeta.checks ?? {},
        sopFiles: nextSop,
      },
      processCategories
    )
    const { error } = await supabase.from('items').update({ process_metadata }).eq('id', id)
    if (error) throw error
    setProcessMeta(process_metadata)
  }

  useEffect(() => {
    async function loadItem() {
      setLoadError('')
      const [cat, u, itemRes] = await Promise.all([
        fetchItemProcessCategories(supabase),
        getCurrentUserPermissions(),
        supabase
          .from('items')
          .select(
            'item_code, item_name, item_spec, unit, sales_price, purchase_price, manufacturer, remarks, is_lot_managed, is_exp_managed, is_sn_managed, is_active, process_metadata'
          )
          .eq('id', id)
          .single(),
      ])
      setProcessCategories(cat)
      setCanEdit(canEditItemsMaster(u))
      const { data, error } = itemRes
      if (error) {
        setLoadError(error.message)
        return
      }
      if (data) {
        setItemCode(data.item_code)
        setItemName(data.item_name)
        setItemSpec(data.item_spec || '')
        setUnit(data.unit || 'EA')
        setSalesPrice(String(data.sales_price))
        setPurchasePrice(String(data.purchase_price))
        setManufacturer(data.manufacturer ?? '')
        setRemarks(data.remarks ?? '')
        setIsLotManaged(data.is_lot_managed)
        setIsExpManaged(data.is_exp_managed)
        setIsSnManaged(data.is_sn_managed)
        setIsActive(data.is_active)
        const raw = (data.process_metadata ?? {}) as ProcessMetadata
        setProcessMeta(pruneProcessMetadataToMaster(raw, cat))
      }
    }
    void loadItem()
  }, [id])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')
    if (!canEdit) {
      setErrorMessage('품목 수정 권한이 없습니다.')
      return
    }
    await runSingleSubmit(async () => {
      setIsSaving(true)
      try {
      const { data: duplicate } = await supabase.from('items').select('id').eq('item_name', itemName.trim()).neq('id', id).maybeSingle()

      if (duplicate) {
        setErrorMessage(`'${itemName.trim()}'은(는) 이미 다른 품목에서 사용 중인 이름입니다.`)
        setIsSaving(false)
        return
      }

      const process_metadata = buildProcessMetadata(
        {
          category: processMeta.category ?? '',
          checks: processMeta.checks ?? {},
          sopFiles: processMeta.sopFiles ?? [],
        },
        processCategories
      )

      const { error } = await supabase
        .from('items')
        .update({
          item_code: itemCode.trim(),
          item_name: itemName.trim(),
          item_spec: itemSpec.trim() || null,
          unit: unit.trim() || 'EA',
          item_type: 'finished',
          sales_price: Number(salesPrice) || 0,
          purchase_price: Number(purchasePrice) || 0,
          manufacturer: manufacturer.trim() || null,
          remarks: remarks.trim() || null,
          is_lot_managed: isLotManaged,
          is_exp_managed: isExpManaged,
          is_sn_managed: isSnManaged,
          is_active: isActive,
          process_metadata,
        })
        .eq('id', id)

      if (error) {
        setErrorMessage(getItemErrorMessage(error))
        setIsSaving(false)
        return
      }

      setIsSaving(false)
      alert('품목 정보가 수정되었습니다.')
      router.push('/items')
      router.refresh()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '오류가 발생했습니다.'
        setErrorMessage(msg)
        setIsSaving(false)
      }
    })
  }

  async function handleHardDelete() {
    if (!canEdit) {
      alert('삭제 권한이 없습니다.')
      return
    }
    if (!Number.isFinite(itemIdNum)) {
      alert('잘못된 품목 ID입니다.')
      return
    }
    await runSingleSubmit(async () => {
      setIsDeleting(true)
      const metaSnapshot = buildProcessMetadata(
        {
          category: processMeta.category ?? '',
          checks: processMeta.checks ?? {},
          sopFiles: processMeta.sopFiles ?? [],
        },
        processCategories
      )
      const { errorMessage: storageErr } = await deleteSopFilesForItem(supabase, itemIdNum, metaSnapshot)
      if (storageErr) {
        alert(`스토리지 정리 실패: ${storageErr}`)
        setIsDeleting(false)
        return
      }
      const { error } = await supabase.from('items').delete().eq('id', id)
      setIsDeleting(false)
      if (error) {
        alert(`품목 삭제 실패: ${error.message}`)
        return
      }
      setDeleteOpen(false)
      router.push('/items')
      router.refresh()
    })
  }

  const sopFiles = processMeta.sopFiles ?? []
  const processCategory = (processMeta.category ?? '').trim()
  const processCheckLabels =
    processCategory && processCategory in processCategories ? [...(processCategories[processCategory] ?? [])] : []

  const processCategoryOptions = useMemo(() => {
    const keys = Object.keys(processCategories)
    const orphan =
      processCategory && !keys.includes(processCategory)
        ? [{ value: processCategory, label: `${processCategory} (마스터에 없음)`, keywords: [processCategory] }]
        : []
    return [
      { value: '', label: '공정 상세 미사용', keywords: ['미사용', '없음', '공정'] },
      ...orphan,
      ...keys.map((k) => ({ value: k, label: k, keywords: [k] })),
    ]
  }, [processCategories, processCategory])

  function handleProcessCategoryChange(next: string) {
    const v = next.trim()
    setProcessMeta((prev) => {
      if (!v) {
        const next: ProcessMetadata = { ...prev }
        delete next.category
        delete next.checks
        return next
      }
      const labels = v in processCategories ? [...(processCategories[v] ?? [])] : []
      const nextChecks: Record<string, boolean> = {}
      for (const label of labels) {
        if (prev.checks?.[label]) nextChecks[label] = true
      }
      return {
        ...prev,
        category: v,
        checks: Object.keys(nextChecks).length > 0 ? nextChecks : undefined,
      }
    })
  }

  function toggleProcessCheck(label: string, checked: boolean) {
    setProcessMeta((prev) => {
      const checks = { ...(prev.checks ?? {}) }
      if (checked) checks[label] = true
      else delete checks[label]
      return { ...prev, checks: Object.keys(checks).length > 0 ? checks : undefined }
    })
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-4">
        <Link href="/items" className="text-sm font-bold text-gray-500 hover:text-gray-700">
          ← 품목 목록으로
        </Link>
        <p className="text-red-600">{loadError}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/items" className="text-sm font-bold text-gray-500 hover:text-gray-700">
            ← 품목 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">품목 정보 수정</h1>
          <p className="mt-1 font-medium text-gray-600">기존 품목의 상세 정보를 수정합니다.</p>
        </div>
      </div>

      {!canEdit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          시스템 관리자 이상만 품목 정보를 수정·삭제할 수 있습니다. 조회만 가능합니다.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-100 bg-white p-5 shadow">
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목코드</label>
            <input
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none transition-all focus:border-black"
              required
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목명 (중복 체크 대상)</label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 font-medium outline-none transition-all ${errorMessage.includes('품목명') ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-black'}`}
              required
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">규격</label>
            <input
              value={itemSpec}
              onChange={(e) => setItemSpec(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none transition-all focus:border-black"
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">단위</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none transition-all focus:border-black"
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">제조사</label>
            <input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none transition-all focus:border-black"
              placeholder="선택 입력"
              disabled={!canEdit}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-bold text-gray-700">비고</label>
            <input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium outline-none transition-all focus:border-black"
              placeholder="선택 입력"
              disabled={!canEdit}
            />
          </div>

          <div className="col-span-1 flex items-center gap-3 md:col-span-2">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={!canEdit}
              className="h-5 w-5 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="isActive" className="text-sm font-bold text-gray-700">
              활성 품목
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
            <p className="mb-1 text-sm font-black text-gray-900">공정 상세 정보 (선택)</p>
            <p className="mb-3 text-xs font-bold text-muted-foreground">
              「품목 관리 → 공정 상세 설정」에서 정의한 공정 템플릿(공정명·세부 항목)을 이 품목에 적용합니다. 미사용으로 두면 공정 체크를 쓰지 않습니다.
            </p>
            <label className="mb-1.5 block text-xs font-bold text-gray-600">적용 공정명</label>
            <SearchableCombobox
              value={processMeta.category ?? ''}
              onChange={handleProcessCategoryChange}
              options={processCategoryOptions}
              placeholder="공정 상세 미사용 또는 공정명 선택"
              disabled={!canEdit}
              showClearOption={false}
            />
            {processCategory && !(processCategory in processCategories) ? (
              <p className="mt-2 text-xs font-bold text-amber-800">
                이 공정명은 현재 마스터에 없습니다. 시스템 관리자가 「공정 상세 설정」에 추가하거나, 다른 공정명을 선택하세요.
              </p>
            ) : null}
            {processCategory && processCategory in processCategories ? (
              <div className="mt-4 space-y-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-bold text-gray-600">공정 체크 (해당 품목만)</p>
                {processCheckLabels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">이 공정명에는 세부 체크 항목이 없습니다.</p>
                ) : (
                  <ul className="max-h-[min(40vh,18rem)] space-y-2 overflow-y-auto pr-1">
                    {processCheckLabels.map((label) => (
                      <li key={label} className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5">
                        <Checkbox
                          id={`pc-${label}`}
                          checked={!!processMeta.checks?.[label]}
                          onCheckedChange={(v) => toggleProcessCheck(label, v === true)}
                          disabled={!canEdit}
                          className="mt-0.5"
                        />
                        <label htmlFor={`pc-${label}`} className="cursor-pointer text-sm font-medium leading-snug text-gray-800">
                          {label}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
            <p className="mb-1 text-sm font-black text-gray-900">SOP 파일</p>
            <p className="mb-3 text-xs text-gray-500">파일을 추가·삭제하면 즉시 저장됩니다.</p>
            <label
              className={`inline-flex cursor-pointer rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 ${!canEdit || sopUploading || isSaving ? 'pointer-events-none opacity-50' : ''}`}
            >
              파일 추가
              <input
                type="file"
                className="hidden"
                disabled={!canEdit || sopUploading || isSaving}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.currentTarget.value = ''
                  if (!file || !Number.isFinite(itemIdNum)) return
                  setSopUploading(true)
                  const { ref, errorMessage } = await uploadItemSopFile(supabase, itemIdNum, file)
                  setSopUploading(false)
                  if (errorMessage || !ref) {
                    alert(errorMessage ?? '업로드 실패')
                    return
                  }
                  await persistProcessMetadata([...sopFiles, ref])
                }}
              />
            </label>
            {sopFiles.length > 0 ? (
              <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                {sopFiles.map((f) => (
                  <li
                    key={f.path}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-gray-800">{f.name}</span>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
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
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={sopUploading || isSaving}
                          className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                          onClick={async () => {
                            if (!confirm('이 SOP 파일을 삭제하시겠습니까?')) return
                            const { error: rmErr } = await supabase.storage.from('sop-files').remove([f.path])
                            if (rmErr) {
                              alert(rmErr.message)
                              return
                            }
                            await persistProcessMetadata(sopFiles.filter((x) => x.path !== f.path))
                          }}
                        >
                          삭제
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="col-span-1 mt-2 rounded-xl border border-blue-100 bg-blue-50/50 p-5 md:col-span-2">
            <h3 className="mb-4 text-sm font-black tracking-tight text-blue-900">추적 / 이력 관리 설정</h3>
            <div className="flex flex-wrap gap-8">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isLotManaged}
                  onChange={(e) => setIsLotManaged(e.target.checked)}
                  disabled={!canEdit}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="text-sm font-bold text-gray-700">LOT 번호 관리</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isExpManaged}
                  onChange={(e) => setIsExpManaged(e.target.checked)}
                  disabled={!canEdit}
                  className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-600"
                />
                <span className="text-sm font-bold text-gray-700">유효기간 (EXP) 관리</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSnManaged}
                  onChange={(e) => setIsSnManaged(e.target.checked)}
                  disabled={!canEdit}
                  className="h-5 w-5 rounded border-gray-300 text-purple-600 focus:ring-purple-600"
                />
                <span className="text-sm font-bold text-gray-700">S/N (시리얼) 관리</span>
              </label>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">{errorMessage}</div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isSaving || isMutating || !canEdit}
            className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '수정사항 저장'}
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={async () => {
              if (!confirm('정말 사용 중단하시겠습니까?')) return
              await supabase.from('items').update({ is_active: false }).eq('id', id)
              router.push('/items')
            }}
            className="rounded-xl bg-red-50 px-6 py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-600 hover:text-white disabled:opacity-50"
          >
            사용 중단
          </button>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={!canEdit || isMutating}
                className="rounded-xl border border-red-200 bg-white px-6 py-3 text-sm font-bold text-red-700 transition-all hover:bg-red-50 disabled:opacity-50"
              >
                품목 삭제
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>품목을 삭제할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  SOP 스토리지 파일을 먼저 삭제한 뒤 DB에서 품목 행을 제거합니다. 되돌릴 수 없습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
                <Button type="button" variant="destructive" disabled={isDeleting} onClick={() => void handleHardDelete()}>
                  {isDeleting ? '삭제 중...' : '삭제'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Link
            href="/items"
            className="rounded-xl border-2 border-gray-200 px-6 py-3 text-sm font-bold text-gray-600 transition-all hover:text-black"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
