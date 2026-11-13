import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import type { CityResult } from "../geocode"
import type { AtlasMapProps } from "../map/AtlasMap"
import { makeItem, makeTrip, stubMatchMedia } from "./tripFixtures"

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn().mockResolvedValue("test-token"),
}))

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => mockGetToken,
  useAuthReady: () => true,
  useViewer: () => ({ id: "u1", name: "Ant" }),
  clerkEnabled: true,
}))

const mockCreateTrip = vi.fn()
const mockUpdateTrip = vi.fn()
const mockGenerateItinerary = vi.fn()

vi.mock("../tripsApi", () => ({
  createTrip: (...args: unknown[]) => mockCreateTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  generateItinerary: (...args: unknown[]) => mockGenerateItinerary(...args),
}))

const mockSearchCities = vi.fn()

vi.mock("../geocode", () => ({
  searchCities: (...args: unknown[]) => mockSearchCities(...args),
  searchPlaces: vi.fn().mockResolvedValue([]),
  cityLabel: (city: { name: string }) => city.name,
}))

vi.mock("../map/AtlasMap", () => ({
  AtlasMap: ({ pins, label, children }: AtlasMapProps) => (
    <div role="region" aria-label={label}>
      {pins.map((pin) => (
        <span key={pin.id}>{`Pin: ${pin.title}`}</span>
      ))}
      {children}
    </div>
  ),
}))

import { TripCreate } from "../TripCreate"

const lisbon: CityResult = {
  id: "2267057",
  name: "Lisbon",
  region: "Lisbon District",
  country: "Portugal",
  countryCode: "PT",
  lat: 38.71667,
  lng: -9.13333,
  timezone: "Europe/Lisbon",
}
const porto: CityResult = { id: "2735943", name: "Porto", country: "Portugal", lat: 41.14961, lng: -8.61099, timezone: "Europe/Lisbon" }

function Landing() {
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice
  return (
    <div>
      <p data-testid="path">{location.pathname}</p>
      <p data-testid="notice">{notice ?? ""}</p>
    </div>
  )
}

function renderCreate(path = "/trips/new") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trips/new" element={<TripCreate />} />
        <Route path="/trips/:tripId" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  )
}

const destinations = () => screen.getByRole("combobox", { name: "Destinations" })

async function pickCity(query: string, optionName: RegExp) {
  fireEvent.change(destinations(), { target: { value: query } })
  fireEvent.click(await screen.findByRole("option", { name: optionName }))
}

