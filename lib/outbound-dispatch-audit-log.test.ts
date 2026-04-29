import { describe, expect, it, vi } from 'vitest'
import { logOutboundDispatchAuditEvent } from '@/lib/outbound-dispatch-audit-log'

function createMockSupabase(result: { error: { code?: string; message?: string } | null }) {
  const insert = vi.fn().mockResolvedValue(result)
  const from = vi.fn().mockReturnValue({ insert })
  return { client: { from }, insert, from }
}

const basePayload = {
  outbound_request_id: 1001,
  approval_doc_id: 2001,
  action_type: 'assign' as const,
  actor_id: 'u-1',
  actor_name: '담당자',
  reason: '회귀 테스트',
  before_state: {
    status: 'approved',
    outbound_completed: false,
    dispatch_state: 'queue' as const,
    dispatch_handler_user_id: null,
    dispatch_handler_name: null,
    remarks: null,
  },
  after_state: {
    status: 'approved',
    outbound_completed: false,
    dispatch_state: 'assigned' as const,
    dispatch_handler_user_id: 'u-2',
    dispatch_handler_name: '홍길동',
    remarks: '담당자 지정',
  },
  dedupe_key: 'dispatch-audit:test-key',
}

describe('logOutboundDispatchAuditEvent', () => {
  it('inserts audit row with defaults and nullable fields normalized', async () => {
    const { client, insert, from } = createMockSupabase({ error: null })
    await logOutboundDispatchAuditEvent(client, {
      ...basePayload,
      actor_name: undefined,
      reason: undefined,
      occurred_at: undefined,
    })

    expect(from).toHaveBeenCalledWith('outbound_dispatch_audit_logs')
    expect(insert).toHaveBeenCalledTimes(1)
    const inserted = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(inserted.actor_name).toBeNull()
    expect(inserted.reason).toBeNull()
    expect(inserted.dedupe_key).toBe(basePayload.dedupe_key)
    expect(typeof inserted.occurred_at).toBe('string')
  })

  it('swallows duplicate-key errors when dedupe_key exists', async () => {
    const { client } = createMockSupabase({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    await expect(logOutboundDispatchAuditEvent(client, basePayload)).resolves.toBeUndefined()
  })

  it('throws normalized error message for non-duplicate failures', async () => {
    const { client } = createMockSupabase({
      error: { code: 'XX000', message: 'insert failed' },
    })
    await expect(logOutboundDispatchAuditEvent(client, basePayload)).rejects.toThrow('insert failed')
  })
})
