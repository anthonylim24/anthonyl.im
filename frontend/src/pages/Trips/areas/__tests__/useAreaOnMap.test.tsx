import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { useAreaOnMap } from "../useAreaOnMap"
import { clearAreasCache } from "../areasApi"
import type { Neighborhood } from "../contract"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"

const at = (id: string, title: string, lat: number, lng: number) => makeItem({ id, title, location: { name: title, lat, lng, source: "user" } })

const TRIP = makeTrip({
  id: "lisbon",
  days: [
    { id: "day-1", date: "2026-07-10", items: [at("castle", "Castelo de São Jorge", 38.7139, -9.1335), at("se", "Lisbon Cathedral", 38.7098, -9.1361)] },
    { id: "day-2", date: "2026-07-11", items: [at("panteao", "National Pantheon", 38.7148, -9.1247)] },
  ],
})
const ALFAMA: Neighborhood = { id: "a-alfama0000", name: "Alfama", city: "Lisbon", summary: "Steep lanes.", stopIds: ["castle", "se", "panteao"], photos: [] }
const RING = [[-9.14, 38.70], [-9.12, 38.70], [-9.12, 38.72], [-9.14, 38.70]]

const getToken = async () => "token"
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
beforeEach(() => {
  clearAreasCache()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe("useAreaOnMap", () => {
  it("asks for the outline again after a failed lookup, and is not settled until the new answer", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "outline_unavailable" }, { status: 503 }))
    const { result } = renderHook(() => useAreaOnMap(TRIP, getToken, true))

    act(() => result.current.show(ALFAMA))
    expect(result.current.settled).toBe(false)
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.shape?.approximate).toBe(true)

    act(() => result.current.show(null))
    let answer!: (response: Response) => void
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    act(() => result.current.show(ALFAMA))
    expect(result.current.settled).toBe(false)

    await act(async () => answer(Response.json({ outline: { type: "Polygon", coordinates: [RING] } })))
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.shape?.approximate).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("draws a found outline again at once, without asking", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ outline: { type: "Polygon", coordinates: [RING] } }))
    const { result } = renderHook(() => useAreaOnMap(TRIP, getToken, true))
    act(() => result.current.show(ALFAMA))
    await waitFor(() => expect(result.current.settled).toBe(true))

    act(() => result.current.show(null))
    act(() => result.current.show(ALFAMA))
    expect(result.current.settled).toBe(true)
    expect(result.current.shape?.approximate).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
