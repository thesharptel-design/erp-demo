# Write Action Inventory

This inventory lists current write actions (create/update/delete/state transition), their execution entrypoint (endpoint or RPC), and affected tables.

## API / Route Handlers

| Module | Write Action | Endpoint / RPC | Affected Tables |
| --- | --- | --- | --- |
| Inventory adjustment | Adjust available/quarantine stock and append stock ledger entry | `POST /api/inventory/adjust` | `inventory`, `inventory_transactions` |
| Inventory transfer | Warehouse-to-warehouse transfer with paired IN/OUT ledger | `POST /api/inventory/transfer` -> `rpc: execute_inventory_transfer` | `inventory`, `inventory_transactions` |
| Inbound processing (single/template) | Upsert inbound stock rows, write IN transactions, write upload logs | `POST /api/inbound/process` | `inventory`, `inventory_transactions`, `inbound_upload_logs`, `inbound_upload_log_rows` |
| Outbound request submit (server route) | Create approval doc for outbound request and mark request submitted | `POST /outbound-requests/submit` | `approval_docs`, `outbound_requests` |
| Admin create user | Create/update user profile and warehouse mappings | `POST /api/admin/create-user` | `app_users`, `app_user_warehouses` |
| Admin bulk create users | Bulk insert users + warehouse mappings (with rollback delete on failure) | `POST /api/admin/create-users-bulk` | `app_users`, `app_user_warehouses` |
| Admin update user | Update user profile and replace warehouse mappings | `POST /api/admin/update-user` | `app_users`, `app_user_warehouses` |
| Admin delete users | Delete user rows | `POST /api/admin/delete-users` | `app_users` |
| Admin user seal upload | Update user seal image path | `POST /api/admin/user-seal-upload` | `app_users` |
| Auth login audit | Update login-related profile/audit columns | `POST /api/auth/login-audit` | `app_users` |
| Session heartbeat | Update `app_users.last_seen_at` and upsert active session row | `POST /api/auth/session-heartbeat` | `app_users`, `active_user_sessions` |
| Board attachment upload | Upload board files to storage bucket | `POST /api/groupware/board/attachments/upload` | `storage.objects` (`board_attachments` bucket) |
| Approval attachment upload | Upload approval files to storage bucket | `POST /api/approvals/attachments/upload` | `storage.objects` (`approval_attachments` bucket) |

## Approval / Outbound Shared Write Services (`lib`)

| Module | Write Action | Endpoint / RPC | Affected Tables |
| --- | --- | --- | --- |
| Approval draft flow (`lib/approval-draft.ts`) | Create draft/submitted approval docs; replace lines/participants; write submit history; delete draft | Direct Supabase writes (client/server caller) | `approval_docs`, `approval_lines`, `approval_participants`, `approval_histories` |
| Outbound draft flow (`lib/outbound-request-draft.ts`) | Create/update outbound approval docs; create/update outbound request header; upsert request items; write submit history; delete draft | Direct Supabase writes (client/server caller) | `approval_docs`, `approval_lines`, `approval_participants`, `approval_histories`, `outbound_requests`, `outbound_request_items` |
| Approval history helper (`lib/approval-history-log.ts`) | Append approval history event | Direct Supabase writes | `approval_histories` |
| Item process config helper (`lib/item-process-config.ts`) | Upsert item process configuration | Direct Supabase writes | `item_process_config` |
| Login audit helper (`lib/login-audit.ts`) | Insert login audit record | Direct Supabase writes | `login_audit_logs` |

## Client Modules (Direct Table Writes)

| Module | Write Action | Endpoint / RPC | Affected Tables |
| --- | --- | --- | --- |
| Approval action buttons (`components/ApprovalActionButtons.tsx`) | Approve/reject/cancel transitions and line resets; hard-delete doc | Direct writes + RPC calls | `approval_docs`, `approval_lines`, `outbound_requests`, `inventory`, `inventory_transactions` (via RPC) |
| Approval cancellation request | Request cancellation relay | `rpc: request_approval_cancellation` | `approval_docs` |
| Final approver direct cancel | One-shot cancel and state reset | `rpc: direct_cancel_final_approval` | `approval_docs`, `approval_lines`, `outbound_requests`, `inventory`, `inventory_transactions` |
| Finalize outbound cancellation | Restore stock and append reversal transaction | `rpc: finalize_outbound_cancellation` | `inventory`, `inventory_transactions`, `outbound_requests` |
| Admin delete approval doc | Admin-only approval doc deletion with outbound rollback | `rpc: admin_delete_approval_doc` | `approval_docs` (cascade: `approval_lines`, `approval_participants`, linked `outbound_requests`) + stock tables via rollback |
| Outbound instruction execute | Execute outbound request fulfillment | `rpc: execute_outbound_request_fulfillment` | `inventory`, `inventory_transactions`, `outbound_requests` |
| Approval edit page (`app/approvals/[id]/edit/page.tsx`) | Delete/rebuild approval lines/participants; delete draft doc | Direct Supabase writes | `approval_docs`, `approval_lines`, `approval_participants` |
| Approval draft form (`components/approvals/useApprovalDraftForm.ts`) | Delete stale draft on resubmit handoff | Direct Supabase writes | `approval_docs` |
| Outbound draft form (`components/outbound/useOutboundRequestDraftForm.ts`) | Delete stale outbound draft on resubmit handoff | Direct Supabase writes | `approval_docs` |

