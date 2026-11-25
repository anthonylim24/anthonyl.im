import { describe, expect, it } from "vitest"
import { holds, isBookingDetail, STOP_FIELDS } from "../workspace/stopFields"
import { makeItem } from "./tripFixtures"

describe("a stop's editor fields", () => {
  it("asks every place for a time, a location and notes, and keeps the rest behind chips", () => {
    expect(STOP_FIELDS.place.always).toEqual(["time", "location", "notes"])
    expect(STOP_FIELDS.place.optional).toEqual(["status", "cost", "links"])
    expect(STOP_FIELDS.note.always).toEqual([])
  })

  it("shows an optional field once it holds something", () => {
    const bare = makeItem({ title: "Gallery" })
    expect(["status", "cost", "links"].filter((f) => holds(bare, f as never))).toEqual([])
    const full = makeItem({ title: "Gallery", status: "optional", cost: { amount: 12, currency: "EUR" }, links: ["https://example.com"] })
    expect(["status", "cost", "links"].every((f) => holds(full, f as never))).toBe(true)
  })

  it("keeps a booking's details behind their chip only while one is empty", () => {
    const flight = (more = {}) => makeItem({ kind: "reservation", reservation: { type: "flight", status: "confirmed", ...more } })
    expect(isBookingDetail("flight", "seat")).toBe(true)
    expect(isBookingDetail("stay", "seat")).toBe(false)
    expect(holds(flight({ seat: "14A" }), "details")).toBe(false)
    const every = { provider: "HA", number: "HA 11", from: "SFO", to: "HNL", terminal: "2", endTimezone: "Pacific/Honolulu", seat: "14A", confirmation: "X", contact: "c", url: "https://x.example" }
    expect(holds(flight(every), "details")).toBe(true)
  })
})
