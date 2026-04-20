'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type WarehouseRow = {
  id: number
  code: string
  name: string
  is_active: boolean
  sort_order: number
}

export default function WarehousesAdminPage() {
  const [rows, setRows] = useState<WarehouseRow[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchRows = async () => {
    const { data } = await supabase.from('warehouses').select('id, code, name, is_active, sort_order').order('sort_order')
    setRows((data as WarehouseRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRows()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const maxSortOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), 0)
    const existingCodeNums = rows
      .map((row) => Number((row.code.match(/^WH-(\d+)$/)?.[1] ?? 0)))
      .filter((n) => Number.isFinite(n))
    let nextCodeNum = existingCodeNums.reduce((max, n) => Math.max(max, n), 0) + 1

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nextCode = `WH-${String(nextCodeNum).padStart(2, '0')}`
      const { error } = await supabase.from('warehouses').insert({
        name,
        code: nextCode,
        sort_order: maxSortOrder + 1,
        is_active: true,
      })
      if (!error) {
        setNewName('')
        void fetchRows()
        return
      }
      if (error.message.toLowerCase().includes('code')) {
        nextCodeNum += 1
        continue
      }
      if (error.message.toLowerCase().includes('policy') || error.message.toLowerCase().includes('permission')) {
        alert(`창고 추가 권한이 없습니다: ${error.message}`)
        return
      }
      alert(`창고 추가 실패: ${error.message}`)
      return
    }

    alert('창고 코드 생성 충돌이 반복되었습니다. 잠시 후 다시 시도하세요.')
    return
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-gray-900">창고 관리</h1>
        <p className="text-xs text-gray-500 font-bold mt-1">최대 20개 창고 관리 + 템플릿 업로드/리셋</p>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="신규 창고명"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-black text-sm">
          창고 추가
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase font-black">
            <tr>
              <th className="px-4 py-3 text-left">코드</th>
              <th className="px-4 py-3 text-left">이름</th>
              <th className="px-4 py-3 text-left">상태</th>
              <th className="px-4 py-3 text-left">템플릿</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400 font-bold">
                  로딩 중...
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-black">{row.code}</td>
                  <td className="px-4 py-3">
                    <input
                      className="border border-gray-200 rounded px-2 py-1 text-sm w-full"
                      value={row.name}
                      onChange={(e) =>
                        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))
                      }
                      onBlur={async (e) => {
                        const value = e.target.value.trim()
                        if (!value) return
                        const { error } = await supabase.from('warehouses').update({ name: value }).eq('id', row.id)
                        if (error) alert(error.message)
                        void fetchRows()
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className={`px-2 py-1 rounded text-xs font-black border ${
                        row.is_active
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                      onClick={async () => {
                        const { error } = await supabase
                          .from('warehouses')
                          .update({ is_active: !row.is_active })
                          .eq('id', row.id)
                        if (error) alert(error.message)
                        void fetchRows()
                      }}
                    >
                      {row.is_active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <label className="px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-black cursor-pointer">
                        업로드
                        <input
                          type="file"
                          className="hidden"
                          accept=".xlsx,.xls,.csv"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const path = `warehouse-templates/${row.id}/${file.name}`
                            const { error } = await supabase.storage.from('warehouse-templates').upload(path, file, {
                              upsert: true,
                            })
                            if (error) alert(error.message)
                            else alert('템플릿 업로드 완료')
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>
                      <button
                        className="px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 text-xs font-black"
                        onClick={async () => {
                          const { data } = await supabase.storage
                            .from('warehouse-templates')
                            .list(`warehouse-templates/${row.id}`)
                          const targets = (data || []).map((f) => `warehouse-templates/${row.id}/${f.name}`)
                          if (targets.length === 0) {
                            alert('리셋할 템플릿이 없습니다.')
                            return
                          }
                          const { error } = await supabase.storage.from('warehouse-templates').remove(targets)
                          if (error) alert(error.message)
                          else alert('창고 템플릿 리셋 완료')
                        }}
                      >
                        리셋
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
