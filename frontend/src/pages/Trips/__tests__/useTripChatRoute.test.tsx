import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { useTripChatRoute } from "../TripChat"

function Probe() {
  const { tripId, dayId } = useTripChatRoute()
  return <div>{`id:${tripId ?? ""} day:${dayId ?? ""}`}</div>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
    </MemoryRouter>,
  )
}

describe("useTripChatRoute", () => {
  it("matches a trip overview", () => {
    renderAt("/trips/tokyo-long-weekend-2026")
    expect(screen.getByText("id:tokyo-long-weekend-2026 day:")).toBeTruthy()
  })

  it("matches a day page", () => {
    renderAt("/trips/tokyo/day/day-3")
    expect(screen.getByText("id:tokyo day:day-3")).toBeTruthy()
  })

  it("stays off the index, create, and editor routes", () => {
    renderAt("/trips")
    expect(screen.getByText("id: day:")).toBeTruthy()
  })

  it("stays off /trips/new", () => {
    renderAt("/trips/new")
    expect(screen.getByText("id: day:")).toBeTruthy()
  })

  it("stays off the editor", () => {
    renderAt("/trips/tokyo/edit")
    expect(screen.getByText("id: day:")).toBeTruthy()
  })

  it("stays off the places library", () => {
    renderAt("/trips/tokyo/places")
    expect(screen.getByText("id: day:")).toBeTruthy()
  })
})
