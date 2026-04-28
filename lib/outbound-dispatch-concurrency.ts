type GuardableQuery<T> = {
  eq: (column: string, value: unknown) => T
  is: (column: string, value: null) => T
}

export type OutboundDispatchConcurrencySnapshot = {
  id: number
  status: string
  outbound_completed: boolean
  dispatch_state: 'queue' | 'assigned' | 'in_progress' | 'completed' | null
  dispatch_handler_user_id: string | null
  updated_at: string | null
}

/**
 * DB condition guard for first-writer-wins concurrency control.
 * If any tracked column changed after read, update affects 0 rows.
 */
export function applyOutboundDispatchConcurrencyGuard<T extends GuardableQuery<T>>(
  query: T,
  snapshot: OutboundDispatchConcurrencySnapshot
): T {
  const guardedByState = query
    .eq('id', snapshot.id)
    .eq('status', snapshot.status)
    .eq('outbound_completed', snapshot.outbound_completed)
    .eq('dispatch_state', snapshot.dispatch_state ?? 'queue')

  const guardedByHandler =
    snapshot.dispatch_handler_user_id == null
      ? guardedByState.is('dispatch_handler_user_id', null)
      : guardedByState.eq('dispatch_handler_user_id', snapshot.dispatch_handler_user_id)

  return snapshot.updated_at == null
    ? guardedByHandler.is('updated_at', null)
    : guardedByHandler.eq('updated_at', snapshot.updated_at)
}
