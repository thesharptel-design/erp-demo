import { describe, expect, it } from 'vitest'
import {
  inferIdempotencyFromRpcError,
  rejectedEnvelope,
  successEnvelope,
} from '@/lib/server-idempotency'

describe('successEnvelope', () => {
  it('builds processed envelope with data', () => {
    expect(successEnvelope('processed', { id: 10 })).toEqual({
      success: true,
      idempotency: { status: 'processed', key: undefined },
      data: { id: 10 },
    })
  })

  it('builds replayed envelope with message', () => {
    expect(successEnvelope('replayed', undefined, '이미 처리됨')).toEqual({
      success: true,
      idempotency: { status: 'replayed', key: undefined },
      message: '이미 처리됨',
    })
  })
})

describe('rejectedEnvelope', () => {
  it('marks rejected with reason', () => {
    expect(rejectedEnvelope('validation', '입력 오류')).toEqual({
      success: false,
      idempotency: { status: 'rejected', reason: 'validation', key: undefined },
      message: '입력 오류',
    })
  })
})

describe('inferIdempotencyFromRpcError', () => {
  it('maps idempotency conflict to 409 conflict', () => {
    const mapped = inferIdempotencyFromRpcError(
      'IDEMPOTENCY_CONFLICT: 동일 키에 다른 요청 payload가 전달되었습니다.'
    )
    expect(mapped.httpStatus).toBe(409)
    expect(mapped.envelope.idempotency).toMatchObject({
      status: 'rejected',
      reason: 'conflict',
    })
  })

  it('maps duplicate-like messages to replayed', () => {
    const mapped = inferIdempotencyFromRpcError('이미 처리된 요청입니다.')
    expect(mapped.httpStatus).toBe(200)
    expect(mapped.envelope.idempotency.status).toBe('replayed')
  })

  it('maps insufficient state to invalid pre-state conflict', () => {
    const mapped = inferIdempotencyFromRpcError('재고가 부족합니다.')
    expect(mapped.httpStatus).toBe(409)
    expect(mapped.envelope.idempotency).toMatchObject({
      status: 'rejected',
      reason: 'invalid_pre_state',
    })
  })

  it('maps auth/permission to 403', () => {
    const mapped = inferIdempotencyFromRpcError('권한이 없습니다.')
    expect(mapped.httpStatus).toBe(403)
    expect(mapped.envelope.idempotency.reason).toBe('permission')
  })
})
