/**
 * Supabase `auth.users.id`와 `public.app_users.id`가 항상 동일하지 않은 환경(레거시·수동 계정)에서
 * 로그인 세션으로부터 실제 `app_users` 행의 id를 찾는다.
 */
export function resolveAppUserRowIdFromAuthSession<
  T extends { id: string; email?: string | null | undefined },
>(appUsers: readonly T[], auth: { id: string; email?: string | null | undefined }): string {
  const authId = String(auth.id ?? '').trim()
  if (authId && appUsers.some((u) => u.id === authId)) return authId
  const email = String(auth.email ?? '').trim().toLowerCase()
  if (email) {
    const row = appUsers.find((u) => String(u.email ?? '').trim().toLowerCase() === email)
    if (row) return row.id
  }
  return authId
}
