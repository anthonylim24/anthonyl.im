import { describe, expect, it } from "vitest"
import type { ItineraryItem, TripDay } from "../../types"
import { bookingForm, bookingTypeLabel, bookingTypeOptions } from "../kinds"
import { bookingLines, cleanLinkInput, contactHref, dayOffsetLabel, httpsUrl } from "../lines"

const trip = { timezone: "America/Los_Angeles" }
const day: TripDay = { id: "day-1", date: "2026-12-20", items: [] }

function booking(reservation: ItineraryItem["reservation"], extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return { id: "b1", kind: "reservation", title: "Booking", status: "booked", createdBy: "user", reservation, ...extra }
}

describe("bookingLines", () => {
  it("reads a flight that lands the next day in another zone", () => {
    const flight = booking(
      { type: "flight", status: "confirmed", provider: "Hawaiian Airlines", number: "HA 11", from: "SFO", to: "HNL", endDate: "2026-12-21", endTimezone: "Pacific/Honolulu", terminal: "T2", seat: "14A" },
      { time: "22:10", endTime: "13:40" },
    )
    expect(bookingLines(flight, { trip, day })).toEqual(["HA 11 · SFO → HNL · lands 13:40 HST (+1 day)", "Hawaiian Airlines · Terminal 2 · Seat 14A"])
  })

  it("leaves the zone out when the flight lands in the day's own zone, and says nothing of a landing it doesn't know", () => {
    const sameZone = booking({ type: "flight", status: "confirmed", number: "AS 1", endTimezone: "America/Los_Angeles" }, { endTime: "09:05" })
    expect(bookingLines(sameZone, { trip, day })).toEqual(["AS 1 · lands 09:05"])
    const noLanding = booking({ type: "flight", status: "confirmed", provider: "United" })
    expect(bookingLines(noLanding, { trip, day })).toEqual(["United"])
  })

  it("counts back across the date line", () => {
    const west = booking({ type: "flight", status: "confirmed", number: "JL 784", from: "NRT", to: "HNL", endDate: "2026-12-19" }, { endTime: "10:15" })
    expect(bookingLines(west, { trip, day })[0]).toBe("JL 784 · NRT → HNL · lands 10:15 (−1 day)")
  })

  it("reads a stay's nights and check-out", () => {
    const stay = booking({ type: "hotel", status: "confirmed", endDate: "2026-12-24" }, { time: "15:00", endTime: "11:00" })
    expect(bookingLines(stay, { trip, day })).toEqual(["4 nights · Check-out Thu 24 Dec, 11:00"])
    const oneNight = booking({ type: "Hotel check-in", status: "confirmed", endDate: "2026-12-21", provider: "Booking.com" })
    expect(bookingLines(oneNight, { trip, day })).toEqual(["1 night · Check-out Mon 21 Dec", "Booked with Booking.com"])
  })

  it("reads a car's pick-up and drop-off", () => {
    const car = booking(
      { type: "car", status: "confirmed", provider: "Hertz", from: "OGG", to: "Kahului Airport", endDate: "2026-12-26" },
      { time: "10:00", endTime: "10:00" },
    )
    expect(bookingLines(car, { trip, day })).toEqual(["Hertz · pick up at OGG", "Drop off at Kahului Airport · Sat 26 Dec, 10:00"])
  })

  it("reads a train", () => {
    const train = booking({ type: "train", status: "confirmed", provider: "JR Central", number: "Nozomi 21", from: "Tokyo", to: "Kyoto", seat: "7-12A" }, { endTime: "11:15" })
    expect(bookingLines(train, { trip, day })).toEqual(["Nozomi 21 · Tokyo → Kyoto · arrives 11:15", "JR Central · Seat 7-12A"])
  })

  it("has nothing to add for a table with no details", () => {
    expect(bookingLines(booking({ type: "meal", status: "confirmed" }), { trip, day })).toEqual([])
    expect(bookingLines(booking(undefined), { trip, day })).toEqual([])
  })
})

describe("dayOffsetLabel", () => {
  it("says nothing for the same day", () => {
    expect(dayOffsetLabel(0)).toBe("")
    expect(dayOffsetLabel(2)).toBe(" (+2 days)")
  })
})

describe("bookingForm", () => {
  it("never reads a car rental as a place to sleep", () => {
    expect(bookingForm("car")).toBe("car")
    expect(bookingForm("Car rental")).toBe("car")
    expect(bookingForm("rental")).toBe("stay")
    expect(bookingForm("Hotel check-in")).toBe("stay")
    expect(bookingForm("transit")).toBe("ride")
    expect(bookingForm("ferry")).toBe("ride")
    expect(bookingForm("meal")).toBe("plain")
    expect(bookingForm("wedding")).toBe("plain")
    expect(bookingForm(undefined)).toBe("plain")
  })

  it("labels types in plain words and keeps a type the list doesn't know", () => {
    expect(bookingTypeLabel("hotel")).toBe("Stay")
    expect(bookingTypeLabel("wedding")).toBe("Wedding")
    expect(bookingTypeLabel(undefined)).toBe("Booking")
    expect(bookingTypeOptions("wedding")[0]).toBe("wedding")
    expect(bookingTypeOptions("flight")).not.toContain("wedding")
  })
})

describe("contactHref", () => {
  it("calls a phone number and mails an address", () => {
    expect(contactHref("+1 (808) 923-2311")).toBe("tel:+18089232311")
    expect(contactHref("808.923.2311")).toBe("tel:8089232311")
    expect(contactHref("+81 3-1234-5678")).toBe("tel:+81312345678")
    expect(contactHref("stay@halekulani.com")).toBe("mailto:stay@halekulani.com")
  })

  it("links nothing else", () => {
    for (const text of ["Front desk", "ABC123", "12345", "2026-12-24", "Call 808-923-2311", "", "1234567890123456"]) {
      expect(contactHref(text)).toBeNull()
    }
  })
})

describe("links", () => {
  it("links https only", () => {
    expect(httpsUrl("https://www.hawaiianairlines.com/manage")).toBe("https://www.hawaiianairlines.com/manage")
    for (const text of ["http://example.com", "javascript:alert(1)", "data:text/html,hi", "ftp://x.com", "example.com", "https://", ""]) {
      expect(httpsUrl(text)).toBeNull()
    }
  })

  it("tidies a typed link, and refuses one that is not https", () => {
    expect(cleanLinkInput("example.com/b/123")).toEqual({ ok: true, value: "https://example.com/b/123" })
    expect(cleanLinkInput("  ")).toEqual({ ok: true, value: undefined })
    expect(cleanLinkInput("http://example.com")).toEqual({ ok: false })
    expect(cleanLinkInput("javascript:alert(1)")).toEqual({ ok: false })
    expect(cleanLinkInput("call the desk")).toEqual({ ok: false })
  })
})
