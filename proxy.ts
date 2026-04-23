import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  let effectiveUser: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    const refreshCorrupt =
      !!authError &&
      (authError.code === 'refresh_token_not_found' ||
        authError.code === 'invalid_refresh_token' ||
        authError.message?.toLowerCase().includes('refresh token'))

    if (refreshCorrupt) {
      await supabase.auth.signOut()
      effectiveUser = null
    } else {
      effectiveUser = user
    }
  } catch {
    await supabase.auth.signOut()
    effectiveUser = null
  }

  if (!effectiveUser && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (effectiveUser && request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Exclude every `/_next/*` request (webpack chunks, dev internals, static, image, …).
     * Otherwise each internal fetch runs this proxy and Supabase may try token refresh in parallel,
     * spamming `refresh_token_not_found` for one bad cookie set.
     */
    '/((?!_next/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
