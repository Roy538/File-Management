import { defineConfig } from '@playwright/test';

/**
 * End-to-end journeys against a running stack (Vite dev server + Spring Boot API + MySQL + MinIO).
 * Uses the installed Google Chrome (`channel: 'chrome'`) so no browser download is needed.
 * Each journey that changes data creates its own records through the API, so runs are repeatable.
 *
 *   E2E_BASE_URL   default http://localhost:5174
 *   E2E_ORG / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD   default: the dev seed (MC, admin@manageedocs.local)
 *   E2E_DEMO_PASSWORD  password of the demo users created by scripts/seed-demo.py
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1366, height: 860 },
  },
});
