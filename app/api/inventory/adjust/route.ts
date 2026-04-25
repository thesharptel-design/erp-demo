import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { hasManagePermission } from '@/lib/permissions'
import { rejectedEnvelope, successEnvelope } from '@/lib/server-idempotency'

type AdjustmentType =
  | 'available_increase'
  | 'available_decrease'
  | 'quarantine_increase'
  | 'quarantine_decrease'

type RequestBody = {
  item_id: number
  warehouse_id: number
  adjustment_type: AdjustmentType
  qty: number
  remarks: string
  lot_no?: string | null
  exp_date?: string | null
  serial_no?: string | null
}

async function markAdjustIdempotencyStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  actorId: string,
  idempotencyKey: string,
  payloadHash: string,
  status: 'failed' | 'completed',
  response?: unknown
) {
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  await adminClient
    .from('inventory_adjust_idempotency')
    .update({
      status,
      ...(status === 'completed' ? { response: response ?? null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('actor_id', actorId)
    .eq('idempotency_key', idempotencyKey)
    .eq('payload_hash', payloadHash)
}

function isValidAdjustmentType(value: string): value is AdjustmentType {
  return [
    'available_increase',
    'available_decrease',
    'quarantine_increase',
    'quarantine_decrease',
  ].includes(value)
}

export async function POST(request: NextRequest) {
  let idempotencyKey: string | null = null
  let idempotencyPayloadHash: string | null = null
  let actorIdForIdempotency: string | null = null
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        rejectedEnvelope('server_error', '서버 환경변수가 설정되지 않았습니다.'),
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json(rejectedEnvelope('permission', '인증 정보가 없습니다.'), { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const jwt = authHeader.replace('Bearer ', '')

    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await adminClient.auth.getUser(jwt)

    if (currentUserError || !currentUser?.email) {
      return NextResponse.json(
        rejectedEnvelope('permission', '현재 사용자 인증을 확인할 수 없습니다.'),
        { status: 401 }
      )
    }

    const { data: currentAppUser, error: currentAppUserError } = await adminClient
      .from('app_users')
      .select(`
        id,
        role_name,
        can_material_manage,
        can_production_manage,
        can_receive_stock,
        can_manage_permissions,
        can_qc_manage
      `)
      .eq('email', currentUser.email)
      .single()

    if (currentAppUserError || !currentAppUser) {
      return NextResponse.json(
        rejectedEnvelope('permission', '현재 사용자 권한을 확인할 수 없습니다.'),
        { status: 403 }
      )
    }

    const canAdjustInventory =
      hasManagePermission(currentAppUser, 'can_material_manage') ||
      hasManagePermission(currentAppUser, 'can_production_manage') ||
      hasManagePermission(currentAppUser, 'can_qc_manage')

    if (!canAdjustInventory) {
      return NextResponse.json(
        rejectedEnvelope('permission', '재고조정 권한이 없습니다.'),
        { status: 403 }
      )
    }

    const body = (await request.json()) as RequestBody
    const rawIdempotencyKey = request.headers.get('x-idempotency-key')
    idempotencyKey = rawIdempotencyKey && rawIdempotencyKey.trim().length > 0 ? rawIdempotencyKey.trim() : null

    if (!body.item_id || Number(body.item_id) <= 0) {
      return NextResponse.json(
        rejectedEnvelope('validation', '조정 대상 품목이 올바르지 않습니다.'),
        { status: 400 }
      )
    }
    if (!body.warehouse_id || Number(body.warehouse_id) <= 0) {
      return NextResponse.json(
        rejectedEnvelope('validation', '조정 대상 창고가 올바르지 않습니다.'),
        { status: 400 }
      )
    }

    if (!isValidAdjustmentType(body.adjustment_type)) {
      return NextResponse.json(
        rejectedEnvelope('validation', '조정 유형이 올바르지 않습니다.'),
        { status: 400 }
      )
    }

    const qty = Number(body.qty)
    if (!qty || qty <= 0) {
      return NextResponse.json(
        rejectedEnvelope('validation', '조정 수량은 0보다 커야 합니다.'),
        { status: 400 }
      )
    }

    if (!body.remarks?.trim()) {
      return NextResponse.json(
        rejectedEnvelope('validation', '조정 사유를 입력하십시오.'),
        { status: 400 }
      )
    }
    actorIdForIdempotency = currentAppUser.id

    if (idempotencyKey) {
      const normalizedPayload = {
        item_id: Number(body.item_id),
        warehouse_id: Number(body.warehouse_id),
        adjustment_type: body.adjustment_type,
        qty,
        remarks: body.remarks.trim(),
        lot_no: body.lot_no ?? null,
        exp_date: body.exp_date ?? null,
        serial_no: body.serial_no ?? null,
      }
      idempotencyPayloadHash = createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex')

      const { data: cached, error: cacheReadError } = await adminClient
        .from('inventory_adjust_idempotency')
        .select('payload_hash, status, response')
        .eq('actor_id', actorIdForIdempotency)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()

      if (cacheReadError) {
        return NextResponse.json(
          rejectedEnvelope('server_error', '멱등성 키 조회 중 오류가 발생했습니다.', idempotencyKey),
          { status: 500 }
        )
      }

      if (cached) {
        if (cached.payload_hash !== idempotencyPayloadHash) {
          return NextResponse.json(
            rejectedEnvelope('conflict', '동일 멱등성 키에 다른 요청 payload가 전달되었습니다.', idempotencyKey),
            { status: 409 }
          )
        }

        if (cached.status === 'completed') {
          return NextResponse.json(
            successEnvelope('replayed', { result: cached.response ?? null }, '이미 처리된 요청입니다.', idempotencyKey)
          )
        }

        if (cached.status === 'pending') {
          return NextResponse.json(
            rejectedEnvelope('conflict', '동일 멱등성 키 요청이 이미 처리 중입니다.', idempotencyKey),
            { status: 409 }
          )
        }
      } else {
        const { error: cacheInsertError } = await adminClient
          .from('inventory_adjust_idempotency')
          .insert({
            actor_id: actorIdForIdempotency,
            idempotency_key: idempotencyKey,
            payload_hash: idempotencyPayloadHash,
            status: 'pending',
            response: null,
          })

        if (cacheInsertError) {
          return NextResponse.json(
            rejectedEnvelope('server_error', '멱등성 키 등록 중 오류가 발생했습니다.', idempotencyKey),
            { status: 500 }
          )
        }
      }
    }

    const { data: adjustResult, error: adjustError } = await adminClient.rpc('execute_inventory_adjust', {
      p_item_id: Number(body.item_id),
      p_warehouse_id: Number(body.warehouse_id),
      p_adjustment_type: body.adjustment_type,
      p_qty: qty,
      p_actor_id: currentAppUser.id,
      p_remarks: body.remarks.trim(),
      p_lot_no: body.lot_no ?? null,
      p_exp_date: body.exp_date ?? null,
      p_serial_no: body.serial_no ?? null,
    })

    if (adjustError) {
      const message = String(adjustError.message ?? '재고조정 처리 중 오류가 발생했습니다.')
      const status = message.includes('부족')
        ? 409
        : message.includes('권한')
          ? 403
          : message.includes('오류')
            ? 500
            : 400
      const reason = status === 409
        ? 'invalid_pre_state'
        : status === 403
          ? 'permission'
          : status === 500
            ? 'server_error'
            : 'validation'

      if (idempotencyKey && idempotencyPayloadHash && actorIdForIdempotency) {
        await markAdjustIdempotencyStatus(
          supabaseUrl,
          serviceRoleKey,
          actorIdForIdempotency,
          idempotencyKey,
          idempotencyPayloadHash,
          'failed'
        )
      }

      return NextResponse.json(rejectedEnvelope(reason, message, idempotencyKey ?? undefined), { status })
    }

    const resultPayload = adjustResult ?? { success: true }

    if (idempotencyKey && idempotencyPayloadHash && actorIdForIdempotency) {
      try {
        await markAdjustIdempotencyStatus(
          supabaseUrl,
          serviceRoleKey,
          actorIdForIdempotency,
          idempotencyKey,
          idempotencyPayloadHash,
          'completed',
          resultPayload
        )
      } catch {
        return NextResponse.json(
          rejectedEnvelope('server_error', '멱등성 처리 결과 저장 중 오류가 발생했습니다.', idempotencyKey),
          { status: 500 }
        )
      }
    }

    return NextResponse.json(successEnvelope('processed', { result: resultPayload }, undefined, idempotencyKey ?? undefined))
  } catch (error) {
    console.error(error)
    if (idempotencyKey && idempotencyPayloadHash && actorIdForIdempotency) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && serviceRoleKey) {
        await markAdjustIdempotencyStatus(
          supabaseUrl,
          serviceRoleKey,
          actorIdForIdempotency,
          idempotencyKey,
          idempotencyPayloadHash,
          'failed'
        )
      }
    }
    return NextResponse.json(
      rejectedEnvelope('server_error', '재고조정 중 서버 오류가 발생했습니다.', idempotencyKey ?? undefined),
      { status: 500 }
    )
  }
}