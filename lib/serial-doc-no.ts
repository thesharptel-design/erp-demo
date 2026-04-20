import type { SupabaseClient } from '@supabase/supabase-js'

export function yyMMDD(d = new Date()) {
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/** 예: `code`가 `PO`이면 `PO-260410-` */
export function serialPrefix(code: string, d = new Date()) {
  return `${code}-${yyMMDD(d)}-`
}

type SerialFilter = { type: 'eq' | 'neq'; column: string; value: string }

/**
 * `CODE-YYMMDD-0001` 형식의 다음 일련번호.
 * 해당 테이블·컬럼에서 당일 접두와 일치하는 값만 보고 max+1.
 */
async function computeNextFromMax(
  client: SupabaseClient,
  options: {
    table: string
    column: string
    code: string
    pad?: number
    date?: Date
    filters?: SerialFilter[]
  }
): Promise<string> {
  const prefix = serialPrefix(options.code, options.date ?? new Date())
  const pad = options.pad ?? 4

  let q = client.from(options.table).select(options.column).like(options.column, `${prefix}%`)
  for (const f of options.filters ?? []) {
    if (f.type === 'eq') q = q.eq(f.column, f.value)
    else q = q.neq(f.column, f.value)
  }

  const { data, error } = await q.order(options.column, { ascending: false }).limit(1)

  if (error) throw new Error(error.message)

  let next = 1
  const col = options.column
  const row = data?.[0] as unknown as Record<string, string> | undefined
  if (row?.[col]) {
    const raw = String(row[col])
    const tail = raw.split('-').pop() ?? ''
    const n = parseInt(tail, 10)
    if (!Number.isNaN(n)) next = n + 1
  }

  return `${prefix}${String(next).padStart(pad, '0')}`
}

/**
 * 다음 일련번호. DB 유니크 충돌(동시 생성) 시 짧게 재조회·재계산합니다.
 * `maxAttempts`만큼 시도 후에도 충돌이면 마지막 후보를 반환합니다(삽입은 호출부에서 재시도 권장).
 */
export async function generateNextSerialDocNo(
  client: SupabaseClient,
  options: {
    table: string
    column: string
    code: string
    pad?: number
    date?: Date
    filters?: SerialFilter[]
    /** 기본 8. 각 시도마다 max+1을 다시 읽습니다. */
    maxAttempts?: number
  }
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? 8
  let candidate = await computeNextFromMax(client, options)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { count, error } = await client
      .from(options.table)
      .select(options.column, { count: 'exact', head: true })
      .eq(options.column, candidate)
    if (error) throw new Error(error.message)
    if (!count) return candidate
    await new Promise((r) => setTimeout(r, 25 * (attempt + 1)))
    candidate = await computeNextFromMax(client, options)
  }

  return candidate
}
