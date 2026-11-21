import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { makeTrip } from "../../__tests__/tripFixtures"
import { EssentialsPanel } from "../EssentialsPanel"

const NOW = new Date("2026-07-10T03:00:00Z")

describe("EssentialsPanel", () => {
  it("shows Korea's essentials", () => {
    const trip = makeTrip({ destinations: ["South Korea — Seoul + Busan"], timezone: "Asia/Seoul" })
    render(<EssentialsPanel trip={trip} now={NOW} viewerZone="America/Los_Angeles" />)
    const korea = screen.getByRole("region", { name: "South Korea" })
    const k = within(korea)
    expect(k.getByText(/^Fri 12:00\sPM$/)).toBeInTheDocument()
    expect(k.getByText("16 h ahead of you")).toBeInTheDocument()
    expect(k.getByText("South Korean won")).toBeInTheDocument()
    expect(k.getByText("KRW")).toBeInTheDocument()
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
})
