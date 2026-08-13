import { afterEach, describe, expect, it, vi } from "vitest"
import { apiFetch, apiUrl, PREVIEW_API_HEADER } from "../apiBase"

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

  it("falls back to production /api when the preview proxy is not mounted", async () => {
    vi.stubEnv("VITE_API_BASE", "/preview/pr/12")
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "not_found" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const res = await apiFetch("/api/korea/chat", { method: "POST" })
    expect(spy.mock.calls[0]![0]).toBe("/preview/pr/12/api/korea/chat")
    expect(spy.mock.calls[1]![0]).toBe("/api/korea/chat")
    expect(await res.json()).toEqual({ ok: true })
  })

  it("keeps the preview response when the proxy header is present", async () => {
    vi.stubEnv("VITE_API_BASE", "/preview/pr/12")
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("sse", {
        status: 200,
        headers: { [PREVIEW_API_HEADER]: "1" },
      }),
    )

    const res = await apiFetch("/api/korea/chat")
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toBe("/preview/pr/12/api/korea/chat")
    expect(await res.text()).toBe("sse")
  })
})
