import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEmployeeNoWithRetry } from '@/lib/employee-no'

const ALLOWED_USER_KINDS = ['student', 'teacher', 'staff'] as const
type UserKind = (typeof ALLOWED_USER_KINDS)[number]

type RegisterProfilePayload = {
  user_name?: unknown
  email?: unknown
  phone?: unknown
  user_kind?: unknown
  department?: unknown
  job_rank?: unknown
  school_name?: unknown
  training_program?: unknown
  teacher_subject?: unknown
  grade_level?: unknown
  major?: unknown
  privacy_consented?: unknown
  role_name?: unknown
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized ? normalized : null
}

function getDefaultPerms(dept: string) {
  const isSales = ['영업', '구매', '영업팀', '구매팀'].includes(dept)
  const isMaterial = ['자재', '자재팀'].includes(dept)
  const isProduction = ['생산', '생산팀'].includes(dept)
  const isQc = ['품질', '품질팀', 'QC', 'QC팀', '품질관리부'].includes(dept)

  return {
    can_manage_master: false,
    can_sales_manage: isSales,
    can_material_manage: isMaterial,
    can_production_manage: isProduction,
    can_qc_manage: isQc,
    can_admin_manage: false,
    can_manage_permissions: false,
    // legacy fallback columns
    can_po_create: isSales,
    can_quote_create: ['영업', '영업팀'].includes(dept),
    can_receive_stock: isMaterial,
    can_prod_complete: isProduction,
    can_approve: isQc,
  }
}

function validateByUserKind(payload: {
  userKind: UserKind
  department: string
  jobRank: string
  schoolName: string
  trainingProgram: string
  teacherSubject: string
  gradeLevel: string
  major: string
}): string | null {
  if (payload.userKind === 'staff' && (!payload.department || !payload.jobRank)) {
    return '직원은 부서와 직급이 필요합니다.'
  }
  if (payload.userKind === 'teacher' && (!payload.schoolName || !payload.trainingProgram || !payload.teacherSubject)) {
    return '교사는 학교, 교육프로그램, 과목이 필요합니다.'
  }
  if (payload.userKind === 'student' && (!payload.schoolName || !payload.trainingProgram || !payload.gradeLevel || !payload.major)) {
    return '학생은 학교, 교육프로그램, 학년, 전공이 필요합니다.'
  }
  return null
}

export async function POST(request: NextRequest) {
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

    const body = (await request.json()) as RegisterProfilePayload
    const userName = normalizeText(body.user_name)
    const email = normalizeText(body.email).toLowerCase()
    const phone = normalizeText(body.phone)
    const userKindRaw = normalizeText(body.user_kind).toLowerCase()
    const userKind = ALLOWED_USER_KINDS.includes(userKindRaw as UserKind) ? (userKindRaw as UserKind) : null

    if (!userName || !email || !phone || !userKind) {
      return NextResponse.json({ error: '필수 입력값이 누락되었습니다.' }, { status: 400 })
    }

    if (email !== String(user.email ?? '').trim().toLowerCase()) {
      return NextResponse.json({ error: '가입 계정 정보가 일치하지 않습니다.' }, { status: 400 })
    }

    const department = normalizeText(body.department)
    const jobRank = normalizeText(body.job_rank)
    const schoolName = normalizeText(body.school_name)
    const trainingProgram = normalizeText(body.training_program)
    const teacherSubject = normalizeText(body.teacher_subject)
    const gradeLevel = normalizeText(body.grade_level)
    const major = normalizeText(body.major)

    const validationError = validateByUserKind({
      userKind,
      department,
      jobRank,
      schoolName,
      trainingProgram,
      teacherSubject,
      gradeLevel,
      major,
    })
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const autoPerms = getDefaultPerms(department)
    const roleName = normalizeText(body.role_name) || 'pending'

    const { data: existingAppUser } = await adminClient
      .from('app_users')
      .select('employee_no')
      .eq('id', user.id)
      .maybeSingle()

    let upsertError: { message: string } | null = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const employeeNo = existingAppUser?.employee_no || (await generateEmployeeNoWithRetry(adminClient))
      const { error } = await adminClient.from('app_users').upsert(
        {
          id: user.id,
          email,
          user_name: userName,
          user_kind: userKind,
          department: userKind === 'staff' ? department : '',
          job_rank: userKind === 'staff' ? jobRank : '',
          school_name: userKind === 'staff' ? '' : normalizeNullableText(schoolName),
          training_program: userKind === 'staff' ? '' : normalizeNullableText(trainingProgram),
          teacher_subject: userKind === 'teacher' ? normalizeNullableText(teacherSubject) : '',
          grade_level: userKind === 'student' ? normalizeNullableText(gradeLevel) : '',
          major: userKind === 'student' ? normalizeNullableText(major) : '',
          phone,
          privacy_consented: body.privacy_consented === true,
          role_name: roleName,
          is_active: true,
          employee_no: employeeNo,
          ...autoPerms,
        },
        { onConflict: 'id' }
      )

      if (!error) {
        upsertError = null
        break
      }

      upsertError = error
      if (!existingAppUser?.employee_no && error.message.toLowerCase().includes('employee_no')) {
        continue
      }
      break
    }

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : '가입 프로필 저장 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
