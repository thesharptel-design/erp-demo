import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateEmployeeNoWithRetry } from '@/lib/employee-no'
import { getDefaultPerms } from '@/lib/staff-profile-options'

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

async function notifySystemAdminsForPendingSignup(args: {
  adminClient: any
  applicantId: string
  applicantName: string
  applicantEmployeeNo: string | null
  userKind: UserKind
}) {
  const { adminClient, applicantId, applicantName, applicantEmployeeNo, userKind } = args
  const { data: admins, error: adminListErr } = await adminClient
    .from('app_users')
    .select('id')
    .eq('is_active', true)
    .or('role_name.eq.admin,can_manage_permissions.eq.true')
    .neq('id', applicantId)

  if (adminListErr || !admins || admins.length === 0) return

  const dedupeKey = `admin:signup_pending:${applicantId}`
  const title = `[가입신청] ${applicantName} 승인 대기`
  const payload = {
    applicant_id: applicantId,
    applicant_name: applicantName,
    applicant_employee_no: applicantEmployeeNo,
    applicant_user_kind: userKind,
  }

  const { data: eventRow, error: insEventErr } = await adminClient
    .from('notification_events')
    .insert({
      actor_id: applicantId,
      category: 'work',
      type: 'admin_signup_pending',
      title,
      payload,
      target_url: '/admin/user-approvals',
      dedupe_key: dedupeKey,
    } as Record<string, unknown>)
    .select('id')
    .single()

  if (insEventErr && !insEventErr.message.toLowerCase().includes('duplicate')) return

  let eventId = (eventRow?.id as string | undefined) ?? undefined
  if (!eventId) {
    const { data: existing } = await adminClient
      .from('notification_events')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle()
    eventId = (existing?.id as string | undefined) ?? undefined
  }
  if (!eventId) return

  const adminRows = admins as Array<{ id: string }>
  const rows = adminRows.map((u) => ({ user_id: String(u.id), event_id: eventId as string }))
  const { error: fanoutErr } = await adminClient
    .from('user_notifications')
    .upsert(rows as Record<string, unknown>[], { onConflict: 'user_id,event_id' })
  if (fanoutErr) {
    console.warn('[notifySystemAdminsForPendingSignup]', fanoutErr.message)
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized ? normalized : null
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

    if (roleName === 'pending') {
      const empNo = existingAppUser?.employee_no ?? null
      await notifySystemAdminsForPendingSignup({
        adminClient,
        applicantId: user.id,
        applicantName: userName,
        applicantEmployeeNo: empNo,
        userKind,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : '가입 프로필 저장 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
