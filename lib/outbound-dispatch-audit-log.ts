import type { SupabaseClient } from '@supabase/supabase-js'

export type OutboundDispatchAuditAction = 'assign' | 'reassign' | 'recall' | 'execute_self' | 'complete'

export type OutboundDispatchAuditSnapshot = {
  status: string
  outbound_completed: boolean
  dispatch_state: 'queue' | 'assigned' | 'in_progress' | 'completed'
  dispatch_handler_user_id: string | null
  dispatch_handler_name: string | null
  remarks: string | null
}

type OutboundDispatchAuditRowInput = {
  outbound_request_id: number
  approval_doc_id: number | null
  action_type: OutboundDispatchAuditAction
  actor_id: string
  actor_name?: string | null
  reason?: string | null
  occurred_at?: string
  before_state: OutboundDispatchAuditSnapshot
  after_state: OutboundDispatchAuditSnapshot
  dedupe_key?: string | null
}

export async function logOutboundDispatchAuditEvent(
  supabase: Pick<SupabaseClient, 'from'>,
  row: OutboundDispatchAuditRowInput
): Promise<void> {
  const { error } = await supabase.from('outbound_dispatch_audit_logs').insert({
    outbound_request_id: row.outbound_request_id,
    approval_doc_id: row.approval_doc_id,
    action_type: row.action_type,
    actor_id: row.actor_id,
    actor_name: row.actor_name ?? null,
    reason: row.reason ?? null,
    occurred_at: row.occurred_at ?? new Date().toISOString(),
    before_state: row.before_state,
    after_state: row.after_state,
    dedupe_key: row.dedupe_key ?? null,
  })

  if (error) {
    const code = (error as { code?: string } | null | undefined)?.code
    if (code === '23505' && row.dedupe_key) return
    const message = typeof error.message === 'string' ? error.message.trim() : ''
    throw new Error(message || '출고 통제 감사로그 저장에 실패했습니다.')
  }
}
