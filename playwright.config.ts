import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration. The suite assumes a running web app (npm run dev)
 * and a Supabase project whose migrations have been applied. Tests use isolated
 * accounts created on the fly; they never touch production data.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev --workspace @studyspace/web', url: 'http://localhost:5173', reuseExistingServer: true },
});
