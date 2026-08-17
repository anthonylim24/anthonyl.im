import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchAbout } from "../entityAboutApi"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("fetchAbout", () => {
  it("returns the description and reuses the session cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ description: "A palace in Seoul." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const first = await fetchAbout("Gyeongbokgung", "palace", "Seoul")
    const second = await fetchAbout("Gyeongbokgung", "palace", "Seoul")
    expect(first).toBe("A palace in Seoul.")
    expect(second).toBe("A palace in Seoul.")
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("returns null on a failed request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }))
    await expect(fetchAbout("Unknown Place", "restaurant")).resolves.toBeNull()
  })

  it("retries after a failed request instead of caching the miss", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ description: "A market in Seoul." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    await expect(fetchAbout("Gwangjang", "market", "Seoul")).resolves.toBeNull()
    await expect(fetchAbout("Gwangjang", "market", "Seoul")).resolves.toBe("A market in Seoul.")
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
