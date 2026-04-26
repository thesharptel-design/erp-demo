/** 쪽지 패널 상단 탭: 발송 / 받은함 / 보낸함 */
export type MessagePanelTab = 'compose' | 'inbox' | 'sent'

export type SentMessageRow = {
  message_id: string
  thread_id: string | null
  subject: string
  body: string
  kind: string
  created_at: string
  recipient_total: number
  recipient_read: number
  /** kind=direct 일 때 수신자 표시용 (보낸함 UI) */
  primary_recipient_name: string | null
  primary_recipient_employee_no: string | null
  /** kind=direct 일 때 1:1 스레드 진입용 수신자 `app_users.id` */
  primary_recipient_user_id: string | null
}

export type MessageRecipientPreview = {
  id: string
  user_id: string
  read_at: string | null
  app_users: { user_name: string | null; employee_no: string | null } | null
}

export type MessageInboxRow = {
  id: string
  message_id: string
  user_id: string
  read_at: string | null
  archived_at: string | null
  created_at: string
  private_messages: {
    id: string
    thread_id: string | null
    /** 발신자 `app_users.id` — 받은함 답장 수신자 프리필용 */
    sender_id: string | null
    subject: string
    body: string
    kind: string
    created_at: string
    app_users: { user_name: string | null; employee_no: string | null } | null
  } | null
}

/** 받은함 표시용: direct는 상대별 1행으로 그룹, broadcast는 기존처럼 개별 행 */
export type MessageInboxThreadRow = {
  thread_key: string
  kind: 'direct' | 'broadcast'
  thread_id: string | null
  counterpart_user_id: string | null
  counterpart_name: string | null
  counterpart_employee_no: string | null
  latest_recipient_id: string
  latest_message_id: string
  latest_subject: string
  latest_body: string
  latest_created_at: string
  unread_count: number
}

export type NotificationInboxRow = {
  id: string
  user_id: string
  event_id: string
  read_at: string | null
  archived_at: string | null
  created_at: string
  notification_events: {
    id: string
    title: string
    target_url: string | null
    category: string
    type: string
    created_at: string
    /** 게시판 댓글 알림 등 JSON (Supabase jsonb) */
    payload?: Record<string, unknown> | null
    app_users: { user_name: string | null } | null
  } | null
}
