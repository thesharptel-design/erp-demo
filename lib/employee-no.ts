import type { SupabaseClient } from '@supabase/supabase-js'

type SupabaseLike = SupabaseClient

export async function generateEmployeeNoWithRetry(client: SupabaseLike, maxAttempts = 8) {
  let lastCandidate = ''

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await client.rpc('next_employee_no')
    if (error) throw new Error(error.message)

    const candidate = String(data ?? '')
    if (!candidate) throw new Error('사번 생성 실패: 빈 값이 반환되었습니다.')
    lastCandidate = candidate

    const { count, error: countError } = await client
      .from('app_users')
      .select('id', { count: 'exact', head: true })
      .eq('employee_no', candidate)

    if (countError) throw new Error(countError.message)
    if (!count) return candidate

    await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
  }

  if (!lastCandidate) {
    throw new Error('사번 생성 실패: 재시도 횟수를 초과했습니다.')
  }
  return lastCandidate
}
