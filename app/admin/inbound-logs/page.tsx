'use client'

import { useEffect, useState } from 'react'
import { getCurrentUserPermissions, isSystemAdminUser } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'

type InboundLogRow = {
  id: number
  source_type: 'single' | 'template'
  file_name: string | null
  total_rows: number
  success_rows: number
  failed_rows: number
  requested_by: string | null
  created_at: string
}

type InboundLogDetailRow = {
  id: number
  row_no: number
  status: 'success' | 'failed'
  message: string | null
  item_code: string | null
  item_name: string | null
  warehouse_code: string | null
  customer_code: string | null
  qty: number | null
  lot_no: string | null
  exp_date: string | null
  serial_no: string | null
}

export default function InboundLogsAdminPage() {
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<InboundLogRow[]>([])
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailRows, setDetailRows] = useState<InboundLogDetailRow[]>([])

  const summarizeTypeCell = (log: InboundLogRow) => {
    if (selectedLogId !== log.id) {
      if (log.source_type === 'single') return '단건'
      if (log.failed_rows > 0) return `템플릿 · ${log.total_rows}건 (실패 ${log.failed_rows})`
      return `템플릿 · ${log.total_rows}건`
    }
    const successRows = detailRows.filter((r) => r.status === 'success')
    const uniqueNames = Array.from(new Set(successRows.map((r) => (r.item_name ?? '').trim()).filter(Boolean)))
    if (log.source_type === 'single') {
      if (uniqueNames.length > 0) return `단건 · ${uniqueNames[0]}`
      return '단건'
    }
    if (uniqueNames.length === 0) {
      if (log.failed_rows > 0) return `템플릿 · ${log.total_rows}건 (실패 ${log.failed_rows})`
      return `템플릿 · ${log.total_rows}건`
    }
    if (uniqueNames.length === 1) return `템플릿 · ${uniqueNames[0]}`
    return `템플릿 · ${uniqueNames[0]} 외 ${uniqueNames.length - 1}`
  }

  useEffect(() => {
    void (async () => {
      const user = await getCurrentUserPermissions()
      setAllowed(isSystemAdminUser(user))
      setChecking(false)
    })()
  }, [])

  const loadLogs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('inbound_upload_logs')
      .select('id, source_type, file_name, total_rows, success_rows, failed_rows, requested_by, created_at')
      .order('id', { ascending: false })
      .limit(200)
    if (!error) setRows((data as InboundLogRow[]) ?? [])
    setLoading(false)
  }

  const loadDetail = async (logId: number) => {
    setSelectedLogId(logId)
    setDetailLoading(true)
    const { data, error } = await supabase
      .from('inbound_upload_log_rows')
      .select('id, row_no, status, message, item_code, item_name, warehouse_code, customer_code, qty, lot_no, exp_date, serial_no')
      .eq('log_id', logId)
      .order('row_no', { ascending: true })
      .limit(1000)
    if (!error) {
      const baseRows = (data as InboundLogDetailRow[]) ?? []
      const missingCodes = Array.from(
        new Set(
          baseRows
            .filter((r) => !String(r.item_name ?? '').trim() && String(r.item_code ?? '').trim())
            .map((r) => String(r.item_code ?? '').trim())
        )
      )

      if (missingCodes.length === 0) {
        setDetailRows(baseRows)
      } else {
        const { data: itemRows } = await supabase
          .from('items')
          .select('item_code, item_name')
          .in('item_code', missingCodes)
        const itemNameByCode = new Map<string, string>()
        for (const row of (itemRows as Array<{ item_code: string; item_name: string }> | null) ?? []) {
          const code = String(row.item_code ?? '').trim()
          const name = String(row.item_name ?? '').trim()
          if (code && name) itemNameByCode.set(code, name)
        }
        setDetailRows(
          baseRows.map((r) => ({
            ...r,
            item_name: String(r.item_name ?? '').trim() || (r.item_code ? itemNameByCode.get(String(r.item_code).trim()) ?? null : null),
          }))
        )
      }
    }
    setDetailLoading(false)
  }

  useEffect(() => {
    if (!checking && allowed) {
      void loadLogs()
    }
  }, [checking, allowed])

  if (checking) {
    return (
      <div className="mx-auto max-w-[1200px] p-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm font-bold text-slate-500">
          권한 확인 중...
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-[1200px] p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm font-bold text-red-700">
          시스템 관리자만 입고 로그를 조회할 수 있습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 md:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">입고 로그 조회</h1>
        <p className="mt-1 text-xs font-bold text-slate-500">
          단건/템플릿 입고 처리 결과 감사로그
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-black text-slate-700">로그 목록</p>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-700"
          >
            새로고침
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">유형</th>
                <th className="px-3 py-2 text-left">파일명</th>
                <th className="px-3 py-2 text-left">총건수</th>
                <th className="px-3 py-2 text-left">성공</th>
                <th className="px-3 py-2 text-left">실패</th>
                <th className="px-3 py-2 text-left">요청시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center font-bold text-slate-400">
                    로그가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer hover:bg-slate-50 ${selectedLogId === row.id ? 'bg-blue-50/60' : ''}`}
                    onClick={() => void loadDetail(row.id)}
                  >
                    <td className="px-3 py-2 font-black text-slate-800">{row.id}</td>
                    <td className="px-3 py-2">
                      <span className="rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">
                        {summarizeTypeCell(row)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.file_name ?? '-'}</td>
                    <td className="px-3 py-2 font-bold text-slate-700">{row.total_rows}</td>
                    <td className="px-3 py-2 font-bold text-green-700">{row.success_rows}</td>
                    <td className="px-3 py-2 font-bold text-red-700">{row.failed_rows}</td>
                    <td className="px-3 py-2 text-slate-600">{new Date(row.created_at).toLocaleString('ko-KR')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
          {selectedLogId ? `상세 내역 (로그 ID: ${selectedLogId})` : '상세 내역'}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">행</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">메시지</th>
                <th className="px-3 py-2 text-left">품목</th>
                <th className="px-3 py-2 text-left">창고코드</th>
                <th className="px-3 py-2 text-left">거래처코드</th>
                <th className="px-3 py-2 text-left">수량</th>
                <th className="px-3 py-2 text-left">LOT</th>
                <th className="px-3 py-2 text-left">EXP</th>
                <th className="px-3 py-2 text-left">S/N</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-slate-400">
                    상세 로딩 중...
                  </td>
                </tr>
              ) : !selectedLogId ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-slate-400">
                    로그 목록에서 항목을 선택하세요.
                  </td>
                </tr>
              ) : detailRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center font-bold text-slate-400">
                    상세 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                detailRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-bold text-slate-700">{row.row_no}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-black ${
                          row.status === 'success'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                      >
                        {row.status === 'success' ? '성공' : '실패'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.message ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.item_name ? `${row.item_name} (${row.item_code ?? '-'})` : row.item_code ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.warehouse_code ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-700">{row.customer_code ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-700">{row.qty ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-700">{row.lot_no ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-700">{row.exp_date ?? '-'}</td>
                    <td className="px-3 py-2 text-slate-700">{row.serial_no ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
