import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const E2E_APPROVAL_EMAIL = 'e2e.approval.user@example.com'
const E2E_APPROVAL_PASSWORD = 'E2E-Approval-User-2026!'

async function ensureApprovalE2EUser() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? readEnvFromLocalFile('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvFromLocalFile('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase URL/service role key is required for E2E auth setup.')
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: E2E_APPROVAL_EMAIL,
      password: E2E_APPROVAL_PASSWORD,
      email_confirm: true,
      user_metadata: { name: 'E2E Approval User' },
    }),
  })

  if (response.ok) return
  if (response.status === 422 || response.status === 409) return

  const body = await response.text()
  throw new Error(`Failed to ensure E2E approval user. status=${response.status} body=${body}`)
}

function readEnvFromLocalFile(key: string): string | undefined {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const raw = readFileSync(envPath, 'utf-8')
    const line = raw
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${key}=`))
    if (!line) return undefined
    return line.slice(key.length + 1).trim()
  } catch {
    return undefined
  }
}

test('create authenticated storage state for approvals tests', async ({ page }) => {
  await ensureApprovalE2EUser()

  await page.goto('/login')
  await page.locator('input[placeholder="이메일 입력"]').fill(E2E_APPROVAL_EMAIL)
  await page.locator('input[placeholder="비밀번호"]').fill(E2E_APPROVAL_PASSWORD)
  await page.getByRole('button', { name: '로그인' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await page.context().storageState({ path: 'playwright/.auth/approval-user.json' })
})
