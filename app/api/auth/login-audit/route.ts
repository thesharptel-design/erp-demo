import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordLoginAudit } from '@/lib/login-audit'

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

    await recordLoginAudit(adminClient, {
      email,
      userId: appUser?.id ?? null,
      success: Boolean(body.success),
      ip,
      userAgent,
      sessionId: body.sessionId ?? null,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: '로그인 감사 기록 실패' }, { status: 500 })
  }
}
