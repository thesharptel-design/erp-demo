import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { isSystemAdminUser } from '@/lib/permissions'

const SUBJECT_MAX = 300
const BODY_MAX = 20000
const RECIPIENT_INSERT_CHUNK = 500

function clampText(value: unknown, max: number): string {
  const s = String(value ?? '').trim()
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, error: '서버 환경변수 누락' }, { status: 500 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: '인증 정보가 없습니다.' }, { status: 401 })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user: authUser },
      error: authErr,
    } = await admin.auth.getUser(jwt)
    if (authErr || !authUser?.email) {
      return NextResponse.json({ success: false, error: '현재 사용자 인증을 확인할 수 없습니다.' }, { status: 401 })
    }

    const { data: appUser, error: appUserErr } = await admin
      .from('app_users')
      .select('id, role_name, can_manage_permissions, can_admin_manage')
      .eq('email', authUser.email)
      .single()

    if (appUserErr || !appUser?.id) {
      return NextResponse.json({ success: false, error: '앱 사용자 정보를 찾을 수 없습니다.' }, { status: 403 })
    }

    if (!isSystemAdminUser(appUser)) {
      return NextResponse.json({ success: false, error: '전체 공지 쪽지 권한이 없습니다.' }, { status: 403 })
    }

    const payload = (await request.json()) as Record<string, unknown>
    const subject = clampText(payload.subject, SUBJECT_MAX)
    const body = clampText(payload.body, BODY_MAX)
    if (!subject) {
      return NextResponse.json({ success: false, error: '제목을 입력하세요.' }, { status: 400 })
    }
    if (!body) {
      return NextResponse.json({ success: false, error: '내용을 입력하세요.' }, { status: 400 })
    }

    const { data: messageRow, error: msgErr } = await admin
      .from('private_messages')
      .insert({
        sender_id: appUser.id,
        subject,
        body,
        kind: 'broadcast',
      })
      .select('id')
      .single()

    if (msgErr || !messageRow?.id) {
      const message = msgErr?.message ?? '쪽지 저장에 실패했습니다.'
      return NextResponse.json({ success: false, error: message }, { status: 400 })
    }

    const messageId = messageRow.id as string

    const { data: allUsers, error: usersErr } = await admin.from('app_users').select('id')
    if (usersErr) {
      return NextResponse.json({ success: false, error: usersErr.message }, { status: 400 })
    }

    const recipientIds = (allUsers ?? [])
      .map((r) => String((r as { id: string }).id))
      .filter((id) => id && id !== appUser.id)

    for (let i = 0; i < recipientIds.length; i += RECIPIENT_INSERT_CHUNK) {
      const slice = recipientIds.slice(i, i + RECIPIENT_INSERT_CHUNK)
      const rows = slice.map((userId) => ({
        message_id: messageId,
        user_id: userId,
      }))
      const { error: insErr } = await admin.from('private_message_recipients').insert(rows)
      if (insErr) {
        return NextResponse.json({ success: false, error: insErr.message }, { status: 400 })
      }
    }

    return NextResponse.json({
      success: true,
      message_id: messageId,
      recipient_count: recipientIds.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
