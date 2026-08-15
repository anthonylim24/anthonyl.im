import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchExtractedPlaces, setExtractedPlaceDays } from "../placesApi"

afterEach(() => {
  vi.restoreAllMocks()
})

const getToken = async () => "tok"

describe("placesApi", () => {
  it("builds the filter query string and opts out of SW cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ places: [], total: 0, hasMore: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await fetchExtractedPlaces(getToken, { limit: 50, offset: 10, category: "cafe", q: "onion" })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/extracted?")
    expect(url).toContain("limit=50")
    expect(url).toContain("offset=10")
    expect(url).toContain("category=cafe")
    expect(url).toContain("q=onion")
    expect(init.cache).toBe("no-store")
  })

  it("throws body.error only", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "forbidden", message: "ignored" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    )
    await expect(fetchExtractedPlaces(getToken)).rejects.toMatchObject({ message: "forbidden" })
  })

  it("treats 204 day-assignment as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }))
    await expect(setExtractedPlaceDays(getToken, 3, [1, 2])).resolves.toBeUndefined()
  })
})
