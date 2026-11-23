import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { makeTrip } from "../../__tests__/tripFixtures"
import { forgetHolidays } from "../../holidays"
import type { ItineraryItem } from "../../types"
import { EssentialsPanel } from "../EssentialsPanel"
import { pickOption } from "../../__tests__/pickOption"

const loadRates = vi.hoisted(() => vi.fn<(base: string, symbols: readonly string[]) => Promise<Record<string, number>>>())
vi.mock("../../budget/rates", () => ({ loadRates }))

const NOW = new Date("2026-07-10T03:00:00Z")

/** Nager.Date: what each `year/CC` answers; anything else is a 404. */
function nager(lists: Record<string, unknown[]>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const key = /PublicHolidays\/(\d{4})\/([A-Z]{2})/.exec(url)
    const body = key ? lists[`${key[1]}/${key[2]}`] : undefined
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response(null, { status: 404 })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  loadRates.mockReset()
  loadRates.mockImplementation(async (base, symbols) => {
    const table: Record<string, number> = { "KRW>USD": 0.00072, "USD>JPY": 150, "JPY>USD": 0.0067 }
    return Object.fromEntries(symbols.flatMap((code) => (table[`${base}>${code}`] ? [[code, table[`${base}>${code}`]]] : [])))
  })
  nager({})
})

afterEach(() => {
  vi.unstubAllGlobals()
  forgetHolidays()
  localStorage.clear()
})

