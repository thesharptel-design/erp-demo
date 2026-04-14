import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type AdjustmentType =
  | 'available_increase'
  | 'available_decrease'
  | 'quarantine_increase'
  | 'quarantine_decrease'

type RequestBody = {
  item_id: number
  adjustment_type: AdjustmentType
  qty: number
  remarks: string
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
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: '서버 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })
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
        { error: '현재 사용자 인증을 확인할 수 없습니다.' },
        { status: 401 }
      )
    }

    const { data: currentAppUser, error: currentAppUserError } = await adminClient
      .from('app_users')
      .select(`
        id,
        role_name,
        can_receive_stock,
        can_manage_permissions,
        can_qc_manage
      `)
      .eq('email', currentUser.email)
      .single()

    if (currentAppUserError || !currentAppUser) {
      return NextResponse.json(
        { error: '현재 사용자 권한을 확인할 수 없습니다.' },
        { status: 403 }
      )
    }

    const canAdjustInventory =
      currentAppUser.role_name === 'admin' ||
      currentAppUser.role_name === 'purchase' ||
      currentAppUser.role_name === 'production' ||
      currentAppUser.can_receive_stock === true ||
      currentAppUser.can_manage_permissions === true ||
      currentAppUser.can_qc_manage === true

    if (!canAdjustInventory) {
      return NextResponse.json(
        { error: '재고조정 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as RequestBody

    if (!body.item_id || Number(body.item_id) <= 0) {
      return NextResponse.json(
        { error: '조정 대상 품목이 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    if (!isValidAdjustmentType(body.adjustment_type)) {
      return NextResponse.json(
        { error: '조정 유형이 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const qty = Number(body.qty)
    if (!qty || qty <= 0) {
      return NextResponse.json(
        { error: '조정 수량은 0보다 커야 합니다.' },
        { status: 400 }
      )
    }

    if (!body.remarks?.trim()) {
      return NextResponse.json(
        { error: '조정 사유를 입력하십시오.' },
        { status: 400 }
      )
    }

    const { data: inventoryRow, error: inventorySelectError } = await adminClient
      .from('inventory')
      .select('id, item_id, current_qty, available_qty, quarantine_qty')
      .eq('item_id', body.item_id)
      .maybeSingle()

    if (inventorySelectError) {
      return NextResponse.json(
        { error: '재고 정보를 조회하지 못했습니다.' },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()

    let currentQty = 0
    let availableQty = 0
    let quarantineQty = 0
    let inventoryId: number | null = null

    if (inventoryRow) {
      inventoryId = inventoryRow.id
      currentQty = Number(inventoryRow.current_qty ?? 0)
      availableQty = Number(inventoryRow.available_qty ?? 0)
      quarantineQty = Number(inventoryRow.quarantine_qty ?? 0)
    }

    let nextCurrentQty = currentQty
    let nextAvailableQty = availableQty
    let nextQuarantineQty = quarantineQty

    switch (body.adjustment_type) {
      case 'available_increase':
        nextCurrentQty += qty
        nextAvailableQty += qty
        break
      case 'available_decrease':
        if (availableQty < qty || currentQty < qty) {
          return NextResponse.json(
            { error: '사용가능재고가 부족합니다.' },
            { status: 400 }
          )
        }
        nextCurrentQty -= qty
        nextAvailableQty -= qty
        break
      case 'quarantine_increase':
        nextCurrentQty += qty
        nextQuarantineQty += qty
        break
      case 'quarantine_decrease':
        if (quarantineQty < qty || currentQty < qty) {
          return NextResponse.json(
            { error: '격리재고가 부족합니다.' },
            { status: 400 }
          )
        }
        nextCurrentQty -= qty
        nextQuarantineQty -= qty
        break
    }

    if (inventoryId) {
      const { error: updateError } = await adminClient
        .from('inventory')
        .update({
          current_qty: nextCurrentQty,
          available_qty: nextAvailableQty,
          quarantine_qty: nextQuarantineQty,
          updated_at: now,
        })
        .eq('id', inventoryId)

      if (updateError) {
        return NextResponse.json(
          { error: '재고 업데이트 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await adminClient
        .from('inventory')
        .insert({
          item_id: body.item_id,
          current_qty: nextCurrentQty,
          available_qty: nextAvailableQty,
          quarantine_qty: nextQuarantineQty,
          updated_at: now,
        })

      if (insertError) {
        return NextResponse.json(
          { error: '재고 생성 중 오류가 발생했습니다.' },
          { status: 500 }
        )
      }
    }

    const adjustTypeLabelMap: Record<AdjustmentType, string> = {
      available_increase: '사용가능재고 증가',
      available_decrease: '사용가능재고 감소',
      quarantine_increase: '격리재고 증가',
      quarantine_decrease: '격리재고 감소',
    }

    const { error: txError } = await adminClient
      .from('inventory_transactions')
      .insert({
        trans_date: now,
        trans_type: 'ADJUST',
        item_id: body.item_id,
        qty,
        ref_table: 'inventory_adjustments',
        ref_id: null,
        remarks: `[${adjustTypeLabelMap[body.adjustment_type]}] ${body.remarks.trim()}`,
        created_by: currentAppUser.id,
        created_at: now,
      })

    if (txError) {
      return NextResponse.json(
        { error: '재고이력 저장 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: '재고조정 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}