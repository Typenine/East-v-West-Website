import { defineConfig, devices } from '@playwright/test';

/**
 * East v. West Draft System — Playwright E2E Config
 *
 * Prerequisites to run:
 *   1. DATABASE_URL set to a Neon PostgreSQL connection string with draft tables
 *   2. ADMIN_SECRET set (matches the admin cookie value in .env.local)
 *   3. A running dev server: `npm run dev` in a separate terminal (or use webServer below)
 *   4. Playwright browsers installed: `npx playwright install chromium`
 *
 * Run command:
 *   npx playwright test tests/e2e/
 *
 * Run specific test:
 *   npx playwright test tests/e2e/draft-rehearsal.spec.ts --headed
 *
 * Run with trace for debugging:
 *   npx playwright test tests/e2e/ --trace on
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // draft tests share a single DB draft — must run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Uncomment to auto-start the dev server before tests:
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 60_000,
  // },
});
