'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

import SearchableCombobox from '@/components/SearchableCombobox'
import PageHeader from '@/components/PageHeader'
import { getAllowedWarehouseIds } from '@/lib/permissions'
import { supabase } from '@/lib/supabase'
import { useSingleSubmit } from '@/hooks/useSingleSubmit'

type ItemRow = {
  id: number
  item_code: string
  item_name: string
  is_lot_managed: boolean
  is_exp_managed: boolean
  is_sn_managed: boolean
}

type CustomerRow = {
  id: number
  customer_code: string | null
  customer_name: string
}

type WarehouseRow = {
  id: number
  code: string
  name: string
}

type UploadRow = {
  row_no: number
  inbound_date: string
  item_code: string
  warehouse_code: string
  customer_code: string
  qty: number
  lot_no: string
  exp_date: string
  serial_no: string
  remarks: string
  local_error?: string
}

type ProcessRowResult = {
  rowNo: number
  status: 'success' | 'failed'
  message: string
}

type ProcessSummary = {
  total: number
  success: number
  failed: number
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function parseTemplateSheet(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const buf = reader.result
        const wb = XLSX.read(buf, { type: 'array' })
        const first = wb.SheetNames[0]
        if (!first) return resolve([])
        const ws = wb.Sheets[first]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        resolve(rows)
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.readAsArrayBuffer(file)
  })
}

function downloadInboundTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['품목코드', '창고코드', '거래처코드', '수량', 'LOT번호', '유효기간', '시리얼번호', '비고'],
    ['ITEM-001', 'WH-001', 'CUST-001', 10, 'LOT-240428-A', '2027-04-28', '', '일반 LOT 입고'],
    ['ITEM-SN-001', 'WH-001', 'CUST-001', 1, '', '', 'SN-0001-2026', 'SN 개별 입고'],
    ['ITEM-EXP-001', 'WH-002', 'CUST-002', 5, 'EXP-LOT-1', '20270430', '', 'EXP 숫자형 허용'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '입고업로드')
  XLSX.writeFile(wb, '입고_템플릿.xlsx')
}

