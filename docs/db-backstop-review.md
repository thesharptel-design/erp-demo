# DB Backstop Review (Additive Duplicate-Prevention)

This review proposes **additive** database constraints/indexes for duplicate prevention, aligned with the ERP idempotency rollout rules.

Goals:
- prevent duplicate state/write side effects on retries
- keep existing status transitions and payload semantics unchanged
- avoid destructive schema changes

## 1) Current Backstops Already in Place

- `inventory_unique_tracking_key` unique index exists on `inventory` tracking dimensions including `warehouse_id`.
- Unique document numbers already exist for core docs (`approval_docs.doc_no`, `quotes.quote_no`, `purchase_orders.po_no`, `production_orders.prod_no`, `outbound_orders.outbound_no`, `qc_requests.qc_no`).
- `active_user_sessions.session_id` is already unique.
- Board likes already enforce one-like-per-user (`board_post_likes` / `board_comment_likes` PK on `(target_id, user_id)`).
- Inventory idempotency tables currently use `(actor_id, idempotency_key)` primary keys.

## 2) Recommended Additive Constraints/Indexes

These are prioritized for duplicate-sensitive paths.

### A. Enforce one outbound request per approval doc (Tier A)

Rationale:
- Multiple RPCs assume `approval_doc_id -> outbound_requests` is single-row.
- Duplicate outbound request rows for the same approval document can produce repeated stock effects.

Proposal:

```sql
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_outbound_requests_approval_doc_id
ON public.outbound_requests (approval_doc_id)
WHERE approval_doc_id IS NOT NULL;
```

Preflight compatibility check:

```sql
SELECT approval_doc_id, count(*) AS cnt
FROM public.outbound_requests
WHERE approval_doc_id IS NOT NULL
GROUP BY approval_doc_id
HAVING count(*) > 1;
```

### B. Add replay cleanup/read index on transfer idempotency table (Tier A operability)

Rationale:
- Primary key protects duplicates, but operational cleanup and recent-key replay checks become slower over time.
- Additive index improves retention jobs/diagnostics without changing behavior.

Proposal:

```sql
CREATE INDEX IF NOT EXISTS inventory_transfer_idempotency_created_at_idx
ON public.inventory_transfer_idempotency (created_at DESC);
```

### C. Add optional dedupe key for approval history append actions (Tier A/B)

Rationale:
- `approval_histories` is append-only and can be inflated by retries.
- A nullable dedupe key allows gradual rollout: legacy inserts remain valid, retriable routes can opt in.

Proposal:

```sql
ALTER TABLE public.approval_histories
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_approval_histories_doc_dedupe_key
ON public.approval_histories (approval_doc_id, dedupe_key)
WHERE dedupe_key IS NOT NULL;
```

Preflight compatibility check (only needed if column already exists and has values):

```sql
SELECT approval_doc_id, dedupe_key, count(*) AS cnt
FROM public.approval_histories
WHERE dedupe_key IS NOT NULL
GROUP BY approval_doc_id, dedupe_key
HAVING count(*) > 1;
```

### D. Add optional ledger dedupe key for inventory transactions (Tier A)

Rationale:
- Critical stock ledgers are append-style; retries can duplicate rows if endpoint/RPC guard fails.
- Nullable dedupe key + partial unique index creates DB-level backstop only for migrated write paths.

Proposal:

```sql
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_inventory_transactions_ref_dedupe_key
ON public.inventory_transactions (ref_table, ref_id, trans_type, dedupe_key)
WHERE dedupe_key IS NOT NULL;
```

Preflight compatibility check (only needed if column already exists and has values):

```sql
SELECT ref_table, ref_id, trans_type, dedupe_key, count(*) AS cnt
FROM public.inventory_transactions
WHERE dedupe_key IS NOT NULL
GROUP BY ref_table, ref_id, trans_type, dedupe_key
HAVING count(*) > 1;
```

## 3) Rollout Recommendation (Safe Order)

1. Apply `A` first (highest integrity impact, lowest behavior risk).
2. Apply `B` with the next maintenance migration.
3. Ship `C`/`D` as schema-first optional columns, then gradually populate `dedupe_key` in Tier A endpoints/RPCs.
4. Enforce per-module only after replay tests pass (`processed` -> immediate retry `replayed`/`no_op`).

## 4) Notes

- Use `CONCURRENTLY` for unique indexes on larger production tables to reduce lock risk.
- Keep migration scripts additive and avoid changing existing status/state transition rules.
- If any preflight query returns rows, resolve data first and delay unique index enforcement for that target.
