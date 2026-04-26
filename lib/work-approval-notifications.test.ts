import { describe, expect, it, vi } from 'vitest'
import {
  approvalDocumentInboxPath,
  fanoutWorkApprovalNotification,
  workApprovalFinalDedupeKey,
  workApprovalLineTurnDedupeKey,
  workApprovalSubmitDedupeKey,
} from '@/lib/work-approval-notifications'

describe('work approval notification dedupe keys', () => {
  it('submit key ties doc id and doc number', () => {
    expect(workApprovalSubmitDedupeKey(42, 'APP-2026-0001')).toBe('work:approval_doc:42:submit:APP-2026-0001')
  })

  it('line turn key uses activated line number', () => {
    expect(workApprovalLineTurnDedupeKey(7, 3)).toBe('work:approval_doc:7:line_turn:3')
  })

  it('final approved key is stable per doc', () => {
    expect(workApprovalFinalDedupeKey(99)).toBe('work:approval_doc:99:final_approved')
  })

  it('inbox path matches approvals detail route', () => {
    expect(approvalDocumentInboxPath(123)).toBe('/approvals/123')
  })
})

describe('fanoutWorkApprovalNotification', () => {
  it('trims title and targetUrl and forwards payload to rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const supabase = { rpc } as Pick<import('@supabase/supabase-js').SupabaseClient, 'rpc'>

    const result = await fanoutWorkApprovalNotification(supabase, {
      actorId: 'actor-uuid',
      approvalDocId: 10,
      recipientMode: 'pending_lines',
      type: 'approval_submit',
      title: '  결재 대기: 제목  ',
      targetUrl: '  /approvals/10  ',
      dedupeKey: 'work:approval_doc:10:submit:APP-1',
      payload: { approval_doc_id: 10 },
    })

    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('fanout_work_approval_notification', {
      p_actor_id: 'actor-uuid',
      p_approval_doc_id: 10,
      p_recipient_mode: 'pending_lines',
      p_type: 'approval_submit',
      p_title: '결재 대기: 제목',
      p_target_url: '/approvals/10',
      p_dedupe_key: 'work:approval_doc:10:submit:APP-1',
      p_payload: { approval_doc_id: 10 },
    })
  })

  it('returns failure when rpc errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls' } })
    const supabase = { rpc } as Pick<import('@supabase/supabase-js').SupabaseClient, 'rpc'>

    const result = await fanoutWorkApprovalNotification(supabase, {
      actorId: 'a',
      approvalDocId: 1,
      recipientMode: 'writer',
      type: 'work_approval_rejected',
      title: 't',
      targetUrl: '/approvals/1',
    })

    expect(result).toEqual({ ok: false, message: 'rls' })
  })
})