export default function NewInboundPage() {
  const router = useRouter()
  const { isSubmitting: isMutating, run: runSingleSubmit } = useSingleSubmit()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [mode, setMode] = useState<'single' | 'template'>('single')
  const [items, setItems] = useState<ItemRow[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([])
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const [inboundDate, setInboundDate] = useState(today)
  const [selectedItemId, setSelectedItemId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [qty, setQty] = useState(1)
  const [lotNo, setLotNo] = useState('')
  const [expDate, setExpDate] = useState('')
  const [serialNo, setSerialNo] = useState('')
  const [remarks, setRemarks] = useState('')

  const [uploadRows, setUploadRows] = useState<UploadRow[]>([])
  const [uploadFileName, setUploadFileName] = useState('')
  const [processSummary, setProcessSummary] = useState<ProcessSummary | null>(null)
  const [processRows, setProcessRows] = useState<ProcessRowResult[]>([])

  const selectedItem = useMemo(
    () => items.find((i) => String(i.id) === selectedItemId) ?? null,
    [items, selectedItemId]
  )

  const itemOptions = useMemo(
    () =>
      items.map((item) => ({
        value: String(item.id),
        label: `[${item.item_code}] ${item.item_name}`,
        keywords: [item.item_code, item.item_name],
      })),
    [items]
  )

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: String(c.id),
        label: `${c.customer_name}${c.customer_code ? ` (${c.customer_code})` : ''}`,
        keywords: [c.customer_name, c.customer_code ?? ''],
      })),
    [customers]
  )

  const warehouseOptions = useMemo(
    () =>
      warehouses.map((w) => ({
        value: String(w.id),
        label: `${w.name} (${w.code})`,
        keywords: [w.name, w.code],
      })),
    [warehouses]
  )

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      let allowedWarehouseIds: number[] | null = []
      if (session?.user) {
        const { data: user } = await supabase
          .from('app_users')
          .select('user_name, id, role_name, can_manage_permissions, can_admin_manage')
          .eq('id', session.user.id)
          .single()
        setUserName(String(user?.user_name ?? ''))
        allowedWarehouseIds = await getAllowedWarehouseIds(user as any)
      }

      const [itemRes, customerRes] = await Promise.all([
        supabase
          .from('items')
          .select('id, item_code, item_name, is_lot_managed, is_exp_managed, is_sn_managed')
          .eq('is_active', true)
          .order('item_code'),
        supabase.from('customers').select('id, customer_code, customer_name').eq('is_active', true).order('customer_name'),
      ])

      let warehouseQuery = supabase
        .from('warehouses')
        .select('id, code, name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (allowedWarehouseIds !== null) {
        if (allowedWarehouseIds.length === 0) {
          setWarehouses([])
        } else {
          warehouseQuery = warehouseQuery.in('id', allowedWarehouseIds)
        }
      }
      const warehouseRes = await warehouseQuery

      setItems((itemRes.data as ItemRow[]) ?? [])
      setCustomers((customerRes.data as CustomerRow[]) ?? [])
      setWarehouses((warehouseRes.data as WarehouseRow[]) ?? [])
      if ((warehouseRes.data ?? [])[0]?.id) setWarehouseId(String(warehouseRes.data?.[0].id))
      setLoading(false)
    })()
  }, [])

  const handleTemplateUpload = async (file: File) => {
    const rawRows = await parseTemplateSheet(file)
    const parsed: UploadRow[] = rawRows.map((row, index) => {
      const entry: UploadRow = {
        row_no: index + 2,
        /* 입고일자 열 없음 → 업로드일(today). 구형 파일은 입고일자/inbound_date 우선 */
        inbound_date: normalizeText(row['입고일자'] ?? row['inbound_date']) || today,
        item_code: normalizeText(row['품목코드'] ?? row['item_code']),
        warehouse_code: normalizeText(row['창고코드'] ?? row['warehouse_code']),
        customer_code: normalizeText(row['거래처코드'] ?? row['customer_code']),
        qty: Number(row['수량'] ?? row['qty'] ?? 0),
        lot_no: normalizeText(row['LOT번호'] ?? row['lot_no']),
        exp_date: normalizeText(row['유효기간'] ?? row['exp_date']),
        serial_no: normalizeText(row['시리얼번호'] ?? row['serial_no']),
        remarks: normalizeText(row['비고'] ?? row['remarks']),
      }
      if (!entry.item_code) entry.local_error = '품목코드 누락'
      if (!entry.warehouse_code) entry.local_error = entry.local_error ? `${entry.local_error}, 창고코드 누락` : '창고코드 누락'
      if (!Number.isFinite(entry.qty) || entry.qty <= 0) {
        entry.local_error = entry.local_error ? `${entry.local_error}, 수량 오류` : '수량 오류'
      }
      return entry
    })
    setUploadRows(parsed)
    setUploadFileName(file.name)
    setProcessSummary(null)
    setProcessRows([])
  }

  const processInbound = async (payloadRows: UploadRow[], fileName?: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      alert('세션이 만료되었습니다. 다시 로그인 후 시도해주세요.')
      return
    }
    const response = await fetch('/api/inbound/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        mode,
        file_name: fileName ?? null,
        rows: payloadRows,
      }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.error ?? '입고 처리에 실패했습니다.')
    setProcessSummary(result.summary as ProcessSummary)
    setProcessRows((result.rowResults ?? []) as ProcessRowResult[])
    if ((result.summary?.failed ?? 0) === 0) {
      alert(`입고 처리 완료 (총 ${result.summary.total}건)`)
      router.refresh()
    }
  }

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem) return alert('품목을 선택해주세요.')
    if (!warehouseId) return alert('창고를 선택해주세요.')
    if (!qty || qty <= 0) return alert('수량은 0보다 커야 합니다.')
    if (selectedItem.is_sn_managed && qty !== 1) return alert('S/N 관리 품목은 수량이 1이어야 합니다.')
    if (selectedItem.is_lot_managed && !normalizeText(lotNo)) return alert('LOT 관리 품목은 LOT 번호가 필요합니다.')
    if (selectedItem.is_exp_managed && !normalizeText(expDate)) return alert('EXP 관리 품목은 유효기간이 필요합니다.')
    if (selectedItem.is_sn_managed && !normalizeText(serialNo)) return alert('S/N 관리 품목은 시리얼 번호가 필요합니다.')

    const wh = warehouses.find((w) => String(w.id) === warehouseId)
    const cust = customers.find((c) => String(c.id) === customerId)
    if (!wh) return alert('창고 정보를 확인해주세요.')

    const row: UploadRow = {
      row_no: 1,
      inbound_date: inboundDate,
      item_code: selectedItem.item_code,
      warehouse_code: wh.code,
      customer_code: cust?.customer_code ?? '',
      qty,
      lot_no: normalizeText(lotNo),
      exp_date: normalizeText(expDate),
      serial_no: normalizeText(serialNo),
      remarks: normalizeText(remarks),
    }

    await runSingleSubmit(async () => {
      setSaving(true)
      try {
        await processInbound([row])
      } catch (e: any) {
        alert(`입고 처리 실패: ${String(e?.message ?? e)}`)
      } finally {
        setSaving(false)
      }
    })
  }

  const handleTemplateSubmit = async () => {
    if (uploadRows.length === 0) return alert('업로드된 데이터가 없습니다.')
    await runSingleSubmit(async () => {
      setSaving(true)
      try {
        await processInbound(uploadRows, uploadFileName)
      } catch (e: any) {
        alert(`템플릿 처리 실패: ${String(e?.message ?? e)}`)
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-4 p-4 md:p-6">
      <div className="rounded-xl border-2 border-black bg-white p-4">
        <PageHeader
          title="입고 등록"
          description="자재과 입고 전용 · 단건 등록 / 템플릿 업로드 병행 · 서버 단일 검증/처리"
          className="gap-0"
          descriptionClassName="text-xs font-bold text-gray-500"
        />
      </div>

      <div className="rounded-xl border border-gray-300 bg-white p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <button
            type="button"
            className={`rounded border px-3 py-2 text-sm font-black ${mode === 'single' ? 'border-black bg-black text-white' : 'border-gray-300 bg-white text-gray-700'}`}
            onClick={() => setMode('single')}
          >
            단건 등록
          </button>
          <button
            type="button"
            className={`rounded border px-3 py-2 text-sm font-black ${mode === 'template' ? 'border-black bg-black text-white' : 'border-gray-300 bg-white text-gray-700'}`}
            onClick={() => setMode('template')}
          >
            템플릿 업로드
          </button>
          <button
            type="button"
            onClick={downloadInboundTemplate}
            className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700"
          >
            템플릿 다운로드
          </button>
          <Link
            href="/admin/inbound-logs"
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-sm font-black text-emerald-700"
          >
            입고 로그 조회
          </Link>
        </div>
      </div>

      {mode === 'single' ? (
        <form onSubmit={handleSingleSubmit} className="space-y-4">
          <div className="rounded-xl border-2 border-black bg-white p-4">
            <div className="grid grid-cols-1 border border-gray-200 text-sm sm:grid-cols-[120px_1fr]">
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">입고일자</div>
              <div className="border-b px-3 py-2">
                <input
                  type="date"
                  value={inboundDate}
                  onChange={(e) => setInboundDate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">담당자</div>
              <div className="border-b px-3 py-2 font-bold text-gray-700">{userName || '—'}</div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">품목</div>
              <div className="border-b px-3 py-2">
                <SearchableCombobox
                  value={selectedItemId}
                  onChange={(v) => {
                    setSelectedItemId(v)
                    const found = items.find((x) => String(x.id) === v)
                    if (found?.is_sn_managed) setQty(1)
                  }}
                  options={itemOptions}
                  placeholder="품목 선택"
                />
              </div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">창고</div>
              <div className="border-b px-3 py-2">
                <SearchableCombobox value={warehouseId} onChange={setWarehouseId} options={warehouseOptions} placeholder="창고 선택" />
              </div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">거래처 (선택)</div>
              <div className="border-b px-3 py-2">
                <SearchableCombobox value={customerId} onChange={setCustomerId} options={customerOptions} placeholder="선택 안함 가능" />
              </div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">수량</div>
              <div className="border-b px-3 py-2">
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  disabled={Boolean(selectedItem?.is_sn_managed)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">LOT</div>
              <div className="border-b px-3 py-2">
                <input
                  type="text"
                  value={lotNo}
                  onChange={(e) => setLotNo(e.target.value)}
                  placeholder={selectedItem?.is_lot_managed ? 'LOT 필수' : '해당없음'}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">EXP</div>
              <div className="border-b px-3 py-2">
                <input
                  type="text"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  placeholder={selectedItem?.is_exp_managed ? 'YYYY-MM-DD or YYYYMMDD' : '해당없음'}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div className="border-b bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">S/N</div>
              <div className="border-b px-3 py-2">
                <input
                  type="text"
                  value={serialNo}
                  onChange={(e) => setSerialNo(e.target.value)}
                  placeholder={selectedItem?.is_sn_managed ? 'S/N 필수' : '해당없음'}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
              <div className="bg-gray-50 px-3 py-2 font-black text-gray-700 sm:border-r">비고</div>
              <div className="px-3 py-2">
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="입고 비고"
                  className="w-full rounded border border-gray-300 px-3 py-2"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={saving || isMutating || loading}
              className="rounded-lg bg-black px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving ? '처리 중...' : '단건 입고 등록'}
            </button>
            <Link href="/inventory" className="rounded-lg border border-gray-300 px-4 py-3 text-center text-sm font-black text-gray-700">
              취소
            </Link>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-black bg-white p-4">
            <p className="mb-2 text-xs font-black text-gray-500">업로드 파일</p>
            <p className="mb-3 text-xs leading-relaxed text-gray-600">
              템플릿에는 입고일자 열이 없습니다. 업로드·처리 시점의 날짜가 자동으로 적용됩니다. 예전 양식에{' '}
              <span className="font-bold">입고일자</span> 열이 있으면 그 값을 그대로 사용합니다.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-black text-blue-700"
              >
                파일 선택 (.xlsx/.xls)
              </button>
              <span className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-600">
                {uploadFileName || '선택된 파일 없음'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  await handleTemplateUpload(file)
                } catch (err: any) {
                  alert(`파일 파싱 실패: ${String(err?.message ?? err)}`)
                } finally {
                  e.currentTarget.value = ''
                }
              }}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-300 bg-white">
            <div className="border-b bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
              업로드 미리보기 ({uploadRows.length}행)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="border-b bg-gray-50 text-[11px] font-black text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">행</th>
                    <th className="px-3 py-2 text-left">적용 입고일</th>
                    <th className="px-3 py-2 text-left">품목코드</th>
                    <th className="px-3 py-2 text-left">창고코드</th>
                    <th className="px-3 py-2 text-left">거래처코드</th>
                    <th className="px-3 py-2 text-left">수량</th>
                    <th className="px-3 py-2 text-left">LOT</th>
                    <th className="px-3 py-2 text-left">EXP</th>
                    <th className="px-3 py-2 text-left">S/N</th>
                    <th className="px-3 py-2 text-left">로컬검증</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploadRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-sm font-bold text-gray-400">
                        업로드된 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    uploadRows.slice(0, 200).map((r) => (
                      <tr key={`${r.row_no}-${r.item_code}-${r.serial_no}`}>
                        <td className="px-3 py-2">{r.row_no}</td>
                        <td className="px-3 py-2">{r.inbound_date}</td>
                        <td className="px-3 py-2">{r.item_code}</td>
                        <td className="px-3 py-2">{r.warehouse_code}</td>
                        <td className="px-3 py-2">{r.customer_code}</td>
                        <td className="px-3 py-2">{r.qty}</td>
                        <td className="px-3 py-2">{r.lot_no || '-'}</td>
                        <td className="px-3 py-2">{r.exp_date || '-'}</td>
                        <td className="px-3 py-2">{r.serial_no || '-'}</td>
                        <td className={`px-3 py-2 text-xs font-black ${r.local_error ? 'text-red-700' : 'text-green-700'}`}>
                          {r.local_error ?? 'OK'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={saving || isMutating || uploadRows.length === 0}
              onClick={() => void handleTemplateSubmit()}
              className="rounded-lg bg-black px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving ? '처리 중...' : '템플릿 입고 등록'}
            </button>
            <Link href="/inventory" className="rounded-lg border border-gray-300 px-4 py-3 text-center text-sm font-black text-gray-700">
              취소
            </Link>
          </div>
        </div>
      )}

      {processSummary ? (
        <div className="rounded-xl border border-gray-300 bg-white p-4">
          <h3 className="text-sm font-black text-gray-800">처리 결과</h3>
          <p className="mt-1 text-xs font-bold text-gray-600">
            총 {processSummary.total}건 · 성공 {processSummary.success}건 · 실패 {processSummary.failed}건
          </p>
          <div className="mt-3 max-h-56 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-2">
            <ul className="space-y-1 text-xs font-bold">
              {processRows.map((r) => (
                <li key={`${r.rowNo}-${r.status}-${r.message}`} className={r.status === 'success' ? 'text-green-700' : 'text-red-700'}>
                  [{r.rowNo}] {r.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}