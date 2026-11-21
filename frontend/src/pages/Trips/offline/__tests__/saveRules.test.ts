import { describe, expect, it } from "vitest"
import { clip, describeSanitized, sanitizeForSave } from "../sanitize"
import { describeRefusal } from "../saveIssues"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import type { Trip } from "../../types"

const withStop = (trip: Trip, overrides: Parameters<typeof makeItem>[0]): Trip => ({
  ...trip,
  days: [{ ...trip.days[0]!, items: [makeItem(overrides)] }, ...trip.days.slice(1)],
})

describe("sanitizeForSave", () => {
  const saved = makeTrip()

  it("returns the same trip when everything fits", () => {
    const trip = withStop(saved, { title: "Time Out Market", time: "12:30" })
    const out = sanitizeForSave(trip, saved)
    expect(out.trip).toBe(trip)
    expect(out).toMatchObject({ shortened: [], keptName: null })
    expect(describeSanitized(out)).toBeNull()
  })

  it("keeps the last saved name when the name is blank", () => {
    const out = sanitizeForSave({ ...saved, name: "  " }, saved)
    expect(out.trip.name).toBe("Lisbon Long Weekend")
    expect(out.keptName).toBe("Lisbon Long Weekend")
    expect(describeSanitized(out)).toBe("A trip needs a name, so it stays “Lisbon Long Weekend” until you type a new one.")
  })

  it("cuts long text to the server's limits and names what it cut", () => {
    const trip = withStop({ ...saved, name: "n".repeat(170) }, { title: "Fado", notes: "x".repeat(9000), reservation: { type: "meal", status: "confirmed", confirmation: "c".repeat(200) } })
    const out = sanitizeForSave(trip, saved)
    expect(out.trip.name).toHaveLength(160)
    const item = out.trip.days[0]!.items[0]!
    expect(item.notes).toHaveLength(8000)
    expect(item.reservation!.confirmation).toHaveLength(120)
    expect(out.shortened).toEqual(["the trip name", "the notes of “Fado” (day 1)", "the confirmation number of “Fado” (day 1)"])
    expect(describeSanitized(out)).toBe(
      "Some text was longer than a trip can hold, so the end was cut from the trip name, the notes of “Fado” (day 1) and 1 more.",
    )
  })

  it("caps lists of short strings and drops values the server can't read", () => {
    const trip = withStop(
      { ...saved, destinations: [...Array.from({ length: 22 }, (_, i) => `City ${i}`), " "], tags: ["", "food"] },
      { time: "9am", endTime: "25:61:00", cost: { amount: -5, currency: "EUR" }, location: { name: "Somewhere", lat: 200, lng: 10, source: "user" } },
    )
    const out = sanitizeForSave(trip, saved)
    expect(out.trip.destinations).toHaveLength(20)
    expect(out.trip.tags).toEqual(["food"])
    const item = out.trip.days[0]!.items[0]!
    expect(item.time).toBeUndefined()
    expect(item.endTime).toBeUndefined()
    expect(item.cost).toBeUndefined()
    expect(item.location).toMatchObject({ name: "Somewhere", lat: undefined, lng: undefined })
    expect(out.shortened).toContain("the list of destinations (20 at most)")
  })

  it("falls back to the saved destinations, time zone and link name when the new ones can't be stored", () => {
    const out = sanitizeForSave({ ...saved, destinations: ["  "], timezone: "", slug: "Not A Slug" }, { ...saved, slug: "lisbon" })
    expect(out.trip.destinations).toEqual(["Lisbon"])
    expect(out.trip.timezone).toBe("Europe/Lisbon")
    expect(out.trip.slug).toBe("lisbon")
  })

  it("never drops a stop", () => {
    const many = Array.from({ length: 205 }, (_, i) => makeItem({ id: `s${i}` }))
    const trip = { ...saved, days: [{ ...saved.days[0]!, items: many }, saved.days[1]!] }
    expect(sanitizeForSave(trip, saved).trip.days[0]!.items).toHaveLength(205)
  })

  it("does not split an emoji when it cuts", () => {
    expect(clip("ab😀", 3)).toBe("ab")
    expect(clip("ab😀", 4)).toBe("ab😀")
  })
})

describe("describeRefusal", () => {
  it("names the field from the server's issues, in words", () => {
    expect(
      describeRefusal({
        error: "invalid update",
        issues: [{ origin: "string", code: "too_big", maximum: 300, path: ["days", 2, "items", 4, "title"], message: "Too big" }],
      }),
    ).toBe("The title of a stop on day 3 is too long (300 characters at most).")
    expect(describeRefusal({ issues: [{ origin: "string", code: "too_small", minimum: 1, path: ["name"] }] })).toBe("The trip name can’t be empty.")
    expect(describeRefusal({ issues: [{ code: "custom", path: ["slug"], message: "that permalink is reserved" }] })).toBe(
      "The trip’s link name can’t be saved: that permalink is reserved.",
    )
  })

  it("counts the other problems instead of listing them", () => {
    const issue = { origin: "array", code: "too_big", maximum: 20, path: ["destinations"] }
    expect(describeRefusal({ issues: [issue, issue, issue] })).toBe(
      "The list of destinations has too many entries (20 at most), and 2 other things need fixing.",
    )
  })

  it("says something useful without issues, and never shows the raw body", () => {
    expect(describeRefusal({ error: "endDate must be on or after startDate" })).toBe("The trip can’t end before it starts.")
    expect(describeRefusal({ error: "invalid update" })).toBe("The server couldn’t store this change.")
    expect(describeRefusal(null)).toBe("The server couldn’t store this change.")
    expect(describeRefusal({ issues: [{ code: "invalid_type", path: ["expenses", 0, "amount"] }] })).toBe("The amount of an expense isn’t valid.")
  })
})
