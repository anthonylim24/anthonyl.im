import { afterEach, describe, expect, it, vi } from "vitest"
import { apiFetch, apiUrl } from "../apiBase"

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns the path unchanged without VITE_API_BASE", () => {
    vi.stubEnv("VITE_API_BASE", "")
    expect(apiUrl("/api/korea/chat")).toBe("/api/korea/chat")
  })

  it("prefixes preview API mounts and is idempotent", () => {
    vi.stubEnv("VITE_API_BASE", "/preview/pr/12/")
    expect(apiUrl("/api/korea/chat")).toBe("/preview/pr/12/api/korea/chat")
    expect(apiUrl("/preview/pr/12/api/korea/chat")).toBe("/preview/pr/12/api/korea/chat")
  })
})

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("does not fall back to production /api when the preview proxy is missing", async () => {
    vi.stubEnv("VITE_API_BASE", "/preview/pr/12")
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
    )

    const res = await apiFetch("/api/korea/chat", { method: "POST" })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toBe("/preview/pr/12/api/korea/chat")
    expect(res.status).toBe(404)
  })

  it("calls the rewritten preview path once", async () => {
    vi.stubEnv("VITE_API_BASE", "/preview/pr/12")
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("sse", { status: 200 }),
    )

    const res = await apiFetch("/api/korea/chat")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toBe("/preview/pr/12/api/korea/chat")
    expect(await res.text()).toBe("sse")
  })

  it("does not follow a sidecar redirect off the preview API mount", async () => {
    vi.stubEnv("VITE_API_BASE", "/preview/pr/12")
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "/api/korea" } }),
    )

    const res = await apiFetch("/api/korea")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toBe("/preview/pr/12/api/korea")
    expect(spy.mock.calls[0]![1]).toMatchObject({ redirect: "manual" })
    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("/api/korea")
  })
})
