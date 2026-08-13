import { test, expect } from "bun:test"

// Mounted-route smoke tests against the real `server/app.ts` graph (rate
// limit + SSE middleware + trips router), so a missing POST /chat or
// GET /places-catalog cannot 404 behind the SPA fallback the way a
// router-only unit test would miss.

async function loadApp() {
  process.env.KLUSTER_API_KEY ||= "load-test-stub"
  process.env.KLUSTER_API_BASE_URL ||= "https://example.invalid"
  process.env.IG_WORKER_ENABLED ||= "false"
  const mod = await import("../app")
  return mod.default
}

test("POST /api/trips/:id/chat is mounted — unauthenticated is 401, not 404", async () => {
  const app = await loadApp()
  const res = await app.request("/api/trips/korea-2026/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "hi" }),
  })
  expect(res.status).toBe(401)
})

test("GET /api/trips/places-catalog is mounted — unauthenticated is 401, not 404", async () => {
  const app = await loadApp()
  const res = await app.request("/api/trips/places-catalog")
  expect(res.status).toBe(401)
})
