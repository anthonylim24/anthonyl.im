import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchDayPlaces } from "../dayPlacesApi"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("fetchDayPlaces", () => {
  it("appends lat/lng and returns the ranked payload", async () => {
    const payload = {
      meta: { slug: "day-1", testMode: false, city: "Seoul" },
      places: [],
      igSaves: [{ id: 1, name: "Cafe", category: "cafe", confidence_band: "high", instagramUrl: "https://ig" }],
      neighborhoods: [],
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    const data = await fetchDayPlaces(async () => "tok", "/api/korea/day/day-1/places", { lat: 37.5, lng: 127.0 })
    expect(data.igSaves).toHaveLength(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("lat=37.5")
    expect(url).toContain("lng=127")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok")
  })

  it("throws Places fetch <status> on non-OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 503 }))
    await expect(fetchDayPlaces(async () => null, "/api/korea/day/day-1/places")).rejects.toThrow("Places fetch 503")
  })
})
