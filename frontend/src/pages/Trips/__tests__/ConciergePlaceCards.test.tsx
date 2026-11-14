import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ConciergePlace } from "../../../lib/conciergeGrounding"
import type { TripDay } from "../types"

vi.mock("../placePhoto", () => ({
  lookupPhoto: vi.fn().mockResolvedValue(null),
  lookupGooglePlacePhoto: vi.fn().mockResolvedValue(null),
}))

import { ConciergePlaceCards, hoursLine, walkLine } from "../ConciergePlaceCards"

const days: TripDay[] = [
  { id: "day-1", date: "2026-11-13", title: "Belém", items: [] },
  { id: "day-2", date: "2026-11-14", items: [] },
]

const place: ConciergePlace = {
  ref: "ChIJ1",
  name: "A Marítima do Restelo",
  address: "R. Bartolomeu Dias 110",
  lat: 38.69,
  lng: -9.21,
  category: "restaurant",
  dayId: "day-1",
  time: "12:30",
  rating: 4.66,
  price: "€€",
  hours: "12:15–15:30, 19:15–22:30",
  hoursDay: "Fri",
  open: true,
  walk: { from: "Mosteiro dos Jerónimos", minutes: 9, meters: 700 },
}

function renderCards(over: Partial<Parameters<typeof ConciergePlaceCards>[0]> = {}) {
  const onAdd = vi.fn()
  render(
    <ConciergePlaceCards places={[place]} days={days} added={{}} addingKey={null} canEdit onAdd={onAdd} onPhotos={() => {}} {...over} />,
  )
  return onAdd
}

describe("ConciergePlaceCards", () => {
  it("leads with the rating, the walk from the plan and that day's hours", () => {
    renderCards()
    expect(screen.getByText("4.7")).toBeTruthy()
    expect(screen.getByText("Restaurant")).toBeTruthy()
    expect(screen.getByText("9 min walk from Mosteiro dos Jerónimos")).toBeTruthy()
    expect(screen.getByText("Open Fri 12:15–15:30, 19:15–22:30")).toBeTruthy()
  })

  it("adds to the suggested day and time, and drops the time on another day", () => {
    const onAdd = renderCards()
    fireEvent.click(screen.getByRole("button", { name: "Add A Marítima do Restelo to Fri 13 Nov · 12:30" }))
    expect(onAdd).toHaveBeenCalledWith(place, "day-1")
    fireEvent.change(screen.getByRole("combobox", { name: "Day for A Marítima do Restelo" }), { target: { value: "day-2" } })
    fireEvent.click(screen.getByRole("button", { name: "Add A Marítima do Restelo to Sat 14 Nov" }))
    expect(onAdd).toHaveBeenLastCalledWith(place, "day-2")
  })

  it("offers only the map to someone who cannot edit", () => {
    renderCards({ canEdit: false })
    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull()
    expect(screen.getByRole("link", { name: /A Marítima do Restelo/ }).getAttribute("target")).toBe("_blank")
  })

  it("says so plainly when the place is closed then", () => {
    expect(hoursLine({ name: "x", hours: "Closed", hoursDay: "Sun" })).toEqual({ text: "Closed Sun", state: "closed" })
    expect(hoursLine({ name: "x", hours: "18:00–01:00", hoursDay: "Sat", open: false, time: "12:00" })).toEqual({
      text: "Closed at 12:00 · Sat 18:00–01:00",
      state: "closed",
    })
    expect(hoursLine({ name: "x" })).toBeNull()
    expect(walkLine({ from: "MAAT", minutes: 35, meters: 2800 })).toBe("2.8 km from MAAT")
  })
})
