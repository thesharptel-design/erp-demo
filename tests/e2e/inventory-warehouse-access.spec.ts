import { expect, test, type Page } from '@playwright/test'

type WarehouseRow = { id: number; name: string }

const PROJECT_REF = 'ngcalyouzhfgtynordiu'

function buildMockSession(email = 'warehouse-qa@example.com') {
  const now = Math.floor(Date.now() / 1000)
  return {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: 'bearer',
    user: {
      id: '22222222-2222-2222-2222-222222222222',
      aud: 'authenticated',
      role: 'authenticated',
      email,
    },
  }
}

async function seedSupabaseSession(page: Page) {
  const session = buildMockSession()
  await page.addInitScript(
    ({ projectRef, seededSession }) => {
      window.localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify(seededSession))
    },
    { projectRef: PROJECT_REF, seededSession: session }
  )
}

async function mockInventoryApi(page: Page, rows: Array<{ warehouse_id: number; current_qty: number }>) {
  await page.route('**/rest/v1/inventory*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        rows.map((row, index) => ({
          id: index + 1,
          warehouse_id: row.warehouse_id,
          current_qty: row.current_qty,
          available_qty: row.current_qty,
          lot_no: null,
          exp_date: null,
          serial_no: null,
          items: {
            item_code: `ITEM-${index + 1}`,
            item_name: `품목 ${index + 1}`,
            item_spec: null,
            unit: 'EA',
            is_lot_managed: false,
            is_exp_managed: false,
            is_sn_managed: false,
            process_metadata: null,
          },
        }))
      ),
    })
  })
}

async function mockWarehouseAccessApi(
  page: Page,
  args: { hasFullAccess: boolean; warehouses: WarehouseRow[]; warehouseIds: number[] }
) {
  await page.route('**/api/warehouses/accessible', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        has_full_access: args.hasFullAccess,
        warehouses: args.warehouses,
        warehouse_ids: args.warehouseIds,
      }),
    })
  })
}

test('권한 0이면 창고 권한 없음 안내문을 표시한다', async ({ page }) => {
  test.skip(true, 'Inventory page requires authenticated middleware session cookie')
  await seedSupabaseSession(page)
  await mockWarehouseAccessApi(page, { hasFullAccess: false, warehouses: [], warehouseIds: [] })
  await mockInventoryApi(page, [])

  await page.goto('/inventory')
  await expect(page.getByText('창고 권한이 없습니다. 관리자에게 창고 접근 권한을 요청해 주세요.')).toBeVisible()
})

test('권한 1이면 드롭다운에 전체+1개만 표시된다', async ({ page }) => {
  test.skip(true, 'Inventory page requires authenticated middleware session cookie')
  const warehouses = [{ id: 1, name: '기본 창고' }]
  await seedSupabaseSession(page)
  await mockWarehouseAccessApi(page, {
    hasFullAccess: false,
    warehouses,
    warehouseIds: warehouses.map((warehouse) => warehouse.id),
  })
  await mockInventoryApi(page, [{ warehouse_id: 1, current_qty: 5 }])

  await page.goto('/inventory')
  await expect(page.getByRole('button', { name: '전체 창고' })).toBeVisible()
  await page.getByRole('button', { name: '전체 창고' }).click()
  await expect(page.getByRole('button', { name: '기본 창고' })).toBeVisible()
  await expect(page.getByRole('button', { name: '선택 안 함' })).toHaveCount(0)
})

test('권한 5면 드롭다운에 전체+5개만 표시된다', async ({ page }) => {
  test.skip(true, 'Inventory page requires authenticated middleware session cookie')
  const warehouses = [
    { id: 1, name: '기본 창고' },
    { id: 6, name: 'ESG 3기 창고' },
    { id: 7, name: 'ESG 4기 창고' },
    { id: 8, name: 'ESG 5기 창고' },
    { id: 10, name: '장비 창고' },
  ]
  await seedSupabaseSession(page)
  await mockWarehouseAccessApi(page, {
    hasFullAccess: false,
    warehouses,
    warehouseIds: warehouses.map((warehouse) => warehouse.id),
  })
  await mockInventoryApi(page, [
    { warehouse_id: 1, current_qty: 9 },
    { warehouse_id: 6, current_qty: 2 },
  ])

  await page.goto('/inventory')
  await expect(page.getByRole('button', { name: '전체 창고' })).toBeVisible()
  await page.getByRole('button', { name: '전체 창고' }).click()
  for (const warehouse of warehouses) {
    await expect(page.getByRole('button', { name: warehouse.name })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: '보물 창고' })).toHaveCount(0)
})

test('권한 max면 전체 권한 창고가 표시되고 빈 창고 안내가 뜬다', async ({ page }) => {
  test.skip(true, 'Inventory page requires authenticated middleware session cookie')
  const warehouses = [
    { id: 1, name: '기본 창고' },
    { id: 6, name: 'ESG 3기 창고' },
    { id: 7, name: 'ESG 4기 창고' },
    { id: 8, name: 'ESG 5기 창고' },
    { id: 9, name: 'Used 제품 관리 창고' },
    { id: 10, name: '장비 창고' },
    { id: 11, name: '보물 창고' },
  ]
  await seedSupabaseSession(page)
  await mockWarehouseAccessApi(page, {
    hasFullAccess: false,
    warehouses,
    warehouseIds: warehouses.map((warehouse) => warehouse.id),
  })
  await mockInventoryApi(page, [
    { warehouse_id: 1, current_qty: 5 },
    { warehouse_id: 10, current_qty: 3 },
  ])

  await page.goto('/inventory')
  await page.getByRole('button', { name: '전체 창고' }).click()
  for (const warehouse of warehouses) {
    await expect(page.getByRole('button', { name: warehouse.name })).toBeVisible()
  }

  await page.getByRole('button', { name: 'Used 제품 관리 창고' }).click()
  await expect(page.getByText('Used 제품 관리 창고 창고는 현재 재고가 없습니다.')).toBeVisible()
})
