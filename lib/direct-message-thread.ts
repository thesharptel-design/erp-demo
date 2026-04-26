import type { SupabaseClient } from '@supabase/supabase-js'

export type DirectThreadRow = {
  message_id: string
  direction: 'in' | 'out'
  created_at: string
  subject: string
  body: string
  inbound_recipient_id: string | null
  my_read_at: string | null
  peer_read_at: string | null
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

export async function fetchDirectMessageThread(
  supabase: RpcClient,
  threadId: string,
  limit = 120
): Promise<{ ok: true; rows: DirectThreadRow[] } | { ok: false; message: string }> {
  const tid = String(threadId ?? '').trim()
  if (!tid) {
    return { ok: false, message: '스레드가 없습니다.' }
  }
  const { data, error } = await supabase.rpc('list_direct_message_thread', {
    p_thread_id: tid,
    p_limit: limit,
  })
  if (error) {
    return { ok: false, message: error.message }
  }
  const raw = (data as Record<string, unknown>[]) ?? []
  const rows: DirectThreadRow[] = raw.map((r) => ({
    message_id: String(r.message_id ?? ''),
    direction: r.direction === 'out' ? 'out' : 'in',
    created_at: String(r.created_at ?? ''),
    subject: String(r.subject ?? ''),
    body: String(r.body ?? ''),
    inbound_recipient_id: r.inbound_recipient_id == null ? null : String(r.inbound_recipient_id),
    my_read_at: r.my_read_at == null ? null : String(r.my_read_at),
    peer_read_at: r.peer_read_at == null ? null : String(r.peer_read_at),
  }))
  return { ok: true, rows }
}
