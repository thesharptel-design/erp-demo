import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup-auth',
      testMatch: /.*\.auth\.setup\.ts/,
    },
    {
      name: 'mobile-chromium',
      testIgnore: /approvals-(advanced|attachments-and-permissions)\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
      },
    },
    {
      name: 'approvals-auth',
      testMatch: /approvals-(advanced|attachments-and-permissions)\.spec\.ts/,
      dependencies: ['setup-auth'],
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        storageState: 'playwright/.auth/approval-user.json',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
