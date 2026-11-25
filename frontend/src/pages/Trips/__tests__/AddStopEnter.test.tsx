import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PlaceResult } from "../geocode"
import type { ItineraryItem } from "../types"

const lotteMart: PlaceResult = { id: "g:lotte", name: "Lotte Mart", context: "Seoul Station", lat: 37.55, lng: 126.97, category: "market" }
const checkOutKosovo: PlaceResult = { id: "o:1", name: "Check Out", context: "Gjakova, Kosovo", lat: 42.38, lng: 20.43 }
const palace: PlaceResult = { id: "g:palace", name: "Gyeongbokgung Palace", context: "Jongno-gu, Seoul", lat: 37.58, lng: 126.98, category: "palace" }
const mockSearch = vi.fn(async (_query: string): Promise<PlaceResult[]> => [])
vi.mock("../geocode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../geocode")>()),
  searchPlaces: (query: string) => mockSearch(query),
}))

import { AddStop } from "../workspace/AddStop"

function typeAndEnter(text: string) {
  const onAdd = vi.fn<(item: ItineraryItem) => void>()
  render(<AddStop near={{ lat: 37.57, lng: 126.98 }} onAdd={onAdd} />)
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
