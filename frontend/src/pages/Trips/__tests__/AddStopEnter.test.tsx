import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PlaceResult } from "../geocode"
import type { ItineraryItem } from "../types"

const lotteMart: PlaceResult = { id: "g:lotte", name: "Lotte Mart", context: "Seoul Station", lat: 37.55, lng: 126.97, category: "market" }
const checkOutKosovo: PlaceResult = { id: "o:1", name: "Check Out", context: "Gjakova, Kosovo", lat: 42.38, lng: 20.43 }
const palace: PlaceResult = { id: "g:palace", name: "Gyeongbokgung Palace", context: "Jongno-gu, Seoul", lat: 37.58, lng: 126.98, category: "palace" }
const mockSearch = vi.fn<(query: string) => Promise<PlaceResult[]>>(async () => [])
vi.mock("../geocode", async (importOriginal) => {
  const geocode = await importOriginal<typeof import("../geocode")>()
  return {
    ...geocode,
    // The mock answers with what the sources found; the ranking is the real one.
    searchPlaces: async (query: string, near: { lat: number; lng: number } | null, _signal?: AbortSignal, _getToken?: unknown, anchors = geocode.NO_ANCHORS) =>
      geocode.rankPlaces([await mockSearch(query)], geocode.withPoint(anchors, near), { query }),
  }
})

import { AddStop, TripPlacesContext } from "../workspace/AddStop"
import type { TripPlaces } from "../searchArea"

const jagalchi: PlaceResult = {
  id: "g:jagalchi",
  name: "Jagalchi Market",
  context: "52 Jagalchihaean-ro, Jung-gu",
  address: "52 Jagalchihaean-ro, Jung-gu, Busan, South Korea",
  lat: 35.0966,
  lng: 129.0306,
  category: "market",
}
/** Seoul then Busan, every stop so far in Seoul. */
const seoulBusan: TripPlaces = { anchors: { points: [{ lat: 37.57, lng: 126.98 }], towns: ["seoul", "busan"] }, stops: [] }

function typeAndEnter(text: string, trip?: TripPlaces) {
  const onAdd = vi.fn<(item: ItineraryItem) => void>()
  const field = <AddStop near={{ lat: 37.57, lng: 126.98 }} onAdd={onAdd} />
  render(trip ? <TripPlacesContext.Provider value={trip}>{field}</TripPlacesContext.Provider> : field)
  const input = screen.getByRole("combobox")
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: "Enter" })
  return onAdd
}

describe("AddStop, Enter", () => {
  afterEach(() => vi.clearAllMocks())

  it("adds free text as typed when the search's best guess is another place", async () => {
    mockSearch.mockResolvedValue([lotteMart])
    const onAdd = typeAndEnter("Bring rain jackets")
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const item = onAdd.mock.calls[0]![0]
    expect(item.title).toBe("Bring rain jackets")
    expect(item.location?.lat).toBeUndefined()
  })

  it("pins the place when its name is what was typed", async () => {
    mockSearch.mockResolvedValue([palace])
    const onAdd = typeAndEnter("gyeongbok")
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd.mock.calls[0]![0].location).toMatchObject({ name: "Gyeongbokgung Palace", lat: 37.58 })
  })

  it("never pins a same-named place far from the trip", async () => {
    mockSearch.mockResolvedValue([checkOutKosovo])
    const onAdd = typeAndEnter("Check out")
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd.mock.calls[0]![0].location?.lat).toBeUndefined()
  })

  it("pins a place in the trip's other city", async () => {
    mockSearch.mockResolvedValue([jagalchi])
    const onAdd = typeAndEnter("Jagalchi Market", seoulBusan)
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd.mock.calls[0]![0].location).toMatchObject({ name: "Jagalchi Market", lat: 35.0966 })
  })

  it("says why Enter added the text without a pin", async () => {
    mockSearch.mockResolvedValue([checkOutKosovo])
    const onAdd = typeAndEnter("Check out", seoulBusan)
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(document.querySelector("[data-trips-announcer]")).toHaveTextContent("No place near the trip is called “Check out”, so it has no pin.")
  })

  it("lists the places a note's words found after what the text can become, and names a day that holds one", async () => {
    mockSearch.mockResolvedValue([lotteMart])
    render(
      <TripPlacesContext.Provider value={{ ...seoulBusan, stops: [{ day: 3, key: "lotte mart", placeId: null, lat: 37.55, lng: 126.97 }] }}>
        <AddStop near={{ lat: 37.57, lng: 126.98 }} onAdd={vi.fn()} />
      </TripPlacesContext.Provider>,
    )
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Bring rain jackets" } })
    const lotte = await screen.findByRole("option", { name: /Lotte Mart/ })
    const options = screen.getAllByRole("option")
    expect(options[0]).toHaveAccessibleName("Add “Bring rain jackets” without a pin")
    expect(options.indexOf(lotte)).toBeGreaterThan(0)
    expect(lotte).toHaveTextContent("Already on day 3 · Seoul Station")
  })

  it("adds a loosely matched place only when the traveller picks it", async () => {
    mockSearch.mockResolvedValue([lotteMart])
    const onAdd = vi.fn<(item: ItineraryItem) => void>()
    render(<AddStop near={null} onAdd={onAdd} />)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Bring rain jackets" } })
    fireEvent.click(await screen.findByRole("option", { name: /Lotte Mart/ }))
    expect(onAdd.mock.calls[0]![0].location).toMatchObject({ name: "Lotte Mart" })
  })

  it("never lists, or adds on Enter, the answer to the text before the last keystroke", async () => {
    const answers: Record<string, (found: PlaceResult[]) => void> = {}
    mockSearch.mockImplementation((query) => new Promise((resolve) => (answers[query] = resolve)))
    const onAdd = vi.fn<(item: ItineraryItem) => void>()
    render(<AddStop near={{ lat: 37.57, lng: 126.98 }} onAdd={onAdd} />)
    const input = screen.getByRole("combobox")
    fireEvent.change(input, { target: { value: "gyeongbok" } })
    await waitFor(() => expect(answers.gyeongbok).toBeDefined())
    answers.gyeongbok!([palace])
    expect(await screen.findByRole("option", { name: /Gyeongbokgung Palace/ })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: "Lotte Mart" } })
    expect(screen.queryByRole("option", { name: /Gyeongbokgung Palace/ })).toBeNull()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onAdd).not.toHaveBeenCalled()
    await waitFor(() => expect(answers["Lotte Mart"]).toBeDefined())
    answers["Lotte Mart"]!([lotteMart])
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    expect(onAdd.mock.calls[0]![0].location).toMatchObject({ name: "Lotte Mart" })
  })
})
