'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCurrentUserPermissions, isErpRoleAdminUser } from '@/lib/permissions'

type WarehouseRow = {
  id: number
  code: string
  name: string
  sort_order: number
}

export default function WarehousesAdminPage() {
  const [canManage, setCanManage] = useState(false)
  const [permissionChecked, setPermissionChecked] = useState(false)
  const [rows, setRows] = useState<WarehouseRow[]>([])
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchRows = async () => {
    const { data } = await supabase.from('warehouses').select('id, code, name, sort_order').order('sort_order')
    setRows((data as WarehouseRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    let mounted = true
    void (async () => {
      const user = await getCurrentUserPermissions()
      if (!mounted) return
      setCanManage(isErpRoleAdminUser(user))
      setPermissionChecked(true)
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!permissionChecked || !canManage) return
    const timer = setTimeout(() => {
      void fetchRows()
    }, 0)
    return () => clearTimeout(timer)
  }, [permissionChecked, canManage])

  const reachedLimit = useMemo(() => rows.length >= 100, [rows.length])

  const getNextWarehouseCode = () => {
    const used = new Set(
      rows
        .map((row) => Number(row.code.match(/^WH-(\d{1,3})$/)?.[1] ?? 0))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
    for (let i = 1; i <= 100; i += 1) {
      if (!used.has(i)) return `WH-${String(i).padStart(3, '0')}`
    }
    return null
  }

  const handleCreate = async () => {
    if (reachedLimit) {
      alert('창고는 최대 100개까지 등록할 수 있습니다.')
      return
    }
    const name = newName.trim()
    if (!name) return
    const nextCode = getNextWarehouseCode()
    if (!nextCode) {
      alert('사용 가능한 창고 코드가 없습니다. 관리자에게 문의하세요.')
      return
    }
    const maxSortOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), 0)
    const { error } = await supabase.from('warehouses').insert({
      name,
      code: nextCode,
      sort_order: maxSortOrder + 1,
    })
    if (!error) {
      setNewName('')
      void fetchRows()
      return
    }
    if (error.message.toLowerCase().includes('maximum warehouses reached')) {
      alert('창고는 최대 100개까지 등록할 수 있습니다.')
      return
    }
    if (error.message.toLowerCase().includes('policy') || error.message.toLowerCase().includes('permission')) {
      alert(`창고 추가 권한이 없습니다: ${error.message}`)
      return
    }
    alert(`창고 추가 실패: ${error.message}`)
  }

  const handleRename = async (row: WarehouseRow) => {
    const value = editingName.trim()
    if (!value) {
      alert('창고명은 비워둘 수 없습니다.')
      return
    }
    const { error } = await supabase.from('warehouses').update({ name: value }).eq('id', row.id)
    if (error) {
      alert(`창고명 수정 실패: ${error.message}`)
      return
    }
    setEditingId(null)
    setEditingName('')
    void fetchRows()
  }

  const handleDelete = async (row: WarehouseRow) => {
    if (!confirm(`[${row.code}] ${row.name} 창고를 삭제하시겠습니까?`)) return
    const { data: stockRows, error: stockError } = await supabase
      .from('inventory')
      .select('current_qty')
      .eq('warehouse_id', row.id)

    if (stockError) {
      alert(`재고 확인 실패: ${stockError.message}`)
      return
    }
    const totalQty = (stockRows ?? []).reduce((sum, entry) => sum + Number(entry.current_qty ?? 0), 0)
    if (totalQty > 0) {
      alert('재고가 0이 아닌 창고는 삭제할 수 없습니다.')
      return
    }

    const { error } = await supabase.from('warehouses').delete().eq('id', row.id)
    if (error) {
      if (error.message.toLowerCase().includes('stock > 0')) {
        alert('재고가 0이 아닌 창고는 삭제할 수 없습니다.')
        return
      }
      alert(`창고 삭제 실패: ${error.message}`)
      return
    }
    void fetchRows()
  }

  if (!permissionChecked) {
    return (
      <div className="mx-auto max-w-[1080px] p-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm font-bold text-slate-500">
          권한 확인 중...
        </div>
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-[1080px] p-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm font-bold text-red-700">
          시스템 관리자만 창고 관리 화면을 볼 수 있습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1080px] space-y-4 p-4 md:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">창고 관리</h1>
        <p className="mt-1 text-xs font-bold text-slate-500">
          시스템 관리자 전용 · 생성/수정/삭제만 지원 · 최대 100개
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs font-black text-slate-500">신규 창고 등록</p>
        <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="신규 창고명"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          onClick={handleCreate}
          disabled={reachedLimit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          창고 추가
        </button>
        </div>
        {reachedLimit ? (
          <p className="mt-2 text-xs font-bold text-amber-700">창고가 100개에 도달하여 추가할 수 없습니다.</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">코드</th>
              <th className="px-4 py-3 text-left">이름</th>
              <th className="px-4 py-3 text-left">작업</th>
            </tr>
          </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center font-bold text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-black text-slate-900">{row.code}</td>
                    <td className="px-4 py-3">
                      {editingId === row.id ? (
                        <input
                          className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void handleRename(row)
                            }
                          }}
                        />
                      ) : (
                        <span className="font-semibold text-slate-800">{row.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {editingId === row.id ? (
                          <>
                            <button
                              className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-black text-blue-700"
                              onClick={() => void handleRename(row)}
                            >
                              저장
                            </button>
                            <button
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
                              onClick={() => {
                                setEditingId(null)
                                setEditingName('')
                              }}
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <button
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
                            onClick={() => {
                              setEditingId(row.id)
                              setEditingName(row.name)
                            }}
                          >
                            이름 수정
                          </button>
                        )}
                        <button
                          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-black text-red-700"
                          onClick={() => void handleDelete(row)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center font-bold text-slate-400">
                        등록된 창고가 없습니다.
                      </td>
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
