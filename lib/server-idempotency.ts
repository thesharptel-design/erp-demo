export type IdempotencyStatus = 'processed' | 'replayed' | 'no_op' | 'rejected'

export type IdempotencyReason =
  | 'duplicate'
  | 'invalid_pre_state'
  | 'conflict'
  | 'validation'
  | 'permission'
  | 'server_error'

export type IdempotencyEnvelope<T = unknown> = {
  success: boolean
  idempotency: {
    key?: string
    status: IdempotencyStatus
    reason?: IdempotencyReason
  }
  message?: string
  data?: T
}

export function successEnvelope<T>(
  status: Extract<IdempotencyStatus, 'processed' | 'replayed' | 'no_op'>,
  data?: T,
  message?: string,
  key?: string
): IdempotencyEnvelope<T> {
  return {
    success: true,
    idempotency: { status, key },
    ...(message ? { message } : {}),
    ...(data === undefined ? {} : { data }),
  }
}

export function rejectedEnvelope(
  reason: IdempotencyReason,
  message: string,
  key?: string
): IdempotencyEnvelope<never> {
  return {
    success: false,
    idempotency: { status: 'rejected', reason, key },
    message,
  }
}

export function inferIdempotencyFromRpcError(message: string): {
  httpStatus: number
  envelope: IdempotencyEnvelope
} {
  const normalized = message.toLowerCase()
  if (normalized.includes('권한') || normalized.includes('인증')) {
    return {
      httpStatus: 403,
      envelope: rejectedEnvelope('permission', message),
    }
  }

  if (
    normalized.includes('already') ||
    normalized.includes('이미') ||
    normalized.includes('duplicate') ||
    normalized.includes('중복')
  ) {
    return {
      httpStatus: 200,
      envelope: successEnvelope('replayed', undefined, message),
    }
  }

  if (
    normalized.includes('idempotency_conflict') ||
    normalized.includes('동일 키에 다른 요청')
  ) {
    return {
      httpStatus: 409,
      envelope: rejectedEnvelope('conflict', message),
    }
  }

  if (
    normalized.includes('insufficient') ||
    normalized.includes('부족') ||
    normalized.includes('invalid state') ||
    normalized.includes('전이') ||
    normalized.includes('상태')
  ) {
    return {
      httpStatus: 409,
      envelope: rejectedEnvelope('invalid_pre_state', message),
    }
  }

  if (normalized.includes('invalid') || normalized.includes('검증') || normalized.includes('형식')) {
    return {
      httpStatus: 400,
      envelope: rejectedEnvelope('validation', message),
    }
  }

  return {
    httpStatus: 400,
    envelope: rejectedEnvelope('conflict', message),
  }
}
