# Inbox retention (180 days): operations

This document covers scheduling, manual execution, indexes, and load expectations for private messages and notification inbox tables introduced in `supabase/migrations/20260429120000_private_messages_notifications_inbox.sql`, with purge behavior refined in `supabase/migrations/20260429170000_inbox_retention_cron_and_purge_optimize.sql`.

## Policy

- **Recipient rows** (`private_message_recipients`, `user_notifications`): rows with `archived_at IS NULL` and `created_at` older than **180 days** are **deleted**.
- **Orphan `private_messages`**: parent rows with `created_at` before the cutoff and **no** remaining recipient rows are deleted.
- **Orphan `notification_events`**: rows with `created_at` before the cutoff and **no** `user_notifications` referencing them are deleted (avoids removing very new events that might briefly have zero children).

Rows with **`archived_at` set** are not removed by this job (explicit retention until a separate policy exists).

## Scheduled job (pg_cron)

When the **`pg_cron`** extension is enabled on the database, migration `20260429170000_inbox_retention_cron_and_purge_optimize.sql` registers a daily job:

| Field | Value |
|--------|--------|
| Job name | `purge_inbox_data_180d` |
| Schedule | `5 4 * * *` (04:05 UTC daily) |
| Command | `SELECT public.purge_inbox_data_older_than_180_days();` |

**Supabase hosted:** enable **pg_cron** under Database → Extensions, then apply migrations (or run the `cron.schedule` block once in the SQL editor if the migration already ran before the extension existed).

**Local / CI without pg_cron:** the migration no-ops the `DO` block when the extension is missing; use **Manual invocation** below or an external scheduler calling the same SQL via the **service role**.

## Manual invocation

Run as **service role** (SQL editor with service role, or automation using the service key). The function is `SECURITY DEFINER` but **`EXECUTE` is granted only to `service_role`**, not to `authenticated` clients.

```sql
SELECT public.purge_inbox_data_older_than_180_days();
```

Example result shape:

```json
{
  "cutoff": "2025-10-29T04:05:00Z",
  "private_message_recipients_deleted": 0,
  "private_messages_orphans_deleted": 0,
  "user_notifications_deleted": 0,
  "notification_events_orphans_deleted": 0
}
```

Use these counts for monitoring and alerting (unexpected spikes or sustained growth may indicate archive UX issues or fan-out bugs).

## Indexes (verified for purge and hot paths)

These indexes support the retention `DELETE` filters and normal inbox queries:

| Table | Index | Role |
|--------|--------|------|
| `private_message_recipients` | `idx_private_message_recipients_retention` on `(created_at) WHERE archived_at IS NULL` | Retention delete by age |
| `private_message_recipients` | `idx_private_message_recipients_user_created_at` | Inbox listing by user |
| `private_message_recipients` | `idx_private_message_recipients_message_id` | Sender read receipts / FK checks |
| `private_messages` | `idx_private_messages_created_at` | Orphan message cleanup by age |
| `user_notifications` | `idx_user_notifications_retention` on `(created_at) WHERE archived_at IS NULL` | Retention delete by age |
| `user_notifications` | `idx_user_notifications_user_created_at` | Inbox listing by user |
| `user_notifications` | `idx_user_notifications_event_id` | `NOT EXISTS` / joins to `notification_events` |
| `notification_events` | `idx_notification_events_created_at` | Orphan event cleanup scoped by `created_at < cutoff` |

No extra migration indexes were required beyond the foundation migration; the partial retention indexes align with `WHERE archived_at IS NULL AND created_at < cutoff`.

## Load and operations notes

- **Time window:** 04:05 UTC is a low-traffic default; adjust the cron expression if your org peaks on UTC evening.
- **Duration:** cost is proportional to the number of rows matching the cutoff, not total table size, thanks to partial indexes on `created_at` for non-archived rows.
- **Locks:** `DELETE` takes row-level locks; very large first runs after enabling retention may take longer—consider a one-time manual run during a maintenance window.
- **Realtime:** deleting rows triggers normal replication; large batches are still acceptable for nightly volume typical of mid-size ERP demos.
- **Changing the job:** `SELECT cron.unschedule('purge_inbox_data_180d');` then `cron.schedule(...)` with a new schedule or use the Dashboard cron UI if your project prefers it.

## Rescheduling or disabling

```sql
-- Disable (pg_cron present)
SELECT cron.unschedule('purge_inbox_data_180d');
```

Re-apply the schedule by running the `cron.schedule` stanza from migration `20260429170000_inbox_retention_cron_and_purge_optimize.sql`, or re-run migrations on a fresh database with `pg_cron` already enabled.
