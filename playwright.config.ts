import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  webServer: {
    command: 'npx astro dev --port 4321 --host 0.0.0.0',
    port: 4321,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      ...process.env,
      RATE_LIMIT_LOGIN_MAX: '50',
    },
  },
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4321',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
});
