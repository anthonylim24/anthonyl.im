import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom"
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
  useIsDark: () => false,
  canRenderMap: () => false,
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
      <p data-testid="search">{location.search}</p>
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

const dates = () => screen.getByRole("button", { name: /^Dates: .* Change dates$/ })

describe("TripCreate", () => {
  beforeEach(() => {
    // Friday 13 Nov 2026 (Date only; timers stay real). New trips default to
    // three weeks out: Fri 4 Dec → Tue 8 Dec.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"))
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
      summary: "",
      incompleteDays: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
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

    expect(dates()).toHaveAccessibleName("Dates: Fri, Dec 4 → Tue, Dec 8, 5 days. Change dates")
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    expect(mockCreateTrip.mock.calls[0]![1]).toEqual({
      name: "Lisbon",
      destinations: ["Lisbon"],
      startDate: "2026-12-04",
      endDate: "2026-12-08",
      timezone: "Europe/Lisbon",
      center: { lat: 38.71667, lng: -9.13333 },
    })

    await waitFor(() => expect(mockGenerateItinerary).toHaveBeenCalledTimes(1))
    expect(mockGenerateItinerary.mock.calls[0]!.slice(1, 3)).toEqual([
      "trip-9",
      { prompt: undefined, preferences: { pace: "balanced", interests: undefined } },
    ])
    expect(mockGenerateItinerary.mock.calls[0]![3]).toBeInstanceOf(AbortSignal)
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

  it("looks up a typed first place before creating, so the trip gets its time zone and centre", async () => {
    mockSearchCities.mockResolvedValue([])
    renderCreate("/trips/new?ai=0")
    fireEvent.change(destinations(), { target: { value: "lisbon" } })
    await waitFor(() => expect(mockSearchCities).toHaveBeenCalled())
    fireEvent.keyDown(destinations(), { key: "Enter" })
    expect(await screen.findByRole("button", { name: "Remove lisbon" })).toBeInTheDocument()

    mockSearchCities.mockResolvedValue([lisbon])
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    expect(mockCreateTrip.mock.calls[0]![1]).toMatchObject({
      destinations: ["lisbon"],
      timezone: "Europe/Lisbon",
      center: { lat: 38.71667, lng: -9.13333 },
    })
  })

  it("asks for the time zone when the map can't find the first place", async () => {
    mockSearchCities.mockResolvedValue([])
    renderCreate("/trips/new?ai=0")
    fireEvent.change(destinations(), { target: { value: "Middle of nowhere" } })
    await waitFor(() => expect(mockSearchCities).toHaveBeenCalled())
    fireEvent.keyDown(destinations(), { key: "Enter" })
    expect(await screen.findByRole("button", { name: "Remove Middle of nowhere" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    const zone = await screen.findByRole("combobox", { name: "Time zone for Middle of nowhere" })
    expect(mockSearchCities).toHaveBeenLastCalledWith("Middle of nowhere", expect.any(AbortSignal))
    expect(mockCreateTrip).not.toHaveBeenCalled()
    await waitFor(() => expect(zone).toHaveFocus())

    // Still no zone: nothing is created.
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    expect(mockCreateTrip).not.toHaveBeenCalled()

    fireEvent.change(zone, { target: { value: "tokyo" } })
    fireEvent.click(within(screen.getByRole("listbox", { name: "Time zones" })).getByRole("option", { name: /^Tokyo/ }))
    expect(zone).toHaveValue("Tokyo · Asia/Tokyo")

    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    const input = mockCreateTrip.mock.calls[0]![1] as { destinations: string[]; timezone: string; center?: unknown }
    expect(input.destinations).toEqual(["Middle of nowhere"])
    expect(input.timezone).toBe("Asia/Tokyo")
    expect(input.center).toBeUndefined()
  })

  it("asks for the time zone when the map finds the place but not a zone this browser knows", async () => {
    mockSearchCities.mockResolvedValue([{ ...lisbon, timezone: "" }])
    renderCreate("/trips/new?ai=0")
    await pickCity("Lis", /Lisbon/)

    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    const zone = await screen.findByRole("combobox", { name: "Time zone for Lisbon" })
    expect(screen.getByText("The map found “Lisbon” but not its time zone, so pick it. Times on the trip follow it.")).toBeInTheDocument()
    expect(mockCreateTrip).not.toHaveBeenCalled()

    fireEvent.change(zone, { target: { value: "lisbon" } })
    fireEvent.click(within(screen.getByRole("listbox", { name: "Time zones" })).getByRole("option", { name: /^Lisbon/ }))
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    expect(mockCreateTrip.mock.calls[0]![1]).toMatchObject({ timezone: "Europe/Lisbon", center: { lat: 38.71667, lng: -9.13333 } })
  })

  it("ignores Enter while an IME is still composing", async () => {
    renderCreate("/trips/new?ai=0")
    fireEvent.change(destinations(), { target: { value: "서울" } })
    await waitFor(() => expect(mockSearchCities).toHaveBeenCalled())
    fireEvent.keyDown(destinations(), { key: "Enter", keyCode: 229 })
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull()
    expect(destinations()).toHaveValue("서울")
    expect(mockCreateTrip).not.toHaveBeenCalled()
  })

  it("says which days came back thin, and still opens the trip", async () => {
    mockGenerateItinerary.mockResolvedValue({
      trip: makeTrip({
        id: "trip-9",
        days: [
          { id: "day-1", date: "2026-12-04", items: [makeItem({ id: "a" }), makeItem({ id: "b" })] },
          { id: "day-2", date: "2026-12-05", items: [] },
          { id: "day-3", date: "2026-12-06", items: [] },
        ],
      }),
      summary: "",
      incompleteDays: [3, 2],
    })
    renderCreate()
    await pickCity("Lis", /Lisbon/)
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-9")
    expect(screen.getByTestId("notice")).toHaveTextContent(
      "Drafted 2 stops, but not every day. Days 2, 3 need another go: open each and use “Ideas for this day”.",
    )
  })

  it("shows how long the draft has run, and lets the traveller stop waiting", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] })
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"))
    mockGenerateItinerary.mockReturnValue(new Promise(() => {}))
    renderCreate()
    await pickCity("Lis", /Lisbon/)
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))

    const stop = await screen.findByRole("button", { name: "Stop" })
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/trips")
    expect(screen.getByRole("status")).toHaveTextContent("Drafting the itinerary with AI…")
    expect(screen.getAllByText("Drafting the itinerary · 0 s").length).toBeGreaterThan(0)

    act(() => vi.advanceTimersByTime(48_000))
    expect(screen.getAllByText("Still drafting · 48 s · long trips can take a few minutes").length).toBeGreaterThan(0)
    // The live region speaks the change once, not every second.
    expect(screen.getByRole("status")).toHaveTextContent("Still drafting. Long trips can take a few minutes.")

    const signal = mockGenerateItinerary.mock.calls[0]![3] as AbortSignal
    fireEvent.click(stop)
    expect(signal.aborted).toBe(true)
    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-9")
    expect(screen.getByTestId("notice")).toHaveTextContent(/You stopped waiting for the AI draft\. It may still finish/)
  })

  it("carries a shared Instagram post onto the new trip", async () => {
    const post = "https://www.instagram.com/p/ABC123/"
    renderCreate(`/trips/new?ai=0&instagram=${encodeURIComponent(post)}`)
    expect(screen.getByText(/the places from the Instagram post you shared go straight onto it/)).toBeInTheDocument()
    await pickCity("Lis", /Lisbon/)
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))

    expect(await screen.findByTestId("path")).toHaveTextContent("/trips/lisbon-9")
    expect(screen.getByTestId("search")).toHaveTextContent(`?instagram=${encodeURIComponent(post)}`)
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

  it("does not pull the traveller to the new trip once they have left the page", async () => {
    let finish!: (value: unknown) => void
    mockGenerateItinerary.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    function Leave() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate("/elsewhere")}>
          Leave
        </button>
      )
    }
    render(
      <MemoryRouter initialEntries={["/trips/new"]}>
        <Leave />
        <Routes>
          <Route path="/trips/new" element={<TripCreate />} />
          <Route path="/trips/:tripId" element={<Landing />} />
          <Route path="/elsewhere" element={<p>Somewhere else</p>} />
        </Routes>
      </MemoryRouter>,
    )
    await pickCity("Lis", /Lisbon/)
    fireEvent.click(screen.getByRole("button", { name: "Create and draft itinerary" }))
    await waitFor(() => expect(mockGenerateItinerary).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole("button", { name: "Leave" }))
    expect(screen.getByText("Somewhere else")).toBeInTheDocument()
    await act(async () => {
      finish({ trip: makeTrip({ id: "trip-9" }) })
    })

    expect(screen.getByText("Somewhere else")).toBeInTheDocument()
    expect(screen.queryByTestId("path")).toBeNull()
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

  it("creates the trip with dates picked from the calendar", async () => {
    renderCreate("/trips/new?ai=0")
    await pickCity("Lis", /Lisbon/)

    fireEvent.click(dates())
    const calendar = within(screen.getByRole("dialog", { name: "Choose dates" }))
    fireEvent.click(calendar.getByRole("button", { name: "Thursday, December 10, 2026" }))
    fireEvent.click(calendar.getByRole("button", { name: "Monday, December 14, 2026" }))

    expect(screen.queryByRole("dialog", { name: "Choose dates" })).toBeNull()
    expect(dates()).toHaveAccessibleName("Dates: Thu, Dec 10 → Mon, Dec 14, 5 days. Change dates")
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))

    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    expect(mockCreateTrip.mock.calls[0]![1]).toMatchObject({ startDate: "2026-12-10", endDate: "2026-12-14" })
  })

  it("sets the trip length from a preset", async () => {
    renderCreate("/trips/new?ai=0")
    await pickCity("Lis", /Lisbon/)
    expect(screen.getByRole("button", { name: "5 days" })).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "1 week" }))
    expect(screen.getByRole("button", { name: "1 week" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "5 days" })).toHaveAttribute("aria-pressed", "false")
    expect(dates()).toHaveAccessibleName("Dates: Fri, Dec 4 → Thu, Dec 10, 7 days. Change dates")

    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1))
    expect(mockCreateTrip.mock.calls[0]![1]).toMatchObject({ startDate: "2026-12-04", endDate: "2026-12-10" })
  })

  it("refuses a trip longer than 60 days", async () => {
    renderCreate("/trips/new?ai=0")
    await pickCity("Lis", /Lisbon/)

    fireEvent.click(dates())
    const calendar = within(screen.getByRole("dialog", { name: "Choose dates" }))
    fireEvent.click(calendar.getByRole("button", { name: "Friday, December 4, 2026" }))
    fireEvent.click(calendar.getByRole("button", { name: "Next month" }))
    fireEvent.click(calendar.getByRole("button", { name: "Next month" }))
    fireEvent.click(calendar.getByRole("button", { name: "Sunday, February 28, 2027" }))

    expect(screen.getByRole("alert")).toHaveTextContent("Trips can run up to 60 days. Shorten the range, or split it into two trips.")
    expect(dates()).toHaveAttribute("aria-invalid", "true")
    fireEvent.click(screen.getByRole("button", { name: "Create trip" }))
    expect(mockCreateTrip).not.toHaveBeenCalled()
  })
})
