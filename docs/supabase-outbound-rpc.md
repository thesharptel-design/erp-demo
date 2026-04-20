# Outbound stock RPCs

SQL definitions live in the repo under `supabase/migrations/20260420120000_outbound_stock_rpc_and_doc_uniques.sql`.

Apply with the Supabase CLI (from project root):

```bash
supabase db push
# or link a remote project and run migrations via the Supabase dashboard SQL editor (paste the file contents).
```

## `execute_outbound_request_fulfillment(p_outbound_request_id bigint, p_lines jsonb)`

Single transaction: validates the outbound request is `approved`, decrements each `inventory` row, inserts matching `inventory_transactions` (`trans_type = 'OUT'`, `ref_table = 'outbound_requests'`, `ref_id`, `inventory_id`), then sets the request to `completed`. Uses `auth.uid()` for `actor_id` / `created_by`.

`p_lines` format:

```json
[
  { "inventory_id": 1, "item_id": 10, "qty": 3 }
]
```

The UI (`app/outbound-instructions/page.tsx`) builds this payload and calls the RPC once per 출고 실행.

## `finalize_outbound_cancellation(p_doc_id bigint)`

Finds `outbound_requests` by `approval_doc_id = p_doc_id`, restores stock for related `OUT` transactions (prefers `ref_table`/`ref_id`; falls back to legacy `remarks LIKE '%출고요청(<req_no>)%'` without refs), then deletes those transaction rows. Uses `auth.uid()`. Approval header / outbound status updates remain in app code (`components/ApprovalActionButtons.tsx`).

## Document number uniqueness

The same migration adds partial unique indexes on serialised document number columns used by `lib/serial-doc-no.ts` (`approval_docs.doc_no`, `quotes.quote_no`, `purchase_orders.po_no`, `production_orders.prod_no`, `outbound_orders.outbound_no`, `qc_requests.qc_no`). `generateNextSerialDocNo` re-reads the max tail and rechecks existence before returning a candidate to reduce duplicate collisions under concurrency.
