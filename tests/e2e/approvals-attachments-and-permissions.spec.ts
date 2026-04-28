import { expect, test, type Page } from '@playwright/test'

const WRITER_ID = '11111111-1111-1111-1111-111111111111'
const APPROVER_ID = '22222222-2222-2222-2222-222222222222'

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
      ]),
    })
  })
}

test('기안완료 문서 첨부 선택 목록에 approved 문서만 노출된다', async ({ page }) => {
  await mockApprovalDraftApis(page)

  await page.route('**/rest/v1/approval_docs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 101,
          doc_no: 'APP-101',
          title: '최종승인 문서',
          doc_type: 'draft_doc',
          status: 'approved',
          writer_id: WRITER_ID,
        },
      ]),
    })
  })

  await page.goto('/approvals/new')
  await expect(page.getByRole('heading', { name: '업무기안서' })).toBeVisible()

  const select = page.locator('select').filter({
    has: page.locator('option', { hasText: '첨부할 결재문서 선택 (최종결재완료 기안문서)' }),
  })
  await expect(select).toHaveCount(1)
  await expect(select.locator('option', { hasText: 'APP-101 · 최종승인 문서' })).toHaveCount(1)
})

test('결재권자 라인 지정 후 상신 버튼 클릭 시 작성 화면에 머무른다', async ({ page }) => {
  await mockApprovalDraftApis(page)
  await page.route('**/rest/v1/approval_docs*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  await page.goto('/approvals/new')
  await expect(page.getByRole('heading', { name: '업무기안서' })).toBeVisible()

  await page.locator('input[name="draft_title"]').fill('결재권자 상신 가능 시나리오')
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.type('결재 본문입니다.')

  await page.getByRole('button', { name: '결재자 선택 (필수)' }).click()
  await page.getByRole('button', { name: /결재자A/ }).first().click()

  await page.getByRole('button', { name: '작성 후 상신' }).click()
  await expect(page).toHaveURL(/\/approvals\/new/)
})
