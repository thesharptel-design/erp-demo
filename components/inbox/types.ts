/** 쪽지 패널 상단 탭: 발송 / 받은함 / 보낸함 */
export type MessagePanelTab = 'compose' | 'inbox' | 'sent'

export type SentMessageRow = {
  message_id: string
  subject: string
  body: string
  kind: string
  created_at: string
  recipient_total: number
  recipient_read: number
  /** kind=direct 일 때 수신자 표시용 (보낸함 UI) */
  primary_recipient_name: string | null
  primary_recipient_employee_no: string | null
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
    subject: string
    body: string
    kind: string
    created_at: string
    app_users: { user_name: string | null; employee_no: string | null } | null
  } | null
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
    app_users: { user_name: string | null } | null
  } | null
}