describe("EssentialsPanel", () => {
  it("shows Korea's essentials", () => {
    const trip = makeTrip({ destinations: ["South Korea — Seoul + Busan"], timezone: "Asia/Seoul" })
    render(<EssentialsPanel trip={trip} now={NOW} viewerZone="America/Los_Angeles" />)
    const korea = screen.getByRole("region", { name: "South Korea" })
    const k = within(korea)
    expect(k.getByText(/^Fri 12:00\sPM$/)).toBeInTheDocument()
    expect(k.getByText("16 h ahead of you")).toBeInTheDocument()
    expect(k.getByText("South Korean won")).toHaveTextContent("South Korean won KRW")
    expect(k.getByText("Types C, F")).toBeInTheDocument()
    expect(k.getByText("220 V · 60 Hz")).toBeInTheDocument()
    expect(k.getByRole("link", { name: /Police\s*112/ })).toHaveAttribute("href", "tel:112")
    expect(k.getByRole("link", { name: /Fire and ambulance\s*119/ })).toHaveAttribute("href", "tel:119")
    expect(k.getByText("On the right")).toBeInTheDocument()
    expect(k.getByText("Korean")).toBeInTheDocument()
    expect(k.getByText("+82")).toBeInTheDocument()
  })

  it("gives each country its own section, and names the city in a big country", () => {
    const trip = makeTrip({ destinations: ["Tokyo", "Los Angeles"], timezone: "Asia/Tokyo" })
    render(<EssentialsPanel trip={trip} now={NOW} viewerZone="Asia/Tokyo" />)
    const headings = screen.getAllByRole("heading").map((h) => h.textContent)
    expect(headings).toEqual(["Japan", "United States"])
    expect(within(screen.getByRole("region", { name: "Japan" })).getByText("Same time as you")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "United States" })).getByText(/Los Angeles/)).toBeInTheDocument()
  })

  it("says what to add when it doesn't know the country", () => {
    render(<EssentialsPanel trip={makeTrip({ destinations: ["Somewhere new"], timezone: "UTC" })} now={NOW} viewerZone="UTC" />)
    expect(screen.getByText("Add a country or city as a destination to see local essentials.")).toBeInTheDocument()
    expect(screen.queryByText("Local time")).toBeNull()
  })

  it("still shows the local time for an unknown country in a known zone", () => {
    render(<EssentialsPanel trip={makeTrip({ destinations: ["Tbilisi"], timezone: "Asia/Tbilisi" })} now={NOW} viewerZone="UTC" />)
    expect(screen.getByText("Add a country or city as a destination to see local essentials.")).toBeInTheDocument()
    expect(screen.getByText("Local time")).toBeInTheDocument()
    expect(screen.getByText("4 h ahead of you")).toBeInTheDocument()
  })

  it("leaves out a fact it isn't sure of", () => {
    render(<EssentialsPanel trip={makeTrip({ destinations: ["Maldives"], timezone: "Indian/Maldives" })} now={NOW} viewerZone="UTC" />)
    const maldives = within(screen.getByRole("region", { name: "Maldives" }))
    expect(maldives.getByText("230 V · 50 Hz")).toBeInTheDocument()
    expect(maldives.queryByText(/^Types? /)).toBeNull()
  })

  it("converts between the local money and the viewer's own, both ways", async () => {
    const trip = makeTrip({ destinations: ["South Korea"], timezone: "Asia/Seoul" })
    render(<EssentialsPanel trip={trip} now={NOW} viewerZone="America/Los_Angeles" />)
    const korea = within(screen.getByRole("region", { name: "South Korea" }))
    expect(await korea.findByText("₩10,000 ≈ $7.20 at today’s rate")).toBeInTheDocument()
    expect(loadRates).toHaveBeenCalledWith("KRW", ["USD"])
    const won = korea.getByLabelText("Amount in KRW")
    const dollars = korea.getByLabelText("Amount in USD, your currency")
    fireEvent.change(won, { target: { value: "25000" } })
    expect(dollars).toHaveValue("18")
    fireEvent.change(dollars, { target: { value: "100" } })
    expect(won).toHaveValue("138,889")
    expect(korea.getByRole("combobox", { name: "Your currency" })).toHaveTextContent("USD")
    // Picking the won itself keeps the picker, to change back.
    pickOption(korea.getByRole("combobox", { name: "Your currency" }), /^KRW · /)
    expect(korea.getByRole("combobox", { name: "Your currency" })).toHaveTextContent("KRW")
    expect(korea.getByText("₩1 ≈ ₩1 at today’s rate")).toBeInTheDocument()
    pickOption(korea.getByRole("combobox", { name: "Your currency" }), /^USD · /)
    expect(await korea.findByText("₩10,000 ≈ $7.20 at today’s rate")).toBeInTheDocument()
  })

  it("offers no converter where the money is the viewer's own, and says when there is no rate", async () => {
    const trip = makeTrip({ destinations: ["Tokyo", "Los Angeles"], timezone: "Asia/Tokyo" })
    loadRates.mockResolvedValue({})
    render(<EssentialsPanel trip={trip} now={NOW} viewerZone="Asia/Tokyo" />)
    expect(within(screen.getByRole("region", { name: "Japan" })).queryByLabelText(/^Amount in/)).toBeNull()
    const us = within(screen.getByRole("region", { name: "United States" }))
    expect(await us.findByText("No rate between USD and JPY right now.")).toBeInTheDocument()
    expect(us.getByLabelText("Amount in USD")).toBeDisabled()
  })

  it("puts tonight's place to sleep in large type for a driver", () => {
    const hotel: ItineraryItem = {
      id: "h1",
      kind: "place",
      title: "Hotel Cappuccino",
      status: "none",
      createdBy: "user",
      location: { name: "Hotel Cappuccino", source: "user", category: "hotel", address: "155 Bongeunsa-ro, Gangnam-gu, Seoul", lat: 37.51, lng: 127.04 },
    }
    const trip = makeTrip({
      destinations: ["Seoul"],
      timezone: "Asia/Seoul",
      days: [
        { id: "day-1", date: "2026-07-10", items: [hotel] },
        { id: "day-2", date: "2026-07-11", items: [] },
      ],
    })
    render(<EssentialsPanel trip={trip} now={NOW} viewerZone="Asia/Seoul" />)
    const card = within(screen.getByRole("region", { name: "Show to a driver" }))
    expect(card.getByText("Tonight")).toBeInTheDocument()
    expect(card.getByText("Hotel Cappuccino")).toBeInTheDocument()
    expect(card.getByText("155 Bongeunsa-ro, Gangnam-gu, Seoul")).toBeInTheDocument()
    expect(card.getByRole("link", { name: /Directions/ })).toHaveAttribute("href", expect.stringContaining("37.51"))
  })

  it("lists the public holidays that fall on the trip's days", async () => {
    const fetchMock = nager({
      "2026/KR": [
        { date: "2026-07-10", localName: "제헌절", name: "Constitution Day", countryCode: "KR", global: true, types: ["Public"] },
        { date: "2026-07-11", localName: "지역", name: "A regional day", countryCode: "KR", global: false, types: ["Public"] },
        { date: "2026-10-03", localName: "개천절", name: "National Foundation Day", countryCode: "KR", global: true, types: ["Public"] },
      ],
    })
    const trip = makeTrip({ destinations: ["Seoul"], timezone: "Asia/Seoul" })
    render(<EssentialsPanel trip={trip} now={NOW} viewerZone="Asia/Seoul" />)
    const korea = within(screen.getByRole("region", { name: "South Korea" }))
    expect(await korea.findByText("Constitution Day")).toBeInTheDocument()
    expect(korea.getByText("Public holidays")).toBeInTheDocument()
    expect(korea.queryByText("A regional day")).toBeNull()
    expect(korea.queryByText("National Foundation Day")).toBeNull()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it("shows no holidays line when there is no data", async () => {
    const fetchMock = nager({})
    render(<EssentialsPanel trip={makeTrip({ destinations: ["Seoul"], timezone: "Asia/Seoul" })} now={NOW} viewerZone="Asia/Seoul" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText("Public holidays")).toBeNull()
  })
})
