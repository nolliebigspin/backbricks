import { defineConfig, devices } from '@playwright/test';

// Runs on Node (mise) against the real server role serving the built dashboard
// (`bun run build` first). Needs the compose Postgres: `mise run infra`.
const port = Number(process.env['E2E_PORT'] ?? 3300);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: '.',
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, locale: 'en-US', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun --no-env-file apps/server/src/main.ts serve',
    cwd: '..',
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
    env: {
      PORT: String(port),
      DATABASE_URL:
        process.env['TEST_DATABASE_URL'] ??
        'postgres://backbricks:backbricks@localhost:5432/backbricks',
      APP_SECRET: 'e2e-secret-e2e-secret-e2e-secret-000000',
      BACKBRICKS_MODULES: 'forms',
      LOG_LEVEL: 'warn',
    },
  },
});
