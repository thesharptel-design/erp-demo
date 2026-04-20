import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 환경변수 누락' }, { status: 500 })
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '인증 정보 누락' }, { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser(jwt)
    if (userError || !user) {
      return NextResponse.json({ error: '사용자 인증 실패' }, { status: 401 })
    }

    const body = (await request.json()) as {
      sessionId?: string
      currentPath?: string
      isOnline?: boolean
    }
    const sessionId = String(body.sessionId ?? '').trim().slice(0, 120)
    if (!sessionId) return NextResponse.json({ error: 'sessionId 필수' }, { status: 400 })

    const { data: appUser } = await adminClient
      .from('app_users')
      .select('id, user_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const forwardedFor = request.headers.get('x-forwarded-for')
    const ip =
      forwardedFor?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      request.headers.get('cf-connecting-ip') ??
      null
    const userAgent = request.headers.get('user-agent')
    const currentPath = String(body.currentPath ?? '/').trim()
    const normalizedPath = currentPath.startsWith('/') ? currentPath : `/${currentPath}`

    const { error: upsertError } = await adminClient.from('active_user_sessions').upsert(
      {
        session_id: sessionId,
        user_id: appUser?.id ?? user.id,
        email: appUser?.email ?? user.email ?? null,
        user_name: appUser?.user_name ?? user.user_metadata?.user_name ?? null,
        ip,
        user_agent: userAgent,
        current_path: normalizedPath.slice(0, 300),
        is_online: body.isOnline ?? true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'session_id' }
    )

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '세션 heartbeat 기록 실패' }, { status: 500 })
  }
}
