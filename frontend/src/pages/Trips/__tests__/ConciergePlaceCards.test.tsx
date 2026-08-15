import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ConciergePlace } from "../../../lib/conciergeGrounding"
import { ConciergePlaceCards } from "../ConciergePlaceCards"
import type { TripDay } from "../types"

vi.mock("../../Korea/placePhoto", () => ({
  lookupPhoto: vi.fn().mockResolvedValue(null),
  lookupGooglePlacePhoto: vi.fn().mockResolvedValue(null),
}))

const days: TripDay[] = [{ id: "day-1", date: "2026-07-10", title: "Arrival", items: [] }]
const ichiran: ConciergePlace = { name: "Ichiran", address: "Shibuya", lat: 35.66, lng: 139.7 }

function renderCards() {
  render(
    <ConciergePlaceCards
      places={[ichiran]}
      days={days}
      addedKeys={new Set()}
      addingKey={null}
      canEdit={false}
      variant="suggest"
      onPhotos={vi.fn()}
    />,
  )
}

function stubUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value })
}

describe("ConciergePlaceCards map chip", () => {
  const originalUserAgent = window.navigator.userAgent

  afterEach(() => {
    stubUserAgent(originalUserAgent)
  })

  it("opens Google Maps on non-Apple browsers", () => {
    stubUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36")
    renderCards()
    const map = screen.getByRole("link", { name: "Open Ichiran in Google Maps" })
    expect(map).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=35.66,139.7")
    expect(map).toHaveAttribute("target", "_blank")
    expect(screen.queryByRole("button", { name: /Map Mode/ })).toBeNull()
  })

  it("opens Apple Maps on iPhone", () => {
    stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")
    renderCards()
    const map = screen.getByRole("link", { name: "Open Ichiran in Apple Maps" })
    expect(map).toHaveAttribute("href", "https://maps.apple.com/?ll=35.66,139.7&q=Ichiran%2C%20Shibuya")
    expect(map).toHaveAttribute("target", "_blank")
  })
})