## Master / Document Modules (Direct Table Writes)

| Module | Write Action | Endpoint / RPC | Affected Tables |
| --- | --- | --- | --- |
| Items list/editor (`components/items/ItemsList.tsx`, `app/items/*`) | Create/update/deactivate/delete item records and metadata | Direct Supabase writes | `items` |
| Customers (`app/customers/new/page.tsx`, `app/customers/[id]/page.tsx`) | Create/update customer records | Direct Supabase writes | `customers` |
| Quotes (`app/quotes/new/page.tsx`, `app/quotes/[id]/page.tsx`) | Create/update quote header and replace quote lines | Direct Supabase writes | `quotes`, `quote_items` |
| Sales orders (`app/sales-orders/new/page.tsx`) | Create outbound order + lines + stock transaction row | Direct Supabase writes | `outbound_orders`, `outbound_items`, `inventory_transactions` |
| Purchase orders (`app/purchase-orders/new/page.tsx`, `app/purchase-orders/[id]/page.tsx`) | Create/update PO, manage PO lines, receive stock and transaction history | Direct Supabase writes | `purchase_orders`, `purchase_order_items`, `inventory`, `inventory_transactions` |
| Production orders (`app/production-orders/new/page.tsx`, `app/production-orders/[id]/page.tsx`) | Create/update production order, consume/produce inventory, write transactions | Direct Supabase writes | `production_orders`, `inventory`, `inventory_transactions` |
| QC module (`app/qc/[id]/page.tsx`) | Update QC request status/outcome and create related stock transaction records | Direct Supabase writes | `qc_requests`, `inventory`, `inventory_transactions` |
| Dashboard schedule admin (`app/dashboard/page.tsx`) | Create/update/delete schedule entries | Direct Supabase writes | `dashboard_schedules` |
| COA files admin (`app/admin/coa-files/page.tsx`) | Create/toggle COA file rows | Direct Supabase writes | `coa_files` |
| Warehouses admin (`app/admin/warehouses/page.tsx`) | Create/update/delete warehouses | Direct Supabase writes | `warehouses` |
| Company settings (`app/admin/company-settings/page.tsx`) | Update company metadata/settings | Direct Supabase writes | `company_settings` |
| User permissions/admin pages (`app/admin/user-permissions/page.tsx`, `app/admin/user-approvals/page.tsx`) | Toggle user active state, role/permission updates | Direct Supabase writes | `app_users` |
| Login flow bootstrap (`app/login/page.tsx`) | Upsert app user profile on sign-in bootstrap | Direct Supabase writes | `app_users` |

## Groupware Board Writes

| Module | Write Action | Endpoint / RPC | Affected Tables |
| --- | --- | --- | --- |
| Board new/edit/list/detail (`app/groupware/board/*`) | Create/update/delete board posts, like/unlike posts | Direct Supabase writes + `rpc: increment_board_post_views` | `board_posts`, `board_post_likes` |
| Board comments panel (`components/groupware/BoardCommentsPanel.tsx`) | Create reply/comment, like/unlike comment, edit/delete comment | Direct Supabase writes | `board_comments`, `board_comment_likes` |
| Board view count | Atomic view increment | `rpc: increment_board_post_views` | `board_posts` |

## RPC-to-Table Map (Critical State Transitions)

| RPC | Primary Purpose | Affected Tables |
| --- | --- | --- |
| `execute_inventory_transfer` | Move stock between warehouses in one transaction | `inventory`, `inventory_transactions` |
| `execute_outbound_request_fulfillment` | Consume stock for approved outbound request | `inventory`, `inventory_transactions`, `outbound_requests` |
| `finalize_outbound_cancellation` | Restore stock for cancelled outbound flow | `inventory`, `inventory_transactions` |
| `request_approval_cancellation` | Mark approval doc as cancellation-requested | `approval_docs` |
| `direct_cancel_final_approval` | Final approver cancel after full approval | `approval_docs`, `approval_lines`, `outbound_requests`, stock tables via rollback RPC |
| `admin_delete_approval_doc` | Admin hard delete approval document | `approval_docs` (+ cascades) and stock tables via rollback RPC when outbound-linked |
| `increment_board_post_views` | Increase board post view count | `board_posts` |

## Notes

- `is_approval_admin`, `approval_inbox_query`, and similar access-check/query RPCs were excluded from write inventory because they are read/authorization helpers.
- Some modules write through cascades/triggers (for example board comment count sync and approval-linked outbound cascades). The table list includes direct targets plus known transactional side effects used by current RPCs.
