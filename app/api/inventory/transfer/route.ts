import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasManagePermission } from '@/lib/permissions'
import { inferIdempotencyFromRpcError, rejectedEnvelope, successEnvelope } from '@/lib/server-idempotency'

type RequestBody = {
  source_inventory_id: number
  to_warehouse_id: number
  qty: number
  remarks?: string
}

export async function POST(request: NextRequest) {
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
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(rejectedEnvelope('permission', '인증 정보가 없습니다.'), { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const jwt = authHeader.replace('Bearer ', '')

    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await adminClient.auth.getUser(jwt)

    if (currentUserError || !currentUser?.email) {
      return NextResponse.json(rejectedEnvelope('permission', '현재 사용자 인증을 확인할 수 없습니다.'), {
        status: 401,
      })
    }

    const { data: currentAppUser, error: currentAppUserError } = await adminClient
      .from('app_users')
      .select('id, role_name, can_material_manage, can_receive_stock')
      .eq('email', currentUser.email)
      .single()

    if (currentAppUserError || !currentAppUser) {
      return NextResponse.json(rejectedEnvelope('permission', '권한 정보를 확인할 수 없습니다.'), {
        status: 403,
      })
    }

    const canTransfer = hasManagePermission(currentAppUser, 'can_material_manage')

    if (!canTransfer) {
      return NextResponse.json(rejectedEnvelope('permission', '자재 이동 권한이 없습니다.'), { status: 403 })
    }

    const body = (await request.json()) as RequestBody
    const rawIdempotencyKey = request.headers.get('x-idempotency-key')
    const idempotencyKey = rawIdempotencyKey && rawIdempotencyKey.trim().length > 0 ? rawIdempotencyKey.trim() : null
    const sourceInventoryId = Number(body.source_inventory_id)
    const toWarehouseId = Number(body.to_warehouse_id)
    const qty = Number(body.qty)
    const remarks = String(body.remarks ?? '').trim()

    if (!Number.isInteger(sourceInventoryId) || sourceInventoryId <= 0) {
      return NextResponse.json(rejectedEnvelope('validation', '원본 재고 정보가 올바르지 않습니다.'), {
        status: 400,
      })
    }
    if (!Number.isInteger(toWarehouseId) || toWarehouseId <= 0) {
      return NextResponse.json(rejectedEnvelope('validation', '도착 창고 정보가 올바르지 않습니다.'), {
        status: 400,
      })
    }
    if (!qty || qty <= 0) {
      return NextResponse.json(rejectedEnvelope('validation', '이동 수량은 0보다 커야 합니다.'), {
        status: 400,
      })
    }

    const { data: transferResult, error: transferError } = await adminClient.rpc('execute_inventory_transfer', {
      p_source_inventory_id: sourceInventoryId,
      p_to_warehouse_id: toWarehouseId,
      p_qty: qty,
      p_actor_id: currentAppUser.id,
      p_remarks: remarks,
      p_idempotency_key: idempotencyKey,
    })
    if (transferError) {
      const message = String(transferError.message ?? '자재 이동에 실패했습니다.')
      const mapped = inferIdempotencyFromRpcError(message)
      return NextResponse.json(mapped.envelope, { status: mapped.httpStatus })
    }

    const rpcStatus = String((transferResult as { idempotency_status?: string } | null)?.idempotency_status ?? '')
    const status = rpcStatus === 'replayed' ? 'replayed' : 'processed'
    return NextResponse.json(successEnvelope(status, { result: transferResult ?? null }, undefined, idempotencyKey ?? undefined))
  } catch (error) {
    console.error(error)
    return NextResponse.json(rejectedEnvelope('server_error', '자재 이동 중 서버 오류가 발생했습니다.'), {
      status: 500,
    })
  }
}
