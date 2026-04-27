import { expect, test, type Page } from '@playwright/test'

const EMAIL = 'qa-signup@example.com'

async function openSignupForm(page: Page) {
  await page.goto('/login')
  const signupSubmitButton = page.getByRole('button', { name: '등록 신청하기' })
  if ((await signupSubmitButton.count()) === 0) {
    await page.getByRole('button', { name: '신규 입사자 계정 생성 신청' }).click()
  }
  await expect(page.getByRole('button', { name: '등록 신청하기' })).toBeVisible()
}

async function fillSignupForm(page: Page, email: string) {
  await page.locator('input[placeholder="이메일"]').fill(email)
  await page.locator('input[placeholder="비밀번호"]').fill('Password!123')
  await page.locator('input[placeholder="비밀번호 확인"]').fill('Password!123')
  await page.locator('input[placeholder="성함 \\(예: 홍길동\\)"]').fill('하영민')
  await page.locator('input[placeholder="연락처 \\(예: 010-1234-5678\\)"]').fill('010-1234-5678')

  await page.getByRole('button', { name: '부서 선택' }).click()
  await page.getByPlaceholder('부서 선택').fill('개발')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: '직급 선택' }).click()
  await page.getByPlaceholder('직급 선택').fill('사원')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: '(보기)' }).click()
  const privacyPanel = page.locator('.custom-scrollbar')
  await privacyPanel.evaluate((el) => {
    el.scrollTop = el.scrollHeight
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  })

  await page.getByLabel('개인정보 처리방침에 동의합니다.').click()
}

test('중복 이메일 메시지를 사용자 친화 문구로 표시한다', async ({ page }) => {
  await openSignupForm(page)

  await page.route('**/auth/v1/signup', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'User already registered',
        msg: 'User already registered',
        message: 'User already registered',
      }),
    })
  })

  await fillSignupForm(page, EMAIL)
  await page.getByRole('button', { name: '등록 신청하기' }).click()

  await expect(page.getByText('이미 신청/가입된 이메일입니다. 비밀번호 찾기 또는 관리자에게 문의하세요.')).toBeVisible()
})

test('가입 버튼 더블탭 시 프로필 저장은 한 번만 처리된다', async ({ page }) => {
  await openSignupForm(page)

  let signupPostCallCount = 0
  let profileCallCount = 0

  page.on('dialog', async (dialog) => {
    await dialog.accept()
  })

  await page.route('**/auth/v1/signup', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    signupPostCallCount += 1
    await page.waitForTimeout(800)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: '11111111-1111-1111-1111-111111111111',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'qa-single-submit@example.com',
        },
      }),
    })
  })

  await page.route('**/api/auth/register-profile', async (route) => {
    profileCallCount += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })

  await page.route('**/auth/v1/logout', async (route) => {
    await route.fulfill({
      status: 204,
      body: '',
    })
  })

  await fillSignupForm(page, 'qa-single-submit@example.com')

  const submitButton = page.getByRole('button', { name: '등록 신청하기' })
  await submitButton.dblclick()

  await expect
    .poll(() => ({ signupPostCallCount, profileCallCount }), {
      timeout: 10_000,
      message: 'double tap should not duplicate profile save',
    })
    .toEqual({ signupPostCallCount: 1, profileCallCount: 1 })
})
