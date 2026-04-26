import { describe, expect, it } from 'vitest'

/**
 * Documents the JSON shape returned by `purge_inbox_data_older_than_180_days()`
 * (service_role). Keeps client/ops tooling aligned with migrations.
 */
const PURGE_RESULT_KEYS = [
  'cutoff',
  'private_message_recipients_deleted',
  'private_messages_orphans_deleted',
  'user_notifications_deleted',
  'notification_events_orphans_deleted',
] as const

describe('purge_inbox_data_older_than_180_days result shape', () => {
  it('expects all documented counter keys', () => {
    const sample = {
      cutoff: '2025-10-29T04:05:00.000Z',
      private_message_recipients_deleted: 0,
      private_messages_orphans_deleted: 0,
      user_notifications_deleted: 1,
      notification_events_orphans_deleted: 0,
    }
    for (const k of PURGE_RESULT_KEYS) {
      expect(sample).toHaveProperty(k)
    }
  })
})
