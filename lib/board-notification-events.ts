/**
 * Dedupe keys for board-triggered notification_events (must match SECURITY DEFINER triggers).
 * @see supabase/migrations/20260429130000_board_comments_notification_fanout.sql
 */
export function boardCommentNotificationDedupeKey(commentId: number) {
  return `board:comment:${commentId}`
}
