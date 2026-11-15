import { expect, test } from "bun:test"
import { existsSync } from "fs"
import { resolve } from "path"

// The real `server/app.ts` graph: headers, retired routes, the metrics gate.

async function loadApp() {
  process.env.IG_WORKER_ENABLED ||= "false"
  return (await import("../app")).default
}

const built = existsSync(resolve(import.meta.dir, "../../frontend/dist/index.html"))

/** A stand-in for the Bun server `Bun.serve` passes as the env. */
const peer = (address: string) => ({ requestIP: () => ({ address, family: "IPv4", port: 50000 }) })

test("every response carries the security headers", async () => {
  const app = await loadApp()
  const res = await app.request("/health")
  expect(res.status).toBe(200)
  expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000")
  expect(res.headers.get("x-content-type-options")).toBe("nosniff")
  expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin")
  expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'self'")
  // Hono defaults that would break Clerk's popup or cross-origin images stay off.
  expect(res.headers.get("cross-origin-opener-policy")).toBeNull()
  expect(res.headers.get("cross-origin-resource-policy")).toBeNull()
})

test("a PR preview keeps its own no-referrer policy", async () => {
  const app = await loadApp()
  const res = await app.request("/preview/nope")
  expect(res.headers.get("referrer-policy")).toBe("no-referrer")
  expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'self'")
})

test("the retired Korea and entity endpoints are JSON 404s, not the SPA shell", async () => {
  const app = await loadApp()
  for (const [method, path] of [
    ["GET", "/api/korea"],
    ["GET", "/api/korea/reservations"],
    ["GET", "/api/korea/days"],
    ["GET", "/api/korea/day/1"],
    ["GET", "/api/korea/day/1/places"],
    ["GET", "/api/korea/dongs"],
    ["GET", "/api/korea/entities"],
    ["POST", "/api/korea/chat"],
    ["POST", "/api/entity/about"],
    ["GET", "/api/entity/about/_stats"],
  ] as const) {
    const res = await app.request(path, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? "{}" : undefined })
    expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 404`)
    expect(res.headers.get("content-type")).toContain("application/json")
  }
})

test("/health stays public; /health/metrics needs a local shell or the token", async () => {
  const app = await loadApp()
  expect((await app.request("/health")).status).toBe(200)

  // Through Cloudflare (or no socket at all): refused.
  expect((await app.request("/health/metrics")).status).toBe(403)
  expect(
    (await app.request("/health/metrics", { headers: { "cf-connecting-ip": "203.0.113.1" } }, peer("127.0.0.1"))).status,
  ).toBe(403)
  // nginx connects from loopback too, but carries Cloudflare's headers.
  expect(
    (await app.request("/health/metrics", { headers: { "x-forwarded-for": "203.0.113.1" } }, peer("127.0.0.1"))).status,
  ).toBe(403)
  expect((await app.request("/health/metrics", {}, peer("203.0.113.9"))).status).toBe(403)

  // curl on the droplet.
  const local = await app.request("/health/metrics", {}, peer("127.0.0.1"))
  expect(local.status).toBe(200)
  expect(local.headers.get("cache-control")).toBe("no-store")
  expect(await local.json()).toHaveProperty("requests")
})

test.skipIf(!built)("$-patterns in the path are not expanded into the shell", async () => {
  const app = await loadApp()
  const res = await app.request("/trips/$&$'x")
  const html = await res.text()
  expect(res.status).toBe(200)
  expect(html.match(/<\/head>/g)?.length).toBe(1)
  expect(html).toContain("/trips/$&amp;$&#39;x")
})
