import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type RoleName =
  | 'admin'
  | 'sales'
  | 'purchase'
  | 'production'
  | 'approval'
  | 'qc'
  | 'user'

type CreateUserBody = {
  login_id: string
  user_name: string
  email: string
  password: string
  role_name: RoleName
  is_active: boolean
  can_quote_create: boolean
  can_po_create: boolean
  can_receive_stock: boolean
  can_prod_complete: boolean
  can_approve: boolean
  can_manage_permissions: boolean
  can_qc_manage: boolean
}

function isValidRoleName(roleName: string): roleName is RoleName {
  return ['admin', 'sales', 'purchase', 'production', 'approval', 'qc', 'user'].includes(
    roleName
  )
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    if (!authHeader) {
      return NextResponse.json(
        { error: '인증 정보가 없습니다.' },
        { status: 401 }
      )
    }

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
      .select('id, role_name, can_manage_permissions')
      .eq('email', currentUser.email)
      .single()

    if (
      currentAppUserError ||
      !currentAppUser ||
      !(
        currentAppUser.role_name === 'admin' ||
        currentAppUser.can_manage_permissions === true
      )
    ) {
      return NextResponse.json(
        { error: '사용자 생성 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as CreateUserBody

    if (!body.login_id?.trim()) {
      return NextResponse.json(
        { error: '로그인ID를 입력하십시오.' },
        { status: 400 }
      )
    }

    if (!body.user_name?.trim()) {
      return NextResponse.json(
        { error: '사용자명을 입력하십시오.' },
        { status: 400 }
      )
    }

    if (!body.email?.trim()) {
      return NextResponse.json(
        { error: '이메일을 입력하십시오.' },
        { status: 400 }
      )
    }

    if (!body.password?.trim()) {
      return NextResponse.json(
        { error: '비밀번호를 입력하십시오.' },
        { status: 400 }
      )
    }

    if (!isValidRoleName(body.role_name)) {
      return NextResponse.json(
        { error: '역할 값이 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const normalizedEmail = body.email.trim().toLowerCase()
    const normalizedLoginId = body.login_id.trim()

    const { data: existingLoginIdUser, error: existingLoginIdError } = await adminClient
      .from('app_users')
      .select('id')
      .eq('login_id', normalizedLoginId)
      .maybeSingle()

    if (existingLoginIdError) {
      return NextResponse.json(
        { error: '로그인ID 중복 확인 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    if (existingLoginIdUser) {
      return NextResponse.json(
        { error: '이미 사용 중인 로그인ID입니다.' },
        { status: 409 }
      )
    }

    const { data: existingEmailUser, error: existingEmailError } = await adminClient
      .from('app_users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingEmailError) {
      return NextResponse.json(
        { error: '이메일 중복 확인 중 오류가 발생했습니다.' },
        { status: 500 }
      )
    }

    if (existingEmailUser) {
      return NextResponse.json(
        { error: '이미 사용 중인 이메일입니다.' },
        { status: 409 }
      )
    }

    const { data: createdAuthUser, error: createAuthError } =
      await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          login_id: normalizedLoginId,
          user_name: body.user_name.trim(),
          role_name: body.role_name,
        },
      })

    if (createAuthError || !createdAuthUser.user) {
      return NextResponse.json(
        { error: createAuthError?.message ?? 'Auth 사용자 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    const newUserId = createdAuthUser.user.id

    const { error: insertAppUserError } = await adminClient
      .from('app_users')
      .insert({
        id: newUserId,
        login_id: normalizedLoginId,
        user_name: body.user_name.trim(),
        role_name: body.role_name,
        email: normalizedEmail,
        is_active: body.is_active,
        can_quote_create: body.can_quote_create,
        can_po_create: body.can_po_create,
        can_receive_stock: body.can_receive_stock,
        can_prod_complete: body.can_prod_complete,
        can_approve: body.can_approve,
        can_manage_permissions: body.can_manage_permissions,
        can_qc_manage: body.can_qc_manage,
      })

    if (insertAppUserError) {
      await adminClient.auth.admin.deleteUser(newUserId)

      return NextResponse.json(
        { error: insertAppUserError.message ?? 'app_users 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user_id: newUserId,
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      { error: '사용자 생성 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}