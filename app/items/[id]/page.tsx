'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Item = {
  id: number
  item_code: string
  item_name: string
  item_spec: string | null
  unit: string
  item_type: string
  sales_price: number
  purchase_price: number
  safety_stock_qty: number
  is_active: boolean
}

type Bom = {
  id: number
  bom_code: string
  parent_item_id: number
  version_no: string
  status: string
  remarks: string | null
}

type BomItem = {
  id: number
  bom_id: number
  line_no: number
  child_item_id: number
  qty: number
  remarks: string | null
}

type SupabaseUpdateError = {
  code?: string
  message: string
}

function getItemErrorMessage(error: SupabaseUpdateError) {
  const message = error.message.toLowerCase()

  if (error.code === '23505') {
    if (message.includes('item_code')) {
      return '품목 코드가 중복되었습니다. 다른 품목 코드를 입력하십시오.'
    }
    return '중복된 값이 있습니다. 입력값을 다시 확인하십시오.'
  }

  if (error.code === '23502') {
    if (message.includes('item_code')) {
      return '품목 코드를 입력하십시오.'
    }
    if (message.includes('item_name')) {
      return '품목명을 입력하십시오.'
    }
    if (message.includes('item_type')) {
      return '품목 유형을 선택하십시오.'
    }
    return '필수 입력값이 누락되었습니다. 입력 내용을 확인하십시오.'
  }

  if (error.code === '23514') {
    return '입력값 형식이 올바르지 않습니다. 입력 내용을 다시 확인하십시오.'
  }

  if (message.includes('row-level security') || message.includes('permission denied')) {
    return '수정 권한이 없습니다. 관리자에게 문의하십시오.'
  }

  if (message.includes('network') || message.includes('fetch')) {
    return '네트워크 오류가 발생했습니다. 인터넷 연결 상태를 확인한 후 다시 시도하십시오.'
  }

  return '품목 수정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}

function getBomStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '사용중'
    case 'inactive':
      return '미사용'
    default:
      return status
  }
}

