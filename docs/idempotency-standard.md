# ERP Idempotency Standard (Client + Server)

This document defines the end-to-end idempotency contract for ERP writes:

- Client-side single-submit guard (rapid-click prevention)
- Server-side idempotency/state-guard contract (repeat-request safety)

The goal is to prevent duplicate writes without changing current ERP status transitions, payload semantics, or process logic.

## 1) Non-Negotiable Rules

1. Existing business status transitions stay unchanged.
2. Existing RPC signatures and payload shapes stay compatible.
3. Repeated requests must be deterministic: same result class every time.
4. Invalid pre-state transitions must be rejected consistently.
5. No destructive schema rewrite; only additive constraints/indexes.

## 2) Client Contract (Single-Submit)

All client write triggers (create/update/delete/approve/reject/cancel/confirm) must follow:

1. Lock immediately before first `await`.
2. Return early on second click while locked.
3. Drive disabled/loading UI from the same in-flight state.
4. Release lock in `finally`.
5. Wrap existing flow only; do not rewrite business steps.

Recommended shared hook API:

```ts
type SingleSubmitOptions = {
  minLockMs?: number
}

type SingleSubmitGuard = {
  isSubmitting: boolean
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
}
```

## 3) Server Contract (Mandatory)

All write endpoints/RPC callers must classify responses using this canonical envelope:

```ts
type IdempotencyResult = {
  success: boolean
  idempotency: {
    key?: string
    status: 'processed' | 'replayed' | 'no_op' | 'rejected'
    reason?: 'duplicate' | 'invalid_pre_state' | 'conflict' | 'validation'
  }
  message?: string
  data?: unknown
}
```

Rules:

1. **`processed`**: first valid execution applied write(s).
2. **`replayed`**: same idempotency key and equivalent payload seen again; return deterministic previously-committed result.
3. **`no_op`**: target already in desired terminal state; return success with no additional write.
4. **`rejected`**: invalid transition or conflicting payload/key; return safe error.

Default HTTP status mapping:

- `200`/`201`: `processed`, `replayed`, `no_op`
- `409`: `rejected` with `invalid_pre_state` or payload/key conflict
- `400`/`422`: payload validation error
- `401`/`403`: auth/permission
- `500`: unexpected server failure

## 4) Action-Type Contract (Server)

### A. State Transition Actions (Tier A)

Examples: approve/reject/cancel/finalize/execute inventory-transfer related transitions.

Contract:

1. Enforce conditional update (`WHERE id = ? AND status IN (allowed_pre_states)`).
2. If update count is `1` -> `processed`.
3. If row already in target terminal state -> `no_op`.
4. If row exists but pre-state invalid -> `rejected` + `409`.
5. Do not emit duplicate ledger/history records on retries.

### B. Create Actions (Document/Row Creation)

Examples: approval submit, outbound request create, quote/order/new board post.

Contract:

1. Require `idempotency_key` for externally retriable create requests.
2. Persist request fingerprint (`actor + route + normalized payload hash`) with key.
3. Same key + same fingerprint -> `replayed` (return original created IDs).
4. Same key + different fingerprint -> `rejected` + `409`.
5. If key absent (legacy path), enforce best-effort dedupe using unique constraints where safe.

### C. Update Actions (Mutable Document Edit)

Examples: customer/item/profile/settings updates.

Contract:

1. Target update must include explicit row selector and precondition (`updated_at`/version when available).
2. Exact-repeat payload on unchanged state -> `no_op`.
3. Concurrent stale update conflict -> `rejected` + `409`.
4. Never create additional rows as side-effect of pure update retries.

### D. Delete/Cancel/Hard-Delete Actions (Destructive)

Examples: approval delete, admin delete users/docs, draft cleanup.

Contract:

1. Validate deletable pre-state before delete.
2. First delete success -> `processed`.
3. Retry after already deleted/rolled back -> `no_op` (or `replayed` if key tracked).
4. If preconditions fail (for example non-draft protected state) -> `rejected` + `409`.

### E. Append-Only Events / Audit / Heartbeat

Examples: login audit, session heartbeat, history append.

Contract:

1. For periodic updates (`session-heartbeat`), use deterministic upsert key (`user_id + session_id`).
2. For append events, include event dedupe key when retried by UI/server.
3. Duplicate append with same dedupe key -> `replayed` or `no_op`.
4. Do not inflate counters/active-session rows on identical retries.

### F. File Upload/Attachment Actions

Examples: approval/board/user-seal uploads.

Contract:

1. Generate deterministic object path from idempotency scope (`entity_id + slot + content_hash`) when feasible.
2. Re-upload with same logical file identity -> return existing object as `replayed`.
3. Avoid creating multiple object rows for same logical attachment intent.
4. If same key uploads different file hash -> `rejected` + `409`.

## 5) Transaction and Integrity Backstops

1. Multi-step critical mutations must run in one transaction boundary (DB function or explicit transaction block).
2. Ledger + status transitions must commit/rollback together.
3. Add unique indexes only after validating historical data compatibility.
4. For RPC transitions, make replay path return stable identifiers and status payload.

## 6) Rollout Order and Acceptance

Rollout order: **Tier A -> Tier B -> Tier C**.

Per action before rollout:

1. Define idempotency key scope (or state-guard strategy if keyless legacy).
2. Define accepted pre-state(s) and target state(s).
3. Define duplicate behavior (`replayed` vs `no_op`).
4. Define conflict behavior and status code.
5. Add rapid-repeat test (UI click spam + API retry).

## 7) Minimum Test Matrix (Server)

For each critical action, test:

1. First request applies mutation (`processed`).
2. Immediate identical retry returns deterministic non-duplicating result (`replayed` or `no_op`).
3. Retry with same key but different payload returns `409`.
4. Invalid pre-state transition returns `409` without side effects.
5. Partial failure cannot leave split writes (transaction rollback verified).

