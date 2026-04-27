import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveAccessibleWarehouses } from '@/lib/server/resolve-accessible-warehouses'

type WarehouseRow = {
  id: number
  name: string
}

type AccessResponse = {
  has_full_access: boolean
  warehouse_ids: number[]
  warehouses: WarehouseRow[]
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 환경변수 누락' }, { status: 500 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 정보가 없습니다.' }, { status: 401 })
    }

    const jwt = authHeader.replace('Bearer ', '')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(jwt)
    if (userError || !user) {
      return NextResponse.json({ error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const resolved = await resolveAccessibleWarehouses(adminClient, user.id)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const response: AccessResponse = {
      has_full_access: resolved.hasFullAccess,
      warehouse_ids: resolved.warehouses.map((warehouse) => warehouse.id),
      warehouses: resolved.warehouses as WarehouseRow[],
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : '창고 접근 정보 조회 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
