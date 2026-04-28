import { describe, expect, it } from 'vitest'
import {
  applyOutboundDispatchConcurrencyGuard,
  type OutboundDispatchConcurrencySnapshot,
} from '@/lib/outbound-dispatch-concurrency'

type GuardCall = { kind: 'eq' | 'is'; column: string; value: unknown }

function createFakeQuery(calls: GuardCall[]) {
  return {
    eq(column: string, value: unknown) {
      calls.push({ kind: 'eq', column, value })
      return this
    },
    is(column: string, value: null) {
      calls.push({ kind: 'is', column, value })
      return this
    },
  }
}

describe('applyOutboundDispatchConcurrencyGuard', () => {
  it('adds full guard conditions with non-null handler and updated_at', () => {
    const calls: GuardCall[] = []
    const query = createFakeQuery(calls)
    const snapshot: OutboundDispatchConcurrencySnapshot = {
      id: 101,
      status: 'approved',
      outbound_completed: false,
      dispatch_state: 'assigned',
      dispatch_handler_user_id: 'u-1',
      updated_at: '2026-04-28T00:00:00.000Z',
    }

    applyOutboundDispatchConcurrencyGuard(query, snapshot)

    expect(calls).toEqual([
      { kind: 'eq', column: 'id', value: 101 },
      { kind: 'eq', column: 'status', value: 'approved' },
      { kind: 'eq', column: 'outbound_completed', value: false },
      { kind: 'eq', column: 'dispatch_state', value: 'assigned' },
      { kind: 'eq', column: 'dispatch_handler_user_id', value: 'u-1' },
      { kind: 'eq', column: 'updated_at', value: '2026-04-28T00:00:00.000Z' },
    ])
  })

  it('uses IS NULL guard when handler and updated_at are null', () => {
    const calls: GuardCall[] = []
    const query = createFakeQuery(calls)
    const snapshot: OutboundDispatchConcurrencySnapshot = {
      id: 102,
      status: 'approved',
      outbound_completed: false,
      dispatch_state: null,
      dispatch_handler_user_id: null,
      updated_at: null,
    }

    applyOutboundDispatchConcurrencyGuard(query, snapshot)

    expect(calls).toEqual([
      { kind: 'eq', column: 'id', value: 102 },
      { kind: 'eq', column: 'status', value: 'approved' },
      { kind: 'eq', column: 'outbound_completed', value: false },
      { kind: 'eq', column: 'dispatch_state', value: 'queue' },
      { kind: 'is', column: 'dispatch_handler_user_id', value: null },
      { kind: 'is', column: 'updated_at', value: null },
    ])
  })
})