function getBomStatusStyle(status: string) {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-700'
    case 'inactive':
      return 'bg-gray-100 text-gray-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

export default function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()

  const [itemId, setItemId] = useState<number | null>(null)
  const [itemCode, setItemCode] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemSpec, setItemSpec] = useState('')
  const [unit, setUnit] = useState('EA')
  const [itemType, setItemType] = useState('finished')
  const [salesPrice, setSalesPrice] = useState('0')
  const [purchasePrice, setPurchasePrice] = useState('0')
  const [safetyStockQty, setSafetyStockQty] = useState('0')
  const [isActive, setIsActive] = useState(true)

  const [bomHeader, setBomHeader] = useState<Bom | null>(null)
  const [bomItems, setBomItems] = useState<BomItem[]>([])
  const [allItems, setAllItems] = useState<Item[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    async function loadItem() {
      const resolvedParams = await params
      const id = Number(resolvedParams.id)

      if (Number.isNaN(id)) {
        setErrorMessage('잘못된 품목 경로입니다.')
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        setErrorMessage('품목 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      const item = data as Item

      setItemId(item.id)
      setItemCode(item.item_code)
      setItemName(item.item_name)
      setItemSpec(item.item_spec ?? '')
      setUnit(item.unit)
      setItemType(item.item_type)
      setSalesPrice(String(item.sales_price ?? 0))
      setPurchasePrice(String(item.purchase_price ?? 0))
      setSafetyStockQty(String(item.safety_stock_qty ?? 0))
      setIsActive(item.is_active)

      const [
        { data: bomData, error: bomError },
        { data: itemsData, error: itemsError },
      ] = await Promise.all([
        supabase
          .from('boms')
          .select('*')
          .eq('parent_item_id', item.id)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('items').select('*').order('id'),
      ])

      if (itemsError) {
        setErrorMessage('품목 마스터 정보를 불러오지 못했습니다.')
        setIsLoading(false)
        return
      }

      setAllItems((itemsData as Item[]) ?? [])

      if (!bomError && bomData) {
        const typedBom = bomData as Bom
        setBomHeader(typedBom)

        const { data: bomItemsData, error: bomItemsError } = await supabase
          .from('bom_items')
          .select('*')
          .eq('bom_id', typedBom.id)
          .order('line_no')

        if (bomItemsError) {
          setErrorMessage('BOM 구성 정보를 불러오지 못했습니다.')
          setIsLoading(false)
          return
        }

        setBomItems((bomItemsData as BomItem[]) ?? [])
      }

      setIsLoading(false)
    }

    loadItem()
  }, [params])

  const itemMap = useMemo(
    () => new Map(allItems.map((item) => [item.id, item])),
    [allItems]
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setErrorMessage('')
    setSuccessMessage('')

    if (!itemId) {
      setErrorMessage('품목 정보가 올바르지 않습니다.')
      return
    }

    if (!itemCode.trim()) {
      setErrorMessage('품목 코드를 입력하십시오.')
      return
    }

    if (!itemName.trim()) {
      setErrorMessage('품목명을 입력하십시오.')
      return
    }

    setIsSaving(true)

    const { error } = await supabase
      .from('items')
      .update({
        item_code: itemCode.trim(),
        item_name: itemName.trim(),
        item_spec: itemSpec.trim() || null,
        unit: unit.trim() || 'EA',
        item_type: itemType,
        sales_price: Number(salesPrice) || 0,
        purchase_price: Number(purchasePrice) || 0,
        safety_stock_qty: Number(safetyStockQty) || 0,
        is_active: isActive,
      })
      .eq('id', itemId)

    setIsSaving(false)

    if (error) {
      setErrorMessage(getItemErrorMessage(error))
      return
    }

    setSuccessMessage('품목 정보가 저장되었습니다.')
    router.refresh()
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white p-8 shadow">
        <p className="text-gray-500">품목 정보를 불러오는 중입니다...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/items"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 품목 목록으로
          </Link>
          <h1 className="mt-2 text-3xl font-bold">품목 상세 / 수정</h1>
          <p className="mt-1 text-gray-600">품목 정보를 조회하고 수정합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              품목코드
            </label>
            <input
              value={itemCode}
              onChange={(e) => setItemCode(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              품목명
            </label>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              규격
            </label>
            <input
              value={itemSpec}
              onChange={(e) => setItemSpec(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              단위
            </label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              품목유형
            </label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            >
              <option value="finished">완제품</option>
              <option value="raw_material">원재료</option>
              <option value="sub_material">부자재</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              판매단가
            </label>
            <input
              type="number"
              value={salesPrice}
              onChange={(e) => setSalesPrice(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              구매단가
            </label>
            <input
              type="number"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              안전재고
            </label>
            <input
              type="number"
              value={safetyStockQty}
              onChange={(e) => setSafetyStockQty(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              사용 여부
            </label>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>

          <Link
            href="/items"
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            목록으로
          </Link>
        </div>
      </form>

      <div className="rounded-2xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">BOM 구성</h2>
            <p className="mt-1 text-sm text-gray-500">
              이 품목이 부모품목으로 등록된 BOM 구성을 확인합니다.
            </p>
          </div>

          {bomHeader && (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getBomStatusStyle(
                bomHeader.status
              )}`}
            >
              {getBomStatusLabel(bomHeader.status)}
            </span>
          )}
        </div>

        {!bomHeader ? (
          <div className="rounded-xl bg-gray-50 px-4 py-6 text-sm text-gray-500">
            이 품목에 연결된 BOM이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <span className="font-medium">BOM 코드:</span> {bomHeader.bom_code}
              <span className="ml-4 font-medium">버전:</span> {bomHeader.version_no}
              {bomHeader.remarks && (
                <>
                  <span className="ml-4 font-medium">비고:</span> {bomHeader.remarks}
                </>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3">순번</th>
                    <th className="px-4 py-3">자재코드</th>
                    <th className="px-4 py-3">자재명</th>
                    <th className="px-4 py-3">유형</th>
                    <th className="px-4 py-3">소요량</th>
                    <th className="px-4 py-3">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {bomItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        BOM 자재행 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    bomItems.map((bomItem) => {
                      const childItem = itemMap.get(bomItem.child_item_id)

                      return (
                        <tr key={bomItem.id} className="border-t border-gray-100">
                          <td className="px-4 py-3">{bomItem.line_no}</td>
                          <td className="px-4 py-3">
                            {childItem?.item_code ?? '-'}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {childItem?.item_name ?? '-'}
                          </td>
                          <td className="px-4 py-3">
                            {childItem?.item_type ?? '-'}
                          </td>
                          <td className="px-4 py-3">{bomItem.qty}</td>
                          <td className="px-4 py-3">
                            {bomItem.remarks ?? '-'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}