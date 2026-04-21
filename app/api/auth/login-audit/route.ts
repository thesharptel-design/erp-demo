import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordLoginAudit } from '@/lib/login-audit'
import { seoulDateString } from '@/lib/seoul-date'

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 환경변수 누락' }, { status: 500 })
    }

    const body = (await request.json()) as {
      email?: string
      success?: boolean
      sessionId?: string | null
    }
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email) return NextResponse.json({ error: 'email 필수' }, { status: 400 })

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: appUser } = await adminClient
      .from('app_users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    const forwardedFor = request.headers.get('x-forwarded-for')
    const ip = forwardedFor?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null
    const userAgent = request.headers.get('user-agent')

    const success = Boolean(body.success)

    await recordLoginAudit(adminClient, {
      email,
      userId: appUser?.id ?? null,
      success,
      ip,
      userAgent,
      sessionId: body.sessionId ?? null,
    })

    if (success && appUser?.id) {
      const seoul = seoulDateString()
      const loginIso = new Date().toISOString()
      const { data: u } = await adminClient
        .from('app_users')
        .select('today_stats_date, today_first_login_at')
        .eq('id', appUser.id)
        .maybeSingle()

      const crossed = u?.today_stats_date != null && u.today_stats_date !== seoul
      const updatePayload: Record<string, unknown> = { today_stats_date: seoul }

      if (crossed) {
        updatePayload.today_active_seconds = 0
        updatePayload.today_first_login_at = loginIso
      } else {
        const cur = u?.today_first_login_at
        if (!cur || new Date(loginIso).getTime() < new Date(cur).getTime()) {
          updatePayload.today_first_login_at = loginIso
        }
      }

      await adminClient.from('app_users').update(updatePayload).eq('id', appUser.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '로그인 감사 기록 실패' }, { status: 500 })
  }
}
