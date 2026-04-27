import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasManagePermission } from '@/lib/permissions'

type InboundMode = 'single' | 'template'

type InboundPayloadRow = {
  row_no?: number
  inbound_date?: string
  item_code?: string
  warehouse_code?: string
  warehouse_id?: number
  customer_code?: string
  customer_name?: string
  customer_id?: number
  qty?: number
  lot_no?: string
  exp_date?: string | number
  serial_no?: string
  remarks?: string
}

type RequestBody = {
  mode: InboundMode
  file_name?: string
  rows: InboundPayloadRow[]
}

type RowResult = {
  rowNo: number
  status: 'success' | 'failed'
  message: string
}

function normalizeText(value: unknown): string | null {
  const t = String(value ?? '').trim()
  return t ? t : null
}

function normalizeDateText(value: unknown): { value: string | null; error: string | null } {
  if (value == null || String(value).trim() === '') return { value: null, error: null }
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { value: raw, error: null }
  if (/^\d{8}$/.test(raw)) return { value: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`, error: null }
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const num = Number(raw)
    if (Number.isFinite(num)) {
      const epoch = new Date(Date.UTC(1899, 11, 30))
      epoch.setUTCDate(epoch.getUTCDate() + Math.floor(num))
      const y = epoch.getUTCFullYear()
      const m = String(epoch.getUTCMonth() + 1).padStart(2, '0')
      const d = String(epoch.getUTCDate()).padStart(2, '0')
      return { value: `${y}-${m}-${d}`, error: null }
    }
  }
  return { value: null, error: 'EXP 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD 또는 YYYYMMDD)' }
}

function composeTransDateIso(inboundDate: string | null): string {
  const now = new Date()
  if (!inboundDate || !/^\d{4}-\d{2}-\d{2}$/.test(inboundDate)) return now.toISOString()
  const [y, m, d] = inboundDate.split('-').map(Number)
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).toISOString()
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 환경변수가 설정되지 않았습니다.' }, { status: 500 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user: currentUser },
      error: userErr,
    } = await adminClient.auth.getUser(jwt)
    if (userErr || !currentUser?.email) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const { data: currentAppUser, error: appUserErr } = await adminClient
      .from('app_users')
      .select('id, role_name, can_material_manage, can_receive_stock, can_manage_permissions')
      .eq('email', currentUser.email)
      .single()
    if (appUserErr || !currentAppUser) {
      return NextResponse.json({ error: '현재 사용자 권한을 확인할 수 없습니다.' }, { status: 403 })
    }

    if (!hasManagePermission(currentAppUser, 'can_material_manage')) {
      return NextResponse.json({ error: '입고 등록 권한이 없습니다.' }, { status: 403 })
    }

    const body = (await request.json()) as RequestBody
    const mode = body.mode
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!['single', 'template'].includes(mode) || rows.length === 0) {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const itemCodes = Array.from(new Set(rows.map((r) => String(r.item_code ?? '').trim()).filter(Boolean)))
    const warehouseCodes = Array.from(new Set(rows.map((r) => String(r.warehouse_code ?? '').trim()).filter(Boolean)))
    const warehouseIds = Array.from(
      new Set(rows.map((r) => Number(r.warehouse_id ?? 0)).filter((n) => Number.isInteger(n) && n > 0))
    )
    const customerCodes = Array.from(new Set(rows.map((r) => String(r.customer_code ?? '').trim()).filter(Boolean)))
    const customerNames = Array.from(new Set(rows.map((r) => String(r.customer_name ?? '').trim()).filter(Boolean)))
    const customerIds = Array.from(
      new Set(rows.map((r) => Number(r.customer_id ?? 0)).filter((n) => Number.isInteger(n) && n > 0))
    )

    const [{ data: items }, { data: warehouses }, { data: customers }] = await Promise.all([
      itemCodes.length > 0
        ? adminClient
            .from('items')
            .select('id, item_code, item_name, is_lot_managed, is_exp_managed, is_sn_managed')
            .in('item_code', itemCodes)
        : Promise.resolve({ data: [] as any[] }),
      warehouseCodes.length > 0 || warehouseIds.length > 0
        ? adminClient
            .from('warehouses')
            .select('id, code, name')
            .or([
              warehouseCodes.length > 0 ? `code.in.(${warehouseCodes.map((c) => `"${c}"`).join(',')})` : '',
              warehouseIds.length > 0 ? `id.in.(${warehouseIds.join(',')})` : '',
            ].filter(Boolean).join(','))
        : Promise.resolve({ data: [] as any[] }),
      customerCodes.length > 0 || customerNames.length > 0 || customerIds.length > 0
        ? adminClient
            .from('customers')
            .select('id, customer_code, customer_name')
            .or(
              [
                customerCodes.length > 0 ? `customer_code.in.(${customerCodes.map((c) => `"${c}"`).join(',')})` : '',
                customerIds.length > 0 ? `id.in.(${customerIds.join(',')})` : '',
                customerNames.length > 0 ? `customer_name.in.(${customerNames.map((c) => `"${c}"`).join(',')})` : '',
              ]
                .filter(Boolean)
                .join(',')
            )
        : Promise.resolve({ data: [] as any[] }),
    ])

    const itemByCode = new Map((items ?? []).map((i: any) => [String(i.item_code), i]))
    const whByCode = new Map((warehouses ?? []).map((w: any) => [String(w.code), w]))
    const whById = new Map((warehouses ?? []).map((w: any) => [Number(w.id), w]))
    const customerByCode = new Map((customers ?? []).map((c: any) => [String(c.customer_code ?? ''), c]))
    const customerByName = new Map((customers ?? []).map((c: any) => [String(c.customer_name ?? ''), c]))
    const customerById = new Map((customers ?? []).map((c: any) => [Number(c.id), c]))

    const { data: logHeader, error: logErr } = await adminClient
      .from('inbound_upload_logs')
      .insert({
        source_type: mode,
        file_name: normalizeText(body.file_name),
        total_rows: rows.length,
        requested_by: currentAppUser.id,
      })
      .select('id')
      .single()
    if (logErr || !logHeader) {
      return NextResponse.json({ error: '입고 로그 헤더를 생성하지 못했습니다.' }, { status: 500 })
    }

    let successCount = 0
    let failCount = 0
    const rowResults: RowResult[] = []

    for (let idx = 0; idx < rows.length; idx += 1) {
      const rowNo = Number(rows[idx].row_no ?? idx + 1)
      const row = rows[idx]
      let status: 'success' | 'failed' = 'failed'
      let message = ''

      try {
        const itemCode = String(row.item_code ?? '').trim()
        const item = itemByCode.get(itemCode)
        if (!item) throw new Error(`품목코드를 찾을 수 없습니다: ${itemCode || '(빈값)'}`)

        const wh =
          (Number.isInteger(Number(row.warehouse_id)) && Number(row.warehouse_id) > 0
            ? whById.get(Number(row.warehouse_id))
            : undefined) ?? whByCode.get(String(row.warehouse_code ?? '').trim())
        if (!wh) throw new Error('입고 창고를 찾을 수 없습니다.')

        const customerCodeText = String(row.customer_code ?? '').trim()
        const customerNameText = String(row.customer_name ?? '').trim()
        const customerIdNum = Number(row.customer_id ?? 0)
        const hasCustomerHint =
          customerCodeText.length > 0 || customerNameText.length > 0 || (Number.isInteger(customerIdNum) && customerIdNum > 0)

        const customer =
          (Number.isInteger(Number(row.customer_id)) && Number(row.customer_id) > 0
            ? customerById.get(Number(row.customer_id))
            : undefined) ??
          customerByCode.get(String(row.customer_code ?? '').trim()) ??
          customerByName.get(String(row.customer_name ?? '').trim())
        if (hasCustomerHint && !customer) throw new Error('거래처를 찾을 수 없습니다.')

        const qty = Number(row.qty ?? 0)
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('수량은 0보다 커야 합니다.')

        const lotNo = normalizeText(row.lot_no)
        const serialNo = normalizeText(row.serial_no)
        const expNorm = normalizeDateText(row.exp_date)
        if (expNorm.error) throw new Error(expNorm.error)

        // 운영 편의상 입고 시점에는 추적정보 누락을 허용하고, 보완 입력 화면에서 후처리합니다.
        // 다만 값이 전달된 경우 날짜 형식 등 기본 정합성 검증은 유지합니다.

        const { data: stocks, error: stockErr } = await adminClient
          .from('inventory')
          .select('id, current_qty, available_qty, lot_no, exp_date, serial_no')
          .eq('item_id', item.id)
          .eq('warehouse_id', wh.id)
        if (stockErr) throw stockErr

        const targetStock =
          (stocks ?? []).find((s: any) => {
            const rowLot = normalizeText(s.lot_no)
            const rowExp = normalizeText(s.exp_date)
            const rowSn = normalizeText(s.serial_no)
            return rowLot === lotNo && rowExp === expNorm.value && rowSn === serialNo
          }) ?? null

        let inventoryId: number | null = null
        if (targetStock) {
          const { error: upErr } = await adminClient
            .from('inventory')
            .update({
              current_qty: Number(targetStock.current_qty ?? 0) + qty,
              available_qty: Number(targetStock.available_qty ?? 0) + qty,
              updated_at: new Date().toISOString(),
            })
            .eq('id', targetStock.id)
          if (upErr) throw upErr
          inventoryId = Number(targetStock.id)
        } else {
          const { data: inserted, error: insErr } = await adminClient
            .from('inventory')
            .insert({
              item_id: item.id,
              warehouse_id: wh.id,
              lot_no: lotNo,
              exp_date: expNorm.value,
              serial_no: serialNo,
              current_qty: qty,
              available_qty: qty,
              quarantine_qty: 0,
            })
            .select('id')
            .single()
          if (insErr || !inserted) throw insErr || new Error('재고 생성에 실패했습니다.')
          inventoryId = Number(inserted.id)
        }

        const transDateIso = composeTransDateIso(normalizeText(row.inbound_date))
        const { error: txErr } = await adminClient.from('inventory_transactions').insert({
          item_id: item.id,
          trans_type: 'IN',
          qty,
          lot_no: lotNo,
          exp_date: expNorm.value,
          serial_no: serialNo,
          customer_id: customer?.id ?? null,
          remarks: normalizeText(row.remarks),
          trans_date: transDateIso,
          actor_id: currentAppUser.id,
          created_by: currentAppUser.id,
          warehouse_id: wh.id,
          inventory_id: inventoryId,
          ref_table: mode === 'template' ? 'inbound_template' : 'inbound_single',
        })
        if (txErr) throw txErr

        status = 'success'
        message = '처리 완료'
        successCount += 1
      } catch (e: any) {
        status = 'failed'
        message = String(e?.message ?? '알 수 없는 오류')
        failCount += 1
      }

      rowResults.push({ rowNo, status, message })

      await adminClient.from('inbound_upload_log_rows').insert({
        log_id: logHeader.id,
        row_no: rowNo,
        status,
        message,
        item_code: normalizeText(row.item_code),
        item_name: normalizeText((itemByCode.get(String(row.item_code ?? '').trim()) as any)?.item_name),
        warehouse_code: normalizeText(row.warehouse_code),
        customer_code: normalizeText(row.customer_code ?? row.customer_name),
        qty: Number(row.qty ?? 0) || null,
        lot_no: normalizeText(row.lot_no),
        exp_date: normalizeDateText(row.exp_date).value,
        serial_no: normalizeText(row.serial_no),
        raw_row: row,
      })
    }

    await adminClient
      .from('inbound_upload_logs')
      .update({
        success_rows: successCount,
        failed_rows: failCount,
        summary: { mode, successCount, failCount },
      })
      .eq('id', logHeader.id)

    return NextResponse.json({
      success: true,
      logId: logHeader.id,
      summary: { total: rows.length, success: successCount, failed: failCount },
      rowResults,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '입고 처리 중 서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
