import type { SupabaseClient } from '@supabase/supabase-js'

/** Draft/save helpers use a structural supabase; only `rpc` is required for fan-out. */
export type WorkFanoutRpcClient = Pick<SupabaseClient, 'rpc'>

export type WorkApprovalRecipientMode =
  | 'pending_lines'
  | 'writer'
  /** `approval_docs.current_line_no` 와 같은 `approval_lines.line_no` 담당자 (결재 취소 릴레이 등) */
  | 'doc_current_line'
  /** 결재선 참조·협조·결재 전원(행동 역할), 기안자 제외 — 기안 회수 알림 등 */
  | 'actionable_all_except_actor'

export function workApprovalSubmitDedupeKey(docId: number, docNo: string) {
  return `work:approval_doc:${docId}:submit:${docNo}`
}

export function workApprovalLineTurnDedupeKey(docId: number, activatedLineNo: number) {
  return `work:approval_doc:${docId}:line_turn:${activatedLineNo}`
}

export function workApprovalFinalDedupeKey(docId: number) {
  return `work:approval_doc:${docId}:final_approved`
}

export function workApprovalPostConfirmRequestDedupeKey(docId: number) {
  return `work:approval_doc:${docId}:post_confirm_request_v1`
}

export function workApprovalOverrideApproveDedupeKey(docId: number) {
  return `work:approval_doc:${docId}:override_approved_v1`
}

export function workApprovalRejectDedupeKey(docId: number, actionType: string, actorLineNo: number) {
  return `work:approval_doc:${docId}:${actionType}:line:${actorLineNo}`
}

export function workApprovalCancelRequestDedupeKey(docId: number) {
  return `work:approval_doc:${docId}:cancel_request_v1`
}

export function workApprovalCancelRelayDedupeKey(docId: number, currentLineNo: number) {
  return `work:approval_doc:${docId}:cancel_relay_line:${currentLineNo}`
}

export function workApprovalCancelWriterHandoffDedupeKey(docId: number) {
  return `work:approval_doc:${docId}:cancel_writer_handoff_v1`
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
