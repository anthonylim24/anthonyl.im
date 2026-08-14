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

test("preview API mounts Korea chat (503 without a key, not 404)", async () => {
  const previous = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    const app = createPreviewApiApp()
    const res = await app.request("/api/korea/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hi" }),
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("gemini_not_configured")
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previous
  }
})
