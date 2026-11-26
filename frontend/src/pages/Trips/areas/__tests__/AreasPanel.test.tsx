import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AreasPanel } from "../AreasPanel"
import { clearAreasCache } from "../areasApi"
import type { Neighborhood } from "../contract"
import type { Trip } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"

const at = (id: string, title: string, lat: number, lng: number) => makeItem({ id, title, location: { name: title, lat, lng, source: "user" } })

const LISBON: Trip = makeTrip({
  days: [
    { id: "day-1", date: "2026-07-10", items: [at("castle", "Castelo de São Jorge", 38.7139, -9.1335), at("chiado", "Café A Brasileira", 38.7106, -9.1426)] },
    { id: "day-2", date: "2026-07-11", items: [at("se", "Lisbon Cathedral", 38.7098, -9.1361)] },
  ],
})

const ALFAMA = {
  id: "a-alfama0000",
  name: "Alfama",
  city: "Lisbon",
  summary: "The old Moorish quarter: steep lanes under the castle.",
  stopIds: ["castle", "se", "gone"],
  photos: [
    { url: "https://lh3.googleusercontent.com/places/alfama=s800", width: 800, height: 600, author: { name: "Rita", uri: "https://maps.google.com/maps/contrib/1" } },
  ],
}
const CHIADO = { id: "a-chiado0000", name: "Chiado", localName: "Chiado", city: "Lisbon", summary: "Cafés and bookshops.", stopIds: ["chiado"], photos: [{ url: "https://lh3.googleusercontent.com/x" }] }

let answers: Array<() => Response>
const fetchMock = vi.fn(async () => (answers.shift() ?? (() => Response.json({ error: "none left" }, { status: 500 })))())

beforeEach(() => {
  clearAreasCache()
  answers = []
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

function renderPanel(trip: Trip, shownId: string | null = null) {
  const onShow = vi.fn<(area: Neighborhood | null) => void>()
  const view = render(
    <MemoryRouter>
      <AreasPanel trip={trip} basePath="/trips/lisbon" getToken={async () => "token"} shownId={shownId} onShow={onShow} />
    </MemoryRouter>,
  )
  return { ...view, onShow }
}

describe("AreasPanel", () => {
  it("says what fills it, and asks nothing, while no stop has a place", () => {
    renderPanel(makeTrip({ days: [{ id: "day-1", date: "2026-07-10", items: [makeItem({ id: "x", title: "Lunch" })] }] }))
    expect(screen.getByText(/Add places to your days/)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows a skeleton while grouping, then each area with its photo, credit, days, stops and summary", async () => {
    answers.push(() => Response.json({ areas: [ALFAMA, CHIADO] }))
    const { onShow } = renderPanel(LISBON)
    expect(screen.getByRole("status").textContent).toMatch(/can take up to a minute/)
    const alfama = await screen.findByRole("article", { name: "Alfama" })
    expect(within(alfama).getByRole("img", { name: "Alfama, Lisbon" })).toBeTruthy()
    expect(within(alfama).getByRole("link", { name: "Rita" }).getAttribute("href")).toBe("https://maps.google.com/maps/contrib/1")
    // A stop deleted since the grouping is not counted.
    expect(within(alfama).getByText("Days 1, 2 · 2 stops")).toBeTruthy()
    expect(within(alfama).getByText(/steep lanes/)).toBeTruthy()
    // A photo without its author is never shown; a local name equal to the name is not repeated.
    const chiado = screen.getByRole("article", { name: "Chiado" })
    expect(within(chiado).queryByRole("img")).toBeNull()
    expect(within(chiado).getAllByText("Chiado")).toHaveLength(1)
    expect(screen.getByRole("status").textContent).toBe("2 neighborhoods")

    const toggle = within(alfama).getByRole("button", { name: "Show on map" })
    expect(toggle.hasAttribute("aria-pressed")).toBe(false)
    fireEvent.click(toggle)
    expect(onShow).toHaveBeenLastCalledWith(expect.objectContaining({ id: ALFAMA.id }))
  })

  it("lists an area's stops by day, each linking to its stop", async () => {
    answers.push(() => Response.json({ areas: [ALFAMA] }))
    renderPanel(LISBON, ALFAMA.id)
    const alfama = await screen.findByRole("article", { name: "Alfama" })
    expect(within(alfama).getByRole("button", { name: "Hide from map" })).toBeTruthy()
    const more = within(alfama).getByRole("button", { name: "Stops by day" })
    expect(more.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(more)
    expect(more.getAttribute("aria-expanded")).toBe("true")
    expect(within(alfama).getByRole("link", { name: "Castelo de São Jorge" }).getAttribute("href")).toBe("/trips/lisbon/day/day-1#stop-castle")
    expect(within(alfama).getByRole("link", { name: "Lisbon Cathedral" }).getAttribute("href")).toBe("/trips/lisbon/day/day-2#stop-se")
  })

  it("says when the photo is of one of the area's stops, and marks the local name's language", async () => {
    const castle = { ...ALFAMA, localName: "アルファマ", localLang: "ja", photoOf: "Castelo de São Jorge" }
    answers.push(() => Response.json({ areas: [castle] }))
    renderPanel(LISBON)
    const alfama = await screen.findByRole("article", { name: "Alfama" })
    expect(within(alfama).getByRole("img", { name: "Castelo de São Jorge, Alfama, Lisbon" })).toBeTruthy()
    expect(within(alfama).getByRole("figure").textContent).toBe("Castelo de São Jorge · Photo: Rita")
    expect(within(alfama).getByText("アルファマ").getAttribute("lang")).toBe("ja")
  })

  it("says calmly when grouping failed, and tries again on request", async () => {
    answers.push(() => Response.json({ error: "neighborhoods_failed", message: "model said SECRET" }, { status: 502 }))
    answers.push(() => Response.json({ areas: [ALFAMA] }))
    renderPanel(LISBON)
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Couldn’t group your stops into neighborhoods."))
    expect(screen.queryByText(/SECRET/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("article", { name: "Alfama" })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("offers no retry when the server cannot group at all", async () => {
    answers.push(() => Response.json({ error: "ai_not_configured" }, { status: 503 }))
    renderPanel(LISBON)
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Neighborhoods aren’t available on this server."))
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })

  it("clears the map when the area drawn there is no longer one of the trip's", async () => {
    answers.push(() => Response.json({ areas: [CHIADO] }))
    const { onShow } = renderPanel(LISBON, ALFAMA.id)
    await screen.findByRole("article", { name: "Chiado" })
    await waitFor(() => expect(onShow).toHaveBeenCalledWith(null))
  })
})
