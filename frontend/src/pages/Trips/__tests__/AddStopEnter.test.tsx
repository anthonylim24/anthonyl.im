import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PlaceResult } from "../geocode"
import type { ItineraryItem } from "../types"

const lotteMart: PlaceResult = { id: "g:lotte", name: "Lotte Mart", context: "1 Yeonbuk-ro, Jeju", lat: 33.49, lng: 126.49, category: "market" }
const palace: PlaceResult = { id: "g:palace", name: "Gyeongbokgung Palace", context: "Jongno-gu, Seoul", lat: 37.58, lng: 126.98, category: "palace" }
const mockSearch = vi.fn(async (): Promise<PlaceResult[]> => [])
vi.mock("../geocode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../geocode")>()),
  searchPlaces: () => mockSearch(),
}))

import { AddStop } from "../workspace/AddStop"

function typeAndEnter(text: string) {
  const onAdd = vi.fn<(item: ItineraryItem) => void>()
  render(<AddStop near={{ lat: 33.5, lng: 126.5 }} onAdd={onAdd} />)
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

  it("adds a loosely matched place only when the traveller picks it", async () => {
    mockSearch.mockResolvedValue([lotteMart])
    const onAdd = vi.fn<(item: ItineraryItem) => void>()
    render(<AddStop near={null} onAdd={onAdd} />)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Bring rain jackets" } })
    fireEvent.click(await screen.findByRole("option", { name: /Lotte Mart/ }))
    expect(onAdd.mock.calls[0]![0].location).toMatchObject({ name: "Lotte Mart" })
  })
})
