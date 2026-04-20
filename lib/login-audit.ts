import type { SupabaseClient } from '@supabase/supabase-js'

type SupabaseLike = SupabaseClient

export type LoginAuditPayload = {
  email: string
  userId?: string | null
  success: boolean
  ip?: string | null
  userAgent?: string | null
  sessionId?: string | null
}

export async function recordLoginAudit(client: SupabaseLike, payload: LoginAuditPayload) {
  const { error } = await client.from('login_audit_logs').insert({
    user_id: payload.userId ?? null,
    email: payload.email,
    success: payload.success,
    ip: payload.ip ?? null,
    user_agent: payload.userAgent ?? null,
    session_id: payload.sessionId ?? null,
  })
  if (error) throw new Error(error.message)
}
