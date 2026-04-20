import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEmployeeNoWithRetry } from '@/lib/employee-no'
import { hasManagePermission } from '@/lib/permissions'

type RoleName =
  | 'admin'
  | 'sales'
  | 'purchase'
  | 'production'
  | 'approval'
  | 'qc'
  | 'user'

type BulkCreateRow = {
  login_id: string
  user_name: string
  email: string
  password: string
  role_name: string
  is_active: string
  can_manage_master: string
  can_sales_manage: string
  can_material_manage: string
  can_production_manage: string
  can_qc_manage: string
  can_admin_manage: string
  can_manage_permissions: string
  can_quote_create: string
  can_po_create: string
  can_receive_stock: string
  can_prod_complete: string
  can_approve: string
}

function isValidRoleName(roleName: string): roleName is RoleName {
  return ['admin', 'sales', 'purchase', 'production', 'approval', 'qc', 'user'].includes(
    roleName
  )
}

function parseBoolean(value: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['true', '1', 'y', 'yes'].includes(normalized)
}

function normalizeBulkPermissions(row: BulkCreateRow) {
  const canSalesManage =
    parseBoolean(row.can_sales_manage) || parseBoolean(row.can_po_create) || parseBoolean(row.can_quote_create)
  const canMaterialManage =
    parseBoolean(row.can_material_manage) || parseBoolean(row.can_receive_stock)
  const canProductionManage =
    parseBoolean(row.can_production_manage) || parseBoolean(row.can_prod_complete)
  const canQcManage =
    parseBoolean(row.can_qc_manage) || parseBoolean(row.can_approve)
  const canAdminManage =
    parseBoolean(row.can_admin_manage) || parseBoolean(row.can_manage_permissions)
  const canManageMaster = parseBoolean(row.can_manage_master)
  const canManagePermissions = parseBoolean(row.can_manage_permissions)

  return {
    can_manage_master: canManageMaster,
    can_sales_manage: canSalesManage,
    can_material_manage: canMaterialManage,
    can_production_manage: canProductionManage,
    can_qc_manage: canQcManage,
    can_admin_manage: canAdminManage,
    can_manage_permissions: canManagePermissions,
    // legacy fallback columns
    can_quote_create: canSalesManage,
    can_po_create: canSalesManage,
    can_receive_stock: canMaterialManage,
    can_prod_complete: canProductionManage,
    can_approve: canQcManage,
  }
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
      return NextResponse.json(
        { error: '인증 정보가 없습니다.' },
        { status: 401 }
      )
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
      .select('id, role_name, can_manage_permissions, can_admin_manage')
      .eq('email', currentUser.email)
      .single()

    if (
      currentAppUserError ||
      !currentAppUser ||
      !hasManagePermission(currentAppUser, 'can_manage_permissions')
    ) {
      return NextResponse.json(
        { error: '사용자 생성 권한이 없습니다.' },
        { status: 403 }
      )
    }

    const body = (await request.json()) as { rows?: BulkCreateRow[] }
    const rows = body.rows ?? []

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: '업로드할 사용자 데이터가 없습니다.' },
        { status: 400 }
      )
    }

    const results: Array<{
      row_no: number
      login_id: string
      email: string
      success: boolean
      message: string
    }> = []

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]
      const rowNo = i + 2

      try {
        const loginId = row.login_id?.trim()
        const userName = row.user_name?.trim()
        const email = row.email?.trim().toLowerCase()
        const password = row.password?.trim()
        const roleName = row.role_name?.trim()

        if (!loginId || !userName || !email || !password || !roleName) {
          results.push({
            row_no: rowNo,
            login_id: loginId ?? '',
            email: email ?? '',
            success: false,
            message: '필수값(login_id, user_name, email, password, role_name) 누락',
          })
          continue
        }

        if (!isValidRoleName(roleName)) {
          results.push({
            row_no: rowNo,
            login_id: loginId,
            email,
            success: false,
            message: `역할값 오류: ${roleName}`,
          })
          continue
        }

        const { data: existingLoginIdUser } = await adminClient
          .from('app_users')
          .select('id')
          .eq('login_id', loginId)
          .maybeSingle()

        if (existingLoginIdUser) {
          results.push({
            row_no: rowNo,
            login_id: loginId,
            email,
            success: false,
            message: '이미 사용 중인 로그인ID',
          })
          continue
        }

        const { data: existingEmailUser } = await adminClient
          .from('app_users')
          .select('id')
          .eq('email', email)
          .maybeSingle()

        if (existingEmailUser) {
          results.push({
            row_no: rowNo,
            login_id: loginId,
            email,
            success: false,
            message: '이미 사용 중인 이메일',
          })
          continue
        }

        const { data: createdAuthUser, error: createAuthError } =
          await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              login_id: loginId,
              user_name: userName,
              role_name: roleName,
            },
          })

        if (createAuthError || !createdAuthUser.user) {
          results.push({
            row_no: rowNo,
            login_id: loginId,
            email,
            success: false,
            message: createAuthError?.message ?? 'Auth 사용자 생성 실패',
          })
          continue
        }

        const newUserId = createdAuthUser.user.id

        let insertAppUserError: { message?: string } | null = null
        for (let insertAttempt = 0; insertAttempt < 5; insertAttempt += 1) {
          const employeeNo = await generateEmployeeNoWithRetry(adminClient)
          const normalizedPermissions = normalizeBulkPermissions(row)
          const { error } = await adminClient.from('app_users').insert({
            id: newUserId,
            login_id: loginId,
            user_name: userName,
            role_name: roleName,
            email,
            employee_no: employeeNo,
            is_active: parseBoolean(row.is_active),
            ...normalizedPermissions,
          })

          if (!error) {
            insertAppUserError = null
            break
          }

          insertAppUserError = error
          if (String(error.message ?? '').toLowerCase().includes('employee_no')) {
            continue
          }
          break
        }

        if (insertAppUserError) {
          await adminClient.auth.admin.deleteUser(newUserId)

          results.push({
            row_no: rowNo,
            login_id: loginId,
            email,
            success: false,
            message: insertAppUserError.message ?? 'app_users 생성 실패',
          })
          continue
        }

        results.push({
          row_no: rowNo,
          login_id: loginId,
          email,
          success: true,
          message: '생성 완료',
        })
      } catch (error) {
        console.error(error)
        results.push({
          row_no: rowNo,
          login_id: row.login_id ?? '',
          email: row.email ?? '',
          success: false,
          message: '행 처리 중 서버 오류 발생',
        })
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: '일괄 생성 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}