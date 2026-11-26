import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanAreas, cleanGeometry, clearAreasCache, loadAreaOutline, loadNeighborhoods } from "../areasApi"

const AREA = { id: "a-alfama0000", name: "Alfama", city: "Lisbon", summary: "Steep lanes.", stopIds: ["castle"], photos: [] }

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
beforeEach(() => {
  clearAreasCache()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  fetchMock.mockReset()
})

describe("loadNeighborhoods", () => {
  it("asks again while the server is still grouping, then keeps the answer for the same stops", async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(Response.json({ status: "grouping" }, { status: 202 })).mockResolvedValueOnce(Response.json({ areas: [AREA] }))
    const loading = loadNeighborhoods(async () => "token", "lisbon", "fp-1")
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await loading).toEqual([AREA])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/trips/lisbon/neighborhoods")
    expect(await loadNeighborhoods(async () => "token", "lisbon", "fp-1")).toEqual([AREA])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("loadAreaOutline", () => {
  it("answers null, uncached, when the outline could not be looked up", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "outline_unavailable" }, { status: 503 }))
    expect(await loadAreaOutline(async () => null, "lisbon", "fp", AREA.id)).toBeNull()
    const ring = [[-9.14, 38.71], [-9.13, 38.71], [-9.13, 38.72], [-9.14, 38.71]]
    fetchMock.mockResolvedValueOnce(Response.json({ outline: { type: "Polygon", coordinates: [ring] } }))
    expect(await loadAreaOutline(async () => null, "lisbon", "fp", AREA.id)).toEqual({ type: "Polygon", coordinates: [ring] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("keeps nothing when the server no longer has the grouping, and asks it to group again next time", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ areas: [AREA] }))
    await loadNeighborhoods(async () => null, "lisbon", "fp")
    fetchMock.mockResolvedValueOnce(Response.json({ error: "area_unknown" }, { status: 409 }))
    expect(await loadAreaOutline(async () => null, "lisbon", "fp", AREA.id)).toBeNull()
    fetchMock.mockResolvedValueOnce(Response.json({ outline: null }))
    expect(await loadAreaOutline(async () => null, "lisbon", "fp", AREA.id)).toBeNull()
    fetchMock.mockResolvedValueOnce(Response.json({ areas: [AREA] }))
    await loadNeighborhoods(async () => null, "lisbon", "fp")
    expect(fetchMock.mock.calls.map(([url]) => String(url).replace(/^.*\/api/, ""))).toEqual([
      "/trips/lisbon/neighborhoods",
      `/trips/lisbon/neighborhoods/${AREA.id}/outline`,
      `/trips/lisbon/neighborhoods/${AREA.id}/outline`,
      "/trips/lisbon/neighborhoods",
    ])
  })
})

describe("cleanAreas", () => {
  const photo = { url: "https://lh3.googleusercontent.com/p/x", author: { name: "Rita" } }

  it("keeps the local name's language and whose photo it is, and an area with no city", () => {
    expect(
      cleanAreas([
        { ...AREA, localName: "성수동", localLang: "ko", photos: [photo], photoOf: "Seoul Forest", city: "" },
        { ...AREA, id: "a-other00000", localName: "Bairro", localLang: "<script>", photos: [], photoOf: "Nowhere" },
      ]),
    ).toEqual([
      { ...AREA, localName: "성수동", localLang: "ko", photos: [photo], photoOf: "Seoul Forest", city: "" },
      { ...AREA, id: "a-other00000", localName: "Bairro", photos: [] },
    ])
  })
})

describe("cleanGeometry", () => {
  it("keeps polygons of finite points and nothing else", () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]]
    expect(cleanGeometry({ type: "MultiPolygon", coordinates: [[ring]] })).toEqual({ type: "MultiPolygon", coordinates: [[ring]] })
    expect(cleanGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 0]]] })).toBeNull()
    expect(cleanGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, "x"], [1, 1], [0, 0]]] })).toBeNull()
    expect(cleanGeometry({ type: "Point", coordinates: [0, 0] })).toBeNull()
    expect(cleanGeometry(null)).toBeNull()
  })
})
