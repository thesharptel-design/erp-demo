import type { SupabaseClient } from '@supabase/supabase-js'

/** 결재·승인 등 의견 미입력 시 이력·표시용 placeholder */
export const APPROVAL_HISTORY_COMMENT_EMPTY = '[-]'

/** 승인 등 선택 의견: 비우면 `[-]` */
export function normalizeOptionalOpinionForHistory(input: string | null | undefined): string {
  const t = input == null ? '' : String(input).trim()
  return t === '' ? APPROVAL_HISTORY_COMMENT_EMPTY : t
}

export async function logApprovalHistory(
  supabase: Pick<SupabaseClient, 'from'>,
  row: {
    approval_doc_id: number
    actor_id: string
    action_type: string
    /** null/undefined이면 `[-]`로 저장 */
    action_comment?: string | null
    action_at?: string
    /** 재시도/중복 호출 방지용. 동일 문서에서 dedupe_key 중복이면 무시(성공 처리). */
    dedupe_key?: string | null
  }
): Promise<void> {
  const action_at = row.action_at ?? new Date().toISOString()
  const action_comment =
    row.action_comment === undefined || row.action_comment === null
      ? APPROVAL_HISTORY_COMMENT_EMPTY
      : normalizeOptionalOpinionForHistory(row.action_comment)

  const { error } = await supabase.from('approval_histories').insert({
    approval_doc_id: row.approval_doc_id,
    actor_id: row.actor_id,
    action_type: row.action_type,
    action_comment,
    action_at,
    dedupe_key: row.dedupe_key ?? null,
  })
  if (error) {
    const code = (error as { code?: string } | null | undefined)?.code
    // dedupe unique 충돌은 "이미 처리됨"으로 간주하여 무시
    if (code === '23505' && row.dedupe_key) return
    const m = typeof error.message === 'string' ? error.message.trim() : ''
    if (m) throw new Error(m)
    throw new Error('처리 이력 저장에 실패했습니다.')
  }
}
