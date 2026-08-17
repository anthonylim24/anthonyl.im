import { test, expect } from '@playwright/test'

// Smoke suite — proves the full stack boots, the SPA renders, the public
// routes don't throw, and the backend responds. Deliberately doesn't lean
// on specific copy or DOM structure so it stays green through design
// iteration.

test('backend /health responds', async ({ request }) => {
  // BACKEND_PORT default matches frontend/playwright.config.ts.
  const port = Number(process.env.PORT ?? 3000)
  const res = await request.get(`http://localhost:${port}/health`)
  expect(res.status()).toBeLessThan(500)
})

test('chatbot home renders without page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  const response = await page.goto('/')
  expect(response?.status(), '/ should not 5xx').toBeLessThan(500)
  await expect(page).toHaveTitle(/.+/)
  expect(errors, 'no uncaught page errors').toEqual([])
})

test('breathwork home renders without page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  const response = await page.goto('/breathwork')
  expect(response?.status(), '/breathwork should not 5xx').toBeLessThan(500)
  await expect(page).toHaveTitle(/.+/)
  expect(errors, 'no uncaught page errors').toEqual([])
})

test('trips skips the Clerk sign-in wall under VITE_DEV_BEARER', async ({ page }) => {
  const targetingRemotePreview =
    typeof process.env.E2E_BASE_URL === 'string' &&
    /\/preview\/pr\//.test(process.env.E2E_BASE_URL)
  test.skip(
    targetingRemotePreview && !process.env.VITE_DEV_BEARER,
    'Remote previews are Clerk-gated; this Playwright runner still needs VITE_DEV_BEARER or a storageState. clerk-agent-login.ts signs in the agent Chrome, not this test.',
  )

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  for (const path of ['/trips', '/trips/korea-2026'] as const) {
    const response = await page.goto(path)
    expect(response?.status(), `${path} should not 5xx`).toBeLessThan(500)
    await expect(page).toHaveTitle(/.+/)
    await expect(page.getByRole('button', { name: /sign in to continue/i })).toHaveCount(0)
  }
  expect(errors, 'no uncaught page errors').toEqual([])
})

test('legacy /korea redirects to the korea-2026 trip', async ({ page }) => {
  const targetingRemotePreview =
    typeof process.env.E2E_BASE_URL === 'string' &&
    /\/preview\/pr\//.test(process.env.E2E_BASE_URL)
  test.skip(
    targetingRemotePreview && !process.env.VITE_DEV_BEARER,
    'Remote previews are Clerk-gated; this Playwright runner still needs VITE_DEV_BEARER or a storageState. clerk-agent-login.ts signs in the agent Chrome, not this test.',
  )

  const response = await page.goto('/korea')
  expect(response?.status(), '/korea should not 5xx').toBeLessThan(500)
  await expect(page).toHaveURL(/\/trips\/korea-2026/)
})
