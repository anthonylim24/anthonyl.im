import { describe, expect, test } from "bun:test"
import { koreaSnapshot } from "../data/koreaSnapshot"
import { buildKoreaTrip, KOREA_TRIP_ID } from "./koreaTrip"

describe("buildKoreaTrip", () => {
  const trip = buildKoreaTrip()

  test("preserves trip metadata", () => {
    expect(trip.id).toBe(KOREA_TRIP_ID)
    expect(trip.name).toBe(koreaSnapshot.trip.title)
    expect(trip.startDate).toBe(koreaSnapshot.trip.startDate)
    expect(trip.endDate).toBe(koreaSnapshot.trip.endDate)
    expect(trip.timezone).toBe("Asia/Seoul")
    expect(trip.sharedWithAllUsers).toBe(true)
    expect(trip.destinations).toContain("Seoul")
    expect(trip.destinations).toContain("Busan")
  })

  test("converts every snapshot day with matching slug and date", () => {
    expect(trip.days.length).toBe(koreaSnapshot.days.length)
    for (const day of koreaSnapshot.days) {
      const converted = trip.days.find((d) => d.id === day.slug)
      expect(converted).toBeDefined()
      expect(converted!.date).toBe(day.date)
      expect(converted!.title).toBe(day.title)
      expect(converted!.city).toBe(day.city)
    }
  })

  test("every day-assigned reservation appears exactly once on the right day", () => {
    for (const r of koreaSnapshot.reservations) {
      if (!r.dayNumber) continue
      const day = koreaSnapshot.days.find((d) => d.n === r.dayNumber)!
      const converted = trip.days.find((d) => d.id === day.slug)!
      const matches = converted.items.filter((i) => i.id === `res-${r.id}`)
      expect(matches.length).toBe(1)
      expect(matches[0]!.kind).toBe("reservation")
      expect(matches[0]!.title).toBe(r.title)
    }
  })

  test("preserves every section bullet in section item notes", () => {
    for (const day of koreaSnapshot.days) {
      const converted = trip.days.find((d) => d.id === day.slug)!
      const sectionNotes = converted.items
        .filter((i) => i.kind === "section")
        .map((i) => i.notes ?? "")
        .join("\n")
      for (const section of day.sections) {
        for (const bullet of section.bullets) {
          expect(sectionNotes).toContain(bullet)
        }
      }
    }
  })

  test("place items carry structured coordinates", () => {
    let placeCount = 0
    for (const day of trip.days) {
      for (const item of day.items) {
        if (item.kind !== "place") continue
        placeCount++
        expect(item.location).toBeDefined()
        expect(typeof item.location!.lat).toBe("number")
        expect(typeof item.location!.lng).toBe("number")
        expect(item.location!.source).toBe("migration")
      }
    }
    expect(placeCount).toBeGreaterThan(10)
  })

  test("items have unique ids within the trip", () => {
    const ids = trip.days.flatMap((d) => d.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("dossier display data", () => {
  const trip = buildKoreaTrip()

  test("carries trip appearance theming", () => {
    expect(trip.appearance?.accent).toBe("rose")
    expect(trip.appearance?.subtitle).toContain("Seoul")
    expect(trip.appearance?.headline).toBe(koreaSnapshot.status.headline)
    expect(trip.appearance?.cityTags?.Seoul).toBe("SE")
  })

  test("carries day neighborhoods, weather, and structured callouts", () => {
    for (const day of koreaSnapshot.days) {
      const converted = trip.days.find((d) => d.id === day.slug)!
      if (day.neighborhoods.length) expect(converted.neighborhoods).toEqual(day.neighborhoods)
      if (day.weather) expect(converted.weather).toEqual(day.weather)
      if (day.callouts?.length) {
        expect(converted.callouts?.length).toBe(day.callouts.length)
        expect(converted.callouts?.[0]).toMatchObject({ tone: day.callouts[0]!.tone, body: day.callouts[0]!.body })
      }
    }
  })
})
