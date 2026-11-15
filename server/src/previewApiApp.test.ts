import { expect, test } from "bun:test"
import { createPreviewApiApp } from "./previewApiApp"

test("preview API app exposes health and does not serve SPA HTML", async () => {
  const app = createPreviewApiApp()
  const health = await app.request("/health")
  expect(health.status).toBe(200)
  const body = (await health.json()) as { status: string; previewApi: boolean }
  expect(body.status).toBe("ok")
  expect(body.previewApi).toBe(true)

  const missing = await app.request("/trips")
  expect(missing.status).toBe(404)
})
