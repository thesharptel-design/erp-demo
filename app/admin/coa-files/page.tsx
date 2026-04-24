'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import SearchableCombobox from '@/components/SearchableCombobox'
import { getCurrentUserPermissions, isSystemAdminUser } from '@/lib/permissions'

type ItemRow = { id: number; item_code: string; item_name: string }
type WarehouseRow = { id: number; name: string }
type CoaRow = {
  id: number
  item_id: number
  warehouse_id: number | null
  version_no: number
  file_name: string
  storage_path: string
  is_active: boolean
  created_at: string
}

export default function CoaFilesPage() {
  const [allowed, setAllowed] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [items, setItems] = useState<ItemRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [rows, setRows] = useState<CoaRow[]>([])
  const [itemId, setItemId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchAll = async () => {
    const [{ data: itemData }, { data: warehouseData }, { data: coaData }] = await Promise.all([
      supabase.from('items').select('id, item_code, item_name').order('item_code'),
      supabase.from('warehouses').select('id, name').eq('is_active', true).order('sort_order'),
      supabase.from('coa_files').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    setItems((itemData as ItemRow[]) ?? [])
    setWarehouses((warehouseData as WarehouseRow[]) ?? [])
    setRows((coaData as CoaRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUserPermissions()
      setAllowed(isSystemAdminUser(user))
      setPermissionChecked(true)
    })()
  }, [])

  useEffect(() => {
    if (!permissionChecked || !allowed) return
    const timer = setTimeout(() => {
      void fetchAll()
    }, 0)
    return () => clearTimeout(timer)
  }, [allowed, permissionChecked])

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, `[${i.item_code}] ${i.item_name}`])), [items])
  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses])

  if (!permissionChecked) {
    return (
      <div className="p-6 max-w-[1300px] mx-auto">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm font-bold text-slate-500">
          권한 확인 중...
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="p-6 max-w-[1300px] mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm font-bold text-red-700">
          시스템 관리자만 CoA 파일 관리 화면을 볼 수 있습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1300px] mx-auto space-y-5">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900">CoA 파일 관리</h1>
        <p className="text-xs text-gray-500 font-bold mt-1">품목/창고별 CoA 업로드 및 활성 상태 관리</p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-wrap gap-2">
        <SearchableCombobox
          className="w-64"
          value={itemId}
          onChange={setItemId}
          options={items.map((item) => ({
            value: String(item.id),
            label: `[${item.item_code}] ${item.item_name}`,
            keywords: [item.item_code, item.item_name],
          }))}
          placeholder="품목 선택..."
        />
        <SearchableCombobox
          className="w-48"
          value={warehouseId}
          onChange={setWarehouseId}
          options={[
            { value: '', label: '전체 창고용' },
            ...warehouses.map((wh) => ({ value: String(wh.id), label: wh.name, keywords: [wh.name] })),
          ]}
          placeholder="창고 선택"
        />
        <label className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-black cursor-pointer">
          CoA 업로드
          <input
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (!itemId) {
                alert('품목을 선택하세요.')
                e.currentTarget.value = ''
                return
              }
              const scopedWarehouse = warehouseId ? Number(warehouseId) : null
              const currentVersions = rows.filter(
                (row) => row.item_id === Number(itemId) && (row.warehouse_id ?? null) === scopedWarehouse
              )
              const nextVersion = (currentVersions[0]?.version_no ?? 0) + 1
              const path = `coa-files/item-${itemId}/${scopedWarehouse ?? 'all'}/v${nextVersion}-${file.name}`
              const { error: uploadError } = await supabase.storage.from('coa-files').upload(path, file, { upsert: true })
              if (uploadError) {
                alert(uploadError.message)
                e.currentTarget.value = ''
                return
              }
              const { error: insertError } = await supabase.from('coa_files').insert({
                item_id: Number(itemId),
                warehouse_id: scopedWarehouse,
                version_no: nextVersion,
                file_name: file.name,
                storage_path: path,
                mime_type: file.type || null,
                file_size: file.size,
                is_active: true,
              })
              if (insertError) {
                alert(insertError.message)
                e.currentTarget.value = ''
                return
              }
              alert('CoA 업로드 완료')
              e.currentTarget.value = ''
              void fetchAll()
            }}
          />
        </label>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase font-black">
            <tr>
              <th className="px-4 py-3 text-left">품목</th>
              <th className="px-4 py-3 text-left">창고</th>
              <th className="px-4 py-3 text-left">버전</th>
              <th className="px-4 py-3 text-left">파일</th>
              <th className="px-4 py-3 text-left">상태</th>
              <th className="px-4 py-3 text-left">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 font-bold">
                  로딩 중...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 font-bold">
                  등록된 CoA가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold">{itemMap.get(row.item_id) ?? row.item_id}</td>
                  <td className="px-4 py-3">{row.warehouse_id ? warehouseMap.get(row.warehouse_id) ?? '-' : '전체'}</td>
                  <td className="px-4 py-3 font-black">v{row.version_no}</td>
                  <td className="px-4 py-3 text-gray-700">{row.file_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-black border ${
                        row.is_active
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {row.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        className="px-2 py-1 rounded border border-gray-200 text-xs font-black"
                        onClick={async () => {
                          const { data, error } = await supabase.storage.from('coa-files').createSignedUrl(row.storage_path, 60)
                          if (error || !data?.signedUrl) {
                            alert('다운로드 링크 생성 실패')
                            return
                          }
                          window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
                        }}
                      >
                        다운로드
                      </button>
                      <button
                        className="px-2 py-1 rounded border border-orange-200 text-orange-700 bg-orange-50 text-xs font-black"
                        onClick={async () => {
                          const { error } = await supabase.from('coa_files').update({ is_active: !row.is_active }).eq('id', row.id)
                          if (error) alert(error.message)
                          void fetchAll()
                        }}
                      >
                        토글
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
