import { expect, test, type Page } from '@playwright/test'

const WRITER_ID = '11111111-1111-1111-1111-111111111111'
const APPROVER_ID = '22222222-2222-2222-2222-222222222222'
const COOPERATOR_ID = '33333333-3333-3333-3333-333333333333'

async function mockApprovalDraftApis(page: Page) {
  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: WRITER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'approval-qa@example.com',
      }),
    })
  })

  await page.route('**/rest/v1/app_users*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: WRITER_ID,
          login_id: 'writer01',
          user_name: '기안자',
          employee_no: 'E-0001',
          dept_id: 1,
          role_name: 'staff',
          can_approval_participate: true,
        },
        {
          id: APPROVER_ID,
          login_id: 'approver01',
          user_name: '결재자A',
          employee_no: 'E-0002',
          dept_id: 2,
          role_name: 'staff',
          can_approval_participate: true,
        },
        {
          id: COOPERATOR_ID,
          login_id: 'cooperator01',
          user_name: '협조자B',
          employee_no: 'E-0003',
          dept_id: 3,
          role_name: 'staff',
          can_approval_participate: true,
        },
      ]),
    })
  })

  await page.route('**/rest/v1/departments*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, dept_name: '경영지원' },
        { id: 2, dept_name: '구매팀' },
        { id: 3, dept_name: '생산팀' },
      ]),
    })
  })
}

async function openApprovalNew(page: Page) {
  await mockApprovalDraftApis(page)
  await page.goto('/approvals/new')
  await expect(page.getByRole('heading', { name: '업무기안서' })).toBeVisible()
}

async function ensureTwoLineRows(page: Page) {
  const lineRows = page.locator('div[draggable="true"]')
  for (let i = 0; i < 3; i += 1) {
    const count = await lineRows.count()
    if (count >= 2) return lineRows
    await page.getByRole('button', { name: '+ 결재라인 추가' }).click()
    await page.waitForTimeout(150)
  }
  await expect(lineRows).toHaveCount(2)
  return lineRows
}

test('기안 페이지에서 결재라인 추가/역할 지정/DnD 재정렬이 동작한다', async ({ page }) => {
  await openApprovalNew(page)

  const lineRows = await ensureTwoLineRows(page)

  await lineRows.nth(0).locator('button', { hasText: '결재자 선택 (필수)' }).click()
  await page.getByRole('button', { name: /결재자A/ }).first().click()

  await lineRows.nth(1).locator('select').selectOption('cooperator')
  await expect(lineRows.nth(1).locator('select')).toHaveValue('cooperator')

  await lineRows
    .nth(1)
    .locator('span[title="드래그해서 순서를 변경하세요"]')
    .dragTo(lineRows.nth(0).locator('span[title="드래그해서 순서를 변경하세요"]'))

  await expect(lineRows.nth(0).locator('select')).toHaveValue('cooperator')
  await expect(lineRows.nth(1).locator('select')).toHaveValue('approver')
})

test('본문 입력 후 상신 클릭 시 작성 화면이 유지된다', async ({ page }) => {
  await openApprovalNew(page)

  await page.locator('input[name="draft_title"]').fill('모바일 결재 UI 점검')
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type('본문 테스트 내용입니다.')

  await page.getByRole('button', { name: '작성 후 상신' }).click()
  await expect(page).toHaveURL(/\/approvals\/new/)
})
