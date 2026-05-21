import { defineConfig, devices } from '@playwright/test'

// Two boot modes:
//   1. Default — Playwright owns the lifecycle of both the Hono backend
//      (:3000) and the Vite frontend (:5173). Hermetic; what CI and the
//      cloud env use.
//   2. E2E_BASE_URL set — point at an already-running stack (e.g. when
//      iterating locally with `.codex/dev.sh` in another terminal).
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 5173)
const BACKEND_PORT = Number(process.env.PORT ?? 3000)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          // Hono backend. `bun start` runs server/app.ts which reads PORT.
          // The env stubs match .codex/dev.sh so config.ts's required-env
          // check passes without touching real secrets.
          command: 'bun start',
          cwd: '..',
          url: `http://localhost:${BACKEND_PORT}/health`,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            KLUSTER_API_KEY: 'codex-stub',
            KLUSTER_API_BASE_URL: 'https://example.invalid',
            IG_WORKER_ENABLED: 'false',
            IG_DEV_BEARER: 'codex-dev-bearer',
            IG_DEV_USER_ID: 'codex-dev',
            PORT: String(BACKEND_PORT),
            CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
            SITE_URL: `http://localhost:${BACKEND_PORT}`,
          },
        },
        {
          // Vite frontend. --host 127.0.0.1 keeps it bound to loopback;
          // the cloud env uses --host 0.0.0.0 for `dev.sh` but for E2E we
          // don't need that.
          command: `bun run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
          url: BASE_URL,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
})
