import type { SupabaseClient } from '@supabase/supabase-js'

/** Draft/save helpers use a structural supabase; only `rpc` is required for fan-out. */
export type WorkFanoutRpcClient = Pick<SupabaseClient, 'rpc'>

export type WorkApprovalRecipientMode = 'pending_lines' | 'writer'

export function workApprovalSubmitDedupeKey(docId: number, docNo: string) {
  return `work:approval_doc:${docId}:submit:${docNo}`
}

export function workApprovalLineTurnDedupeKey(docId: number, activatedLineNo: number) {
  return `work:approval_doc:${docId}:line_turn:${activatedLineNo}`
}

export function workApprovalFinalDedupeKey(docId: number) {
  return `work:approval_doc:${docId}:final_approved`
}

export function approvalDocumentInboxPath(docId: number) {
  return `/approvals/${docId}`
}

type FanoutArgs = {
  actorId: string
  approvalDocId: number
  recipientMode: WorkApprovalRecipientMode
  type: string
  title: string
  targetUrl: string
  /** When null/omitted, always inserts a new notification_events row (no dedupe). */
  dedupeKey?: string | null
  payload?: Record<string, unknown>
}

export async function fanoutWorkApprovalNotification(
  supabase: WorkFanoutRpcClient,
  args: FanoutArgs
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('fanout_work_approval_notification', {
    p_actor_id: args.actorId,
    p_approval_doc_id: args.approvalDocId,
    p_recipient_mode: args.recipientMode,
    p_type: args.type,
    p_title: args.title.trim(),
    p_target_url: args.targetUrl.trim(),
    p_dedupe_key: args.dedupeKey ?? null,
    p_payload: args.payload ?? {},
  })
  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true }
}

/** Non-blocking; logs a warning on failure (Realtime UX should not block primary action). */
export function fanoutWorkApprovalNotificationQuiet(
  supabase: WorkFanoutRpcClient,
  args: FanoutArgs
): void {
  void fanoutWorkApprovalNotification(supabase, args).then((r) => {
    if (!r.ok) {
      console.warn('[fanout_work_approval_notification]', r.message)
    }
  })
}
