import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { seoulDateString } from '@/lib/seoul-date'

const IDLE_MS = 10 * 60 * 1000
const MAX_DWELL_CHUNK_SEC = 120

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
      isOnline?: boolean
      hadRecentInteraction?: boolean
    }
    const sessionId = String(body.sessionId ?? '').trim().slice(0, 120)
    if (!sessionId) return NextResponse.json({ error: 'sessionId 필수' }, { status: 400 })

    const hadRecentInteraction = body.hadRecentInteraction !== false

    const { data: appUser } = await adminClient
      .from('app_users')
      .select('id, user_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const uid = appUser?.id ?? user.id

    const forwardedFor = request.headers.get('x-forwarded-for')
    const ip =
      forwardedFor?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      request.headers.get('cf-connecting-ip') ??
      null
    const userAgent = request.headers.get('user-agent')
    const now = new Date()
    const nowIso = now.toISOString()
    const seoulToday = seoulDateString(now)

    const { data: existingSession } = await adminClient
      .from('active_user_sessions')
      .select('last_seen_at')
      .eq('session_id', sessionId)
      .maybeSingle()

    const { data: dwellRow, error: dwellFetchError } = await adminClient
      .from('app_users')
      .select('total_active_seconds, today_active_seconds, today_stats_date, today_first_login_at')
      .eq('id', uid)
      .maybeSingle()

    if (dwellFetchError) {
      return NextResponse.json({ error: dwellFetchError.message }, { status: 400 })
    }

    let totalActive = Number(dwellRow?.total_active_seconds ?? 0)
    let todayActive = Number(dwellRow?.today_active_seconds ?? 0)
    const prevStatsDate = dwellRow?.today_stats_date ?? null
    const crossedMidnight = prevStatsDate != null && prevStatsDate !== seoulToday

    let todayFirst: string | null = crossedMidnight ? null : (dwellRow?.today_first_login_at ?? null)
    if (crossedMidnight) {
      todayActive = 0
    }

    let deltaSec = 0
    if (hadRecentInteraction && existingSession?.last_seen_at) {
      const gapMs = now.getTime() - new Date(existingSession.last_seen_at).getTime()
      if (gapMs > 0 && gapMs <= IDLE_MS) {
        deltaSec = Math.min(Math.floor(gapMs / 1000), MAX_DWELL_CHUNK_SEC)
      }
    }

    totalActive += deltaSec
    todayActive += deltaSec

    if (todayFirst == null && (deltaSec > 0 || (crossedMidnight && hadRecentInteraction))) {
      todayFirst = nowIso
    }

    const { data: updatedUser, error: userUpdErr } = await adminClient
      .from('app_users')
      .update({
        total_active_seconds: totalActive,
        today_active_seconds: todayActive,
        today_stats_date: seoulToday,
        today_first_login_at: todayFirst,
      })
      .eq('id', uid)
      .select('total_active_seconds, today_active_seconds, today_first_login_at')
      .single()

    if (userUpdErr) return NextResponse.json({ error: userUpdErr.message }, { status: 400 })

    const { error: upsertError } = await adminClient.from('active_user_sessions').upsert(
      {
        session_id: sessionId,
        user_id: uid,
        email: appUser?.email ?? user.email ?? null,
        user_name: appUser?.user_name ?? user.user_metadata?.user_name ?? null,
        ip,
        user_agent: userAgent,
        is_online: body.isOnline ?? true,
        last_seen_at: nowIso,
        total_active_seconds: Number(updatedUser?.total_active_seconds ?? totalActive),
        today_active_seconds: Number(updatedUser?.today_active_seconds ?? todayActive),
        today_first_login_at: updatedUser?.today_first_login_at ?? todayFirst,
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
