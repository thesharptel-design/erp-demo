'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ItemProcessAccordion } from '@/components/items/ItemProcessAccordion'
import { buildProcessMetadata, type ItemProcessCategories, type ProcessMetadata, type SopFileRef } from '@/lib/item-config'
import { fetchItemProcessCategories } from '@/lib/item-process-config'
import { getItemErrorMessage } from '@/lib/item-form-errors'
import { uploadItemSopFile } from '@/lib/item-sop-storage'
import { canEditItemsMaster, getCurrentUserPermissions } from '@/lib/permissions'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

export default function NewItemPage() {
  const router = useRouter()
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit()
  const [permReady, setPermReady] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [processCategories, setProcessCategories] = useState<ItemProcessCategories>({})

  useEffect(() => {
    void (async () => {
      const u = await getCurrentUserPermissions()
      if (!canEditItemsMaster(u)) {
        router.replace('/items')
        return
      }
      setCanEdit(true)
      setProcessCategories(await fetchItemProcessCategories(supabase))
      setPermReady(true)
    })()
  }, [router])

  const [itemCode, setItemCode] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemSpec, setItemSpec] = useState('')
  const [unit, setUnit] = useState('EA')
  const [salesPrice] = useState('0')
  const [purchasePrice] = useState('0')
  const [manufacturer, setManufacturer] = useState('')
  const [remarks, setRemarks] = useState('')

  const [isLotManaged, setIsLotManaged] = useState(false)
  const [isExpManaged, setIsExpManaged] = useState(false)
  const [isSnManaged, setIsSnManaged] = useState(false)

  const [category, setCategory] = useState('')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [checksSyncKey, setChecksSyncKey] = useState(0)
  const [pendingSopFiles, setPendingSopFiles] = useState<File[]>([])

  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  function handleCategoryChange(v: string) {
    setCategory(v)
    setChecks({})
    setChecksSyncKey((k) => k + 1)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMessage('')

    if (!itemCode.trim()) {
      setErrorMessage('품목 코드를 입력하십시오.')
      return
    }
    if (!itemName.trim()) {
      setErrorMessage('품목명을 입력하십시오.')
      return
    }

    await runSingleSubmit(async () => {
      setIsSaving(true)
      try {
      const { data: existingName } = await supabase.from('items').select('id').eq('item_name', itemName.trim()).maybeSingle()

      if (existingName) {
        setErrorMessage(`'${itemName.trim()}'은(는) 이미 존재하는 품목명입니다.`)
        setIsSaving(false)
        return
      }

      const process_metadata: ProcessMetadata = buildProcessMetadata(
        {
          category,
          checks,
          sopFiles: [],
        },
        processCategories
      )

      const { data: inserted, error } = await supabase
        .from('items')
        .insert({
          item_code: itemCode.trim(),
          item_name: itemName.trim(),
          item_spec: itemSpec.trim() || null,
          unit: unit.trim() || 'EA',
          item_type: 'finished',
          sales_price: Number(salesPrice) || 0,
          purchase_price: Number(purchasePrice) || 0,
          manufacturer: manufacturer.trim() || null,
          remarks: remarks.trim() || null,
          process_metadata,
          is_active: true,
          is_lot_managed: isLotManaged,
          is_exp_managed: isExpManaged,
          is_sn_managed: isSnManaged,
        })
        .select('id')
        .single()

      if (error) {
        setErrorMessage(getItemErrorMessage(error))
        setIsSaving(false)
        return
      }

      const newId = inserted?.id as number | undefined
      if (newId != null && pendingSopFiles.length > 0) {
        const uploaded: SopFileRef[] = []
        for (const file of pendingSopFiles) {
          const { ref, errorMessage: upErr } = await uploadItemSopFile(supabase, newId, file)
          if (upErr || !ref) {
            setErrorMessage(upErr ?? 'SOP 업로드 실패')
            setIsSaving(false)
            alert('품목은 저장되었으나 일부 SOP 업로드에 실패했습니다. 품목 수정 화면에서 다시 올려 주세요.')
            router.push(`/items/${newId}`)
            router.refresh()
            return
          }
          uploaded.push(ref)
        }
        const merged: ProcessMetadata = buildProcessMetadata(
          {
            category,
            checks,
            sopFiles: uploaded,
          },
          processCategories
        )
        const { error: metaErr } = await supabase.from('items').update({ process_metadata: merged }).eq('id', newId)
        if (metaErr) {
          setErrorMessage(metaErr.message)
          setIsSaving(false)
          return
        }
      }

      setIsSaving(false)
      alert('품목이 성공적으로 등록되었습니다.')
      router.push('/items')
      router.refresh()
      } catch {
        setErrorMessage('예상치 못한 오류가 발생했습니다.')
        setIsSaving(false)
      }
    })
  }

  if (!permReady || !canEdit) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">권한을 확인하는 중…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/items" className="text-sm font-bold text-gray-500 hover:text-gray-700">
            ← 품목 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">품목 등록</h1>
          <p className="mt-1 font-medium text-gray-600">새로운 품목 정보를 등록합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-100 bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목코드</label>
            <input
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium transition-all outline-none focus:border-black focus:ring-1 focus:ring-black"
              placeholder="예: FG010"
              required
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">품목명 (중복 불가)</label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className={`w-full rounded-xl border px-4 py-3 font-medium transition-all outline-none ${errorMessage.includes('품목명') ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-black'}`}
              placeholder="예: 진단키트 A형"
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
              placeholder="예: SET"
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-gray-700">단위</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-medium transition-all focus:border-black"
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

          <ItemProcessAccordion
            categories={processCategories}
            category={category}
            onCategoryChange={handleCategoryChange}
            checks={checks}
            checksSyncKey={checksSyncKey}
            onChecksChange={setChecks}
            sopFiles={[]}
            pendingSopFiles={pendingSopFiles}
            onPendingSopFilesChange={setPendingSopFiles}
            itemId={null}
            disabled={isSaving || !canEdit}
          />

          <div className="col-span-1 mt-2 rounded-xl border border-blue-100 bg-blue-50/50 p-5 md:col-span-2">
            <h3 className="mb-4 text-sm font-black tracking-tight text-blue-900">추적 / 이력 관리 설정</h3>
            <div className="flex flex-wrap gap-8">
              <label className="group flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isLotManaged}
                  onChange={(e) => setIsLotManaged(e.target.checked)}
                  disabled={!canEdit}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-bold text-gray-700 transition-colors group-hover:text-black">LOT 번호 관리</span>
              </label>
              <label className="group flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isExpManaged}
                  onChange={(e) => setIsExpManaged(e.target.checked)}
                  disabled={!canEdit}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-bold text-gray-700 transition-colors group-hover:text-black">유효기간 (EXP) 관리</span>
              </label>
              <label className="group flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSnManaged}
                  onChange={(e) => setIsSnManaged(e.target.checked)}
                  disabled={!canEdit}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm font-bold text-gray-700 transition-colors group-hover:text-black">S/N (시리얼) 관리</span>
              </label>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-6 animate-pulse rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            {errorMessage}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button
            type="submit"
            disabled={isSaving || isMutating || !canEdit}
            className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '품목 저장'}
          </button>
          <Link
            href="/items"
            className="rounded-xl border-2 border-gray-200 px-6 py-3 text-sm font-bold text-gray-600 transition-all hover:border-gray-300 hover:text-black"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
