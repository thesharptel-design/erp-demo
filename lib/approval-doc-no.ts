import type { SupabaseClient } from '@supabase/supabase-js'
import { hhmm, serialPrefix, yyMMDD } from '@/lib/serial-doc-no'

export const appDocNoPrefix = (d?: Date) => serialPrefix('APP', d)
export const droDocNoPrefix = (d?: Date) => serialPrefix('DRO', d)

/**
 * 일반 기안 등 문서번호: `APP-YYMMDD-HHMM` (예: APP-260422-1430).
 * 같은 분 안에 이미 있으면 `APP-260422-1430-2`, `-3` … 처럼 뒤에 일련 접미를 붙여 유일하게 만듭니다.
 * 출고요청(`outbound_request`) 행은 집계에서 제외합니다.
 */
export async function generateNextAppDocNo(client: SupabaseClient): Promise<string> {
  const now = new Date()
  const head = `APP-${yyMMDD(now)}-${hhmm(now)}`

  const exists = async (docNo: string) => {
    const { count, error } = await client
      .from('approval_docs')
      .select('id', { count: 'exact', head: true })
      .eq('doc_no', docNo)
      .neq('doc_type', 'outbound_request')
    if (error) throw new Error(error.message)
    return (count ?? 0) > 0
  }

  for (let n = 0; n < 200; n++) {
    const candidate = n === 0 ? head : `${head}-${n + 1}`
    if (!(await exists(candidate))) return candidate
  }

  return `${head}-${Date.now().toString(36).slice(-4).toUpperCase()}`
}

/**
 * 출고요청 문서번호: `DRO-YYMMDD-HHMM` (일반기안 `APP-…`와 동일 길이·규칙).
 * `approval_docs.doc_no` 전역 유일을 기준으로 충돌 시 `-2`, `-3` 접미.
 */
export async function generateNextDroDocNo(client: SupabaseClient): Promise<string> {
  const now = new Date()
  const head = `DRO-${yyMMDD(now)}-${hhmm(now)}`

  const exists = async (docNo: string) => {
    const { count, error } = await client
      .from('approval_docs')
      .select('id', { count: 'exact', head: true })
      .eq('doc_no', docNo)
    if (error) throw new Error(error.message)
    return (count ?? 0) > 0
  }

  for (let n = 0; n < 200; n++) {
    const candidate = n === 0 ? head : `${head}-${n + 1}`
    if (!(await exists(candidate))) return candidate
  }

  return `${head}-${Date.now().toString(36).slice(-4).toUpperCase()}`
}