describe("TripCreate", () => {
  beforeEach(() => {
    stubMatchMedia(true)
    mockSearchCities.mockImplementation(async (query: string) => (query.toLowerCase().startsWith("por") ? [porto] : [lisbon]))
    mockCreateTrip.mockResolvedValue(makeTrip({ id: "trip-9", slug: "lisbon-9", status: "draft" }))
    mockUpdateTrip.mockResolvedValue(makeTrip({ id: "trip-9", slug: "lisbon-9" }))
    mockGenerateItinerary.mockResolvedValue({
      trip: makeTrip({
        id: "trip-9",
        days: [
          { id: "day-1", date: "2026-07-10", items: [makeItem({ id: "a" }), makeItem({ id: "b" })] },
          { id: "day-2", date: "2026-07-11", items: [makeItem({ id: "c" })] },
        ],
      }),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("asks for a destination before creating anything", async () => {
    renderCreate()
    expect(screen.queryByRole("alert")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least one place to plan around.")
    expect(destinations()).toHaveAttribute("aria-invalid", "true")
    expect(mockCreateTrip).not.toHaveBeenCalled()
    expect(mockGenerateItinerary).not.toHaveBeenCalled()
    expect(screen.queryByTestId("path")).toBeNull()
  })

  it("creates the trip from the picked city, then drafts it with AI", async () => {
    renderCreate()
    await pickCity("Lis", /Lisbon/)

    expect(mockSearchCities.mock.calls[0]![0]).toBe("Lis")
    expect(screen.getByRole("button", { name: "Remove Lisbon" })).toBeInTheDocument()
    expect(destinations()).toHaveValue("")
    expect(within(screen.getByRole("region", { name: "Map showing Lisbon" })).getByText("Pin: Lisbon")).toBeInTheDocument()

    const first = screen.getByLabelText("First day") as HTMLInputElement
    const last = screen.getByLabelText("Last day") as HTMLInputElement
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    expect(mockCreateTrip.mock.calls[0]![1]).toEqual({
      name: "Lisbon",
      destinations: ["Lisbon"],
      startDate: first.value,
      endDate: last.value,
      timezone: "Europe/Lisbon",
      center: { lat: 38.71667, lng: -9.13333 },
    })

    await waitFor(() => expect(mockGenerateItinerary).toHaveBeenCalledTimes(1))
    expect(mockGenerateItinerary.mock.calls[0]!.slice(1)).toEqual([
      "trip-9",
      { prompt: undefined, preferences: { pace: "balanced", interests: undefined } },
    ])
    // The new trip gets a colour of its own before the draft starts.
    expect(mockUpdateTrip.mock.calls[0]![1]).toBe("trip-9")
    expect(mockUpdateTrip.mock.calls[0]![2]).toEqual({
      appearance: { accent: expect.stringMatching(/^(rose|amber|emerald|sky|violet)$/) },
    })

    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-9")
    expect(screen.getByTestId("notice")).toHaveTextContent("Drafted 3 stops across 2 days. Everything is editable.")
  })

  it("sends the brief and a custom name along", async () => {
    renderCreate()
    await pickCity("Lis", /Lisbon/)
    await pickCity("Por", /Porto/)

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "  Portugal by train  " } })
    fireEvent.click(screen.getByRole("radio", { name: "Relaxed" }))
    fireEvent.click(screen.getByRole("button", { name: "Food" }))
    fireEvent.click(screen.getByRole("button", { name: "History" }))
    fireEvent.change(screen.getByLabelText("Anything else?"), { target: { value: " One big dinner " } })
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    await waitFor(() => expect(mockGenerateItinerary).toHaveBeenCalledTimes(1))
    expect(mockCreateTrip.mock.calls[0]![1]).toMatchObject({
      name: "Portugal by train",
      destinations: ["Lisbon", "Porto"],
      // The first destination sets the time zone and the centre.
      timezone: "Europe/Lisbon",
      center: { lat: 38.71667, lng: -9.13333 },
    })
    expect(mockGenerateItinerary.mock.calls[0]![2]).toEqual({
      prompt: "One big dinner",
      preferences: { pace: "relaxed", interests: "Food, History" },
    })
  })

  it("skips the AI draft when the switch is off", async () => {
    renderCreate()
    await pickCity("Lis", /Lisbon/)

    const toggle = screen.getByRole("switch", { name: /Draft the itinerary with AI/ })
    expect(toggle).toHaveAttribute("aria-checked", "true")
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-checked", "false")
    expect(screen.queryByRole("radiogroup", { name: "Pace" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))

    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-9")
    expect(mockCreateTrip).toHaveBeenCalledTimes(1)
    expect(mockGenerateItinerary).not.toHaveBeenCalled()
    expect(screen.getByTestId("notice")).toHaveTextContent("")
  })

  it("starts with AI off for ?ai=0", () => {
    renderCreate("/trips/new?ai=0")
    expect(screen.getByRole("switch", { name: /Draft the itinerary with AI/ })).toHaveAttribute("aria-checked", "false")
    expect(screen.getByRole("button", { name: "Create trip" })).toBeInTheDocument()
  })

  it("accepts a typed place that isn't in the results", async () => {
    mockSearchCities.mockResolvedValue([])
    renderCreate("/trips/new?ai=0")

    fireEvent.change(destinations(), { target: { value: "Middle of nowhere" } })
    fireEvent.keyDown(destinations(), { key: "Enter" })
    expect(screen.getByRole("button", { name: "Remove Middle of nowhere" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    const input = mockCreateTrip.mock.calls[0]![1] as { destinations: string[]; timezone: string; center?: unknown }
    expect(input.destinations).toEqual(["Middle of nowhere"])
    expect(input.center).toBeUndefined()
    expect(input.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  })

  it("still opens the trip when the AI draft fails", async () => {
    mockGenerateItinerary.mockRejectedValue(new Error("upstream timeout"))
    renderCreate()
    await pickCity("Lis", /Lisbon/)
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-9")
    expect(screen.getByTestId("notice")).toHaveTextContent(
      "Your trip is ready, but the AI draft didn’t finish. Use “Draft with AI” to try again. (upstream timeout)",
    )
  })

  it("stays on the form and explains when the trip can't be created", async () => {
    mockCreateTrip.mockRejectedValue(new Error("HTTP 500"))
    renderCreate()
    await pickCity("Lis", /Lisbon/)
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t create the trip. Check your connection and try again. (HTTP 500)")
    expect(mockGenerateItinerary).not.toHaveBeenCalled()
    expect(screen.queryByTestId("path")).toBeNull()
    // The form is usable again for a retry.
    expect(screen.getByRole("button", { name: "Create and draft itinerary" })).toBeEnabled()
  })

  it("rejects a range that ends before it starts", async () => {
    renderCreate("/trips/new?ai=0")
    await pickCity("Lis", /Lisbon/)
    const first = screen.getByLabelText("First day") as HTMLInputElement

    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2020-01-01" } })
    expect(screen.getByRole("alert")).toHaveTextContent("The last day is before the first. Pick a later date.")
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    expect(mockCreateTrip).not.toHaveBeenCalled()

    // A length preset repairs the range from the first day.
    fireEvent.click(screen.getByRole("button", { name: "1 week" }))
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByRole("button", { name: "1 week" })).toHaveAttribute("aria-pressed", "true")
    expect(first.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
