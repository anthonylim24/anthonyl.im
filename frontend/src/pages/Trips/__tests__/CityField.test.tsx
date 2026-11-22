import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { CityResult } from "../geocode"

const mockSearchCities = vi.fn()
vi.mock("../geocode", () => ({
  searchCities: (...args: unknown[]) => mockSearchCities(...args),
}))

import { CityField } from "../components/CityField"

const lisbon: CityResult = { id: "2267057", name: "Lisbon", country: "Portugal", lat: 38.71667, lng: -9.13333, timezone: "Europe/Lisbon" }

function renderField() {
  const onAdd = vi.fn<(name: string, city?: CityResult) => void>()
  render(
    <>
      <label htmlFor="where">Where</label>
      <CityField id="where" values={[]} onAdd={onAdd} onRemove={() => {}} />
    </>,
  )
  return { onAdd, field: screen.getByRole("combobox", { name: "Where" }) }
}

describe("CityField", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("waits for a search still on its way before Enter adds the place", async () => {
    let answer!: (cities: CityResult[]) => void
    mockSearchCities.mockReturnValue(new Promise<CityResult[]>((resolve) => (answer = resolve)))
    const { onAdd, field } = renderField()

    fireEvent.change(field, { target: { value: "Lisb" } })
    await waitFor(() => expect(mockSearchCities).toHaveBeenCalledWith("Lisb", expect.any(AbortSignal)))
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onAdd).not.toHaveBeenCalled()
    expect(field).toHaveAttribute("aria-busy", "true")

    answer([lisbon])
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("Lisbon", lisbon))
  })

  it("says when the search failed, and Retry searches again", async () => {
    mockSearchCities.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([lisbon])
    const { onAdd, field } = renderField()

    fireEvent.change(field, { target: { value: "Lisb" } })
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Couldn’t search, check your connection.")

    fireEvent.click(within(alert).getByRole("button", { name: /Retry/ }))
    const option = await screen.findByRole("option", { name: /Lisbon/ })
    expect(mockSearchCities).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(option)
    expect(onAdd).toHaveBeenCalledWith("Lisbon", lisbon)
  })

  it("takes the text as typed when the search failed and Enter is pressed", async () => {
    mockSearchCities.mockRejectedValue(new Error("offline"))
    const { onAdd, field } = renderField()
    fireEvent.change(field, { target: { value: "Lisb" } })
    await screen.findByRole("alert")
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onAdd).toHaveBeenCalledWith("Lisb", undefined)
  })
})
