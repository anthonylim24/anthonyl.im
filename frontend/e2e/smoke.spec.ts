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
