import { describe, expect, it } from "bun:test"
import { buildKoreaTrip } from "./koreaTrip"
import { updateTripSchema } from "./types"

// Every field the client saves must be in the PATCH schema, or zod strips it
// and the edit silently never persists.
describe("trip document fields", () => {
  it("keeps the planning and on-trip fields through a PATCH", () => {
    const parsed = updateTripSchema.parse({
      ideas: [{ id: "idea-1", kind: "place", title: "Lanikai Beach", status: "none", createdBy: "user" }],
      days: [
        {
          id: "day-1",
          date: "2026-12-20",
          timezone: "Pacific/Honolulu",
          journal: "Swam at sunrise.",
          items: [
            {
              id: "it-1",
              kind: "reservation",
              title: "Flight to Honolulu",
              time: "09:05",
              endTime: "13:40",
              status: "skipped",
              highlight: true,
              reservation: {
                type: "flight",
                status: "confirmed",
                provider: "Hawaiian Airlines",
                number: "HA 11",
                from: "SFO",
                to: "HNL",
                endDate: "2026-12-20",
                endTimezone: "Pacific/Honolulu",
                seat: "23A",
                terminal: "2",
              },
            },
          ],
        },
      ],
    })
    expect(parsed.ideas?.[0]?.title).toBe("Lanikai Beach")
    const day = parsed.days?.[0]
    expect(day?.timezone).toBe("Pacific/Honolulu")
    expect(day?.journal).toBe("Swam at sunrise.")
    const item = day?.items[0]
    expect(item?.status).toBe("skipped")
    expect(item?.highlight).toBe(true)
    expect(item?.reservation).toMatchObject({ provider: "Hawaiian Airlines", number: "HA 11", from: "SFO", to: "HNL", endTimezone: "Pacific/Honolulu" })
  })

  it("still accepts documents written before those fields existed", () => {
    const korea = buildKoreaTrip()
    const parsed = updateTripSchema.safeParse({ days: korea.days, party: korea.party, checklist: korea.checklist })
    expect(parsed.success).toBe(true)
  })

  it("refuses a booking end date that is not an ISO date", () => {
    const parsed = updateTripSchema.safeParse({
      ideas: [{ id: "x", kind: "reservation", title: "Hotel", status: "none", reservation: { type: "hotel", status: "confirmed", endDate: "Dec 24" } }],
    })
    expect(parsed.success).toBe(false)
  })
})
