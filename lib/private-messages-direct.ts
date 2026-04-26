import type { SupabaseClient } from '@supabase/supabase-js'

/** Strip characters that break PostgREST `ilike` patterns or widen matches unintentionally. */
export function sanitizeMessageRecipientSearchQuery(q: string): string {
  return q.trim().replace(/[%_\\]/g, '').slice(0, 48)
}

export type MessageRecipientPick = {
  id: string
  user_name: string | null
  employee_no: string | null
}

export async function searchMessageRecipientCandidates(
  supabase: Pick<SupabaseClient, 'from'>,
  rawQuery: string,
  options: { excludeUserId: string; limit?: number }
): Promise<{ ok: true; rows: MessageRecipientPick[] } | { ok: false; message: string }> {
  const s = sanitizeMessageRecipientSearchQuery(rawQuery)
  if (s.length < 1) {
    return { ok: true, rows: [] }
  }
  const pat = `%${s}%`
  const lim = Math.min(40, Math.max(1, options.limit ?? 15))
  const ex = options.excludeUserId

  const [byName, byNo] = await Promise.all([
    supabase
      .from('app_users')
      .select('id,user_name,employee_no')
      .neq('id', ex)
      .ilike('user_name', pat)
      .order('user_name', { ascending: true })
      .limit(lim),
    supabase
      .from('app_users')
      .select('id,user_name,employee_no')
      .neq('id', ex)
      .ilike('employee_no', pat)
      .order('user_name', { ascending: true })
      .limit(lim),
  ])

  const err = byName.error ?? byNo.error
  if (err) {
    return { ok: false, message: err.message }
  }

  const map = new Map<string, MessageRecipientPick>()
  for (const row of [...(byName.data ?? []), ...(byNo.data ?? [])]) {
    const r = row as MessageRecipientPick
    map.set(String(r.id), {
      id: String(r.id),
      user_name: r.user_name ?? null,
      employee_no: r.employee_no ?? null,
    })
  }
  const merged = [...map.values()].sort((a, b) => {
    const an = (a.user_name ?? '').localeCompare(b.user_name ?? '', 'ko')
    if (an !== 0) return an
    return a.id.localeCompare(b.id)
  })
  return { ok: true, rows: merged.slice(0, lim) }
}

export async function sendDirectPrivateMessage(
  supabase: Pick<SupabaseClient, 'from'>,
  args: { senderId: string; recipientUserId: string; subject: string; body: string; threadId?: string; startNewThread?: boolean }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const subject = args.subject.trim()
  const body = args.body.trim()
  if (!subject) {
    return { ok: false, message: '제목을 입력하세요.' }
  }
  if (!body) {
    return { ok: false, message: '내용을 입력하세요.' }
  }
  if (args.recipientUserId === args.senderId) {
    return { ok: false, message: '본인에게는 쪽지를 보낼 수 없습니다.' }
  }

  const normalizedThreadId = (() => {
    const t = args.threadId?.trim()
    return t && t.length > 0 ? t : null
  })()
  const nextThreadId = normalizedThreadId ?? (args.startNewThread === true ? crypto.randomUUID() : null)
  if (!nextThreadId) {
    return { ok: false, message: '스레드 정보가 없습니다. 새 쪽지로 시작하거나 기존 대화에서 답장하세요.' }
  }

  const { data: msg, error: insMsgErr } = await supabase
    .from('private_messages')
    .insert({
      sender_id: args.senderId,
      thread_id: nextThreadId,
      subject,
      body,
      kind: 'direct',
    })
    .select('id')
    .single()

  if (insMsgErr || !msg?.id) {
    return { ok: false, message: insMsgErr?.message ?? '쪽지 저장에 실패했습니다.' }
  }

  const messageId = String((msg as { id: string }).id)
  const { error: insRecErr } = await supabase.from('private_message_recipients').insert({
    message_id: messageId,
    user_id: args.recipientUserId,
  })

  if (insRecErr) {
    await supabase.from('private_messages').delete().eq('id', messageId)
    return { ok: false, message: insRecErr.message }
  }

  return { ok: true }
}
