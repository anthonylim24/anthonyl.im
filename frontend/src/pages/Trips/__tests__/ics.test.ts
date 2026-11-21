import { describe, expect, it, vi } from "vitest"
import { calendarMenuItem } from "../calendar/calendarMenu"
import {
  calendarFileName,
  endFor,
  escapeText,
  eventUid,
  foldLine,
  tripToIcs,
  vtimezone,
  zoneOffsetMinutes,
  zoneTransitions,
} from "../calendar/ics"
import type { ItineraryItem, Trip } from "../types"

const NOW = Date.UTC(2026, 10, 14, 9, 30, 0)
const octets = (s: string) => new TextEncoder().encode(s).length

function stop(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return { id: "it-1", kind: "place", title: "Senso-ji", status: "none", createdBy: "user", ...overrides }
}

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "tokyo",
    slug: "tokyo-2026",
    ownerId: "u1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-11",
    timezone: "Asia/Tokyo",
    status: "draft",
    tags: [],
    collaborators: [],
    days: [
      { id: "d1", date: "2026-07-10", title: "Arrival", items: [stop({ time: "10:00", endTime: "11:30" })] },
      { id: "d2", date: "2026-07-11", items: [stop({ id: "it-2", title: "Tsukiji" })] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    ...overrides,
  }
}

/** Unfolded content lines. */
function lines(text: string): string[] {
  return text.replace(/\r\n /g, "").split("\r\n").filter(Boolean)
}

function events(text: string): string[][] {
  const out: string[][] = []
  let current: string[] | null = null
  for (const line of lines(text)) {
    if (line === "BEGIN:VEVENT") current = []
    else if (line === "END:VEVENT") {
      out.push(current!)
      current = null
    } else current?.push(line)
  }
  return out
}

describe("escapeText", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf")
  })

  it("leaves colons and quotes alone", () => {
    expect(escapeText('Dinner: "omakase"')).toBe('Dinner: "omakase"')
  })
})

describe("foldLine", () => {
  it("leaves a 75-octet line whole", () => {
    const line = "X".repeat(75)
    expect(foldLine(line)).toBe(line)
  })

  it("folds at 75 octets with a leading space on each continuation", () => {
    const folded = foldLine("D".repeat(200))
    const parts = folded.split("\r\n")
    expect(parts.length).toBe(3)
    for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(75)
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true)
    expect(folded.replace(/\r\n /g, "")).toBe("D".repeat(200))
  })

  it("never splits a multi-byte character", () => {
    const line = `SUMMARY:${"한국어 이름 ".repeat(20)}🍜🍣`
    const folded = foldLine(line)
    for (const part of folded.split("\r\n")) {
      expect(octets(part)).toBeLessThanOrEqual(75)
      // A broken sequence would decode to U+FFFD.
      expect(new TextDecoder().decode(new TextEncoder().encode(part))).not.toContain("�")
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line)
  })
})

describe("endFor", () => {
  it("keeps an end later the same day", () => {
    expect(endFor(600, "11:30")).toBe(690)
  })

  it("reads an earlier end as after midnight when the night is short", () => {
    expect(endFor(22 * 60, "01:30")).toBe(1530)
  })

  it("keeps counting on the day's clock for a stop that starts after midnight", () => {
    // A 1 AM club (1500 on the day's clock) that closes at 4.
    expect(endFor(1500, "04:00")).toBe(1680)
  })

  it("drops an end before the start that would make a day-long event", () => {
    expect(endFor(14 * 60, "13:00")).toBeNull()
  })

  it("drops an end equal to the start, or one it cannot read", () => {
    expect(endFor(600, "10:00")).toBeNull()
    expect(endFor(600, "late")).toBeNull()
    expect(endFor(600, undefined)).toBeNull()
  })
})

describe("tripToIcs", () => {
  it("is a calendar with CRLF line endings throughout", () => {
    const { text, events: count } = tripToIcs(trip(), { now: NOW })
    expect(count).toBe(2)
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true)
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
    for (const line of text.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75)
  })

  it("writes a timed stop in the trip's zone, and an untimed one as all day", () => {
    const { text } = tripToIcs(trip(), { now: NOW })
    const [timed, allDay] = events(text)
    expect(timed).toContain("DTSTART;TZID=Asia/Tokyo:20260710T100000")
    expect(timed).toContain("DTEND;TZID=Asia/Tokyo:20260710T113000")
    expect(timed).toContain("DTSTAMP:20261114T093000Z")
    expect(allDay).toContain("DTSTART;VALUE=DATE:20260711")
    expect(allDay).toContain("DTEND;VALUE=DATE:20260712")
    expect(allDay!.some((l) => l.startsWith("DTSTART;TZID"))).toBe(false)
    expect(lines(text)).toContain("BEGIN:VTIMEZONE")
    expect(lines(text)).toContain("TZID:Asia/Tokyo")
  })

  it("gives a start with no end a default length", () => {
    const t = trip({ days: [{ id: "d1", date: "2026-07-10", items: [stop({ time: "09:05" })] }] })
    const [event] = events(tripToIcs(t, { now: NOW }).text)
    expect(event).toContain("DTSTART;TZID=Asia/Tokyo:20260710T090500")
    expect(event).toContain("DURATION:PT1H")
    expect(event!.some((l) => l.startsWith("DTEND"))).toBe(false)
  })

  it("carries an overnight end to the next day", () => {
    const t = trip({ days: [{ id: "d1", date: "2026-07-31", items: [stop({ time: "22:00", endTime: "01:00" })] }] })
    const [event] = events(tripToIcs(t, { now: NOW }).text)
    expect(event).toContain("DTEND;TZID=Asia/Tokyo:20260801T010000")
  })

  it("uses a default length when the end is before the start", () => {
    const t = trip({ days: [{ id: "d1", date: "2026-07-10", items: [stop({ time: "14:00", endTime: "13:00" })] }] })
    const [event] = events(tripToIcs(t, { now: NOW }).text)
    expect(event).toContain("DURATION:PT1H")
  })

  it("escapes text and adds location, coordinates and details", () => {
    const t = trip({
      days: [
        {
          id: "d1",
          date: "2026-07-10",
          title: "Food, mostly",
          items: [
            stop({
              title: "Sushi; Dai, Tsukiji",
              time: "19:00",
              notes: "Queue early\nCash only",
              links: ["https://example.com/a,b"],
              location: { name: "Sushi Dai", address: "5-2-1 Tsukiji, Chuo City", lat: 35.6655, lng: 139.7707, source: "ai" },
              reservation: { type: "restaurant", status: "confirmed", confirmation: "AB12" },
            }),
          ],
        },
      ],
    })
    const [event] = events(tripToIcs(t, { now: NOW }).text)
    expect(event).toContain("SUMMARY:Sushi\\; Dai\\, Tsukiji")
    expect(event).toContain("LOCATION:Sushi Dai\\, 5-2-1 Tsukiji\\, Chuo City")
    expect(event).toContain("GEO:35.665500;139.770700")
    expect(event).toContain("DESCRIPTION:Queue early\\nCash only\\nConfirmation: AB12\\nhttps://example.com/a\\,b")
    expect(event).toContain("STATUS:CONFIRMED")
    expect(event).toContain("CATEGORIES:Food\\, mostly")
  })

  it("leaves GEO out when a stop has no coordinates", () => {
    const t = trip({ days: [{ id: "d1", date: "2026-07-10", items: [stop({ location: { name: "Somewhere", source: "user" } })] }] })
    const [event] = events(tripToIcs(t, { now: NOW }).text)
    expect(event).toContain("LOCATION:Somewhere")
    expect(event!.some((l) => l.startsWith("GEO"))).toBe(false)
  })

  it("keeps UIDs stable across exports, so a re-import updates", () => {
    const first = events(tripToIcs(trip(), { now: NOW }).text)
    const later = events(tripToIcs(trip({ updatedAt: "2026-03-01T00:00:00Z" }), { now: NOW + 86_400_000 }).text)
    const uid = (e: string[]) => e.find((l) => l.startsWith("UID:"))
    expect(first.map(uid)).toEqual(later.map(uid))
    expect(uid(first[0]!)).toBe(`UID:${eventUid({ id: "tokyo" }, { id: "it-1" })}`)
    const seq = (e: string[]) => Number(e.find((l) => l.startsWith("SEQUENCE:"))!.slice(9))
    expect(seq(later[0]!)).toBeGreaterThan(seq(first[0]!))
    expect(seq(later[0]!)).toBeLessThan(2 ** 31)
  })

  it("skips headings and untimed notes, and keeps timed notes", () => {
    const t = trip({
      days: [
        {
          id: "d1",
          date: "2026-07-10",
          items: [
            stop({ id: "s", kind: "section", title: "Morning" }),
            stop({ id: "n1", kind: "note", title: "Bring cash" }),
            stop({ id: "n2", kind: "note", title: "Check out", time: "11:00" }),
          ],
        },
      ],
    })
    const out = tripToIcs(t, { now: NOW })
    expect(out.events).toBe(1)
    expect(events(out.text)[0]).toContain("SUMMARY:Check out")
  })

  it("exports one day on its own", () => {
    const out = tripToIcs(trip(), { now: NOW, dayId: "d2" })
    expect(out.events).toBe(1)
    expect(lines(out.text)).toContain("X-WR-CALNAME:Tokyo Long Weekend · 2026-07-11")
    // No timed stop, so no zone definition is needed.
    expect(lines(out.text)).not.toContain("BEGIN:VTIMEZONE")
  })

  it("falls back to floating times for a zone it does not know", () => {
    const [event] = events(tripToIcs(trip({ timezone: "Mars/Olympus" }), { now: NOW }).text)
    expect(event).toContain("DTSTART:20260710T100000")
    expect(tripToIcs(trip({ timezone: "Mars/Olympus" }), { now: NOW }).text).not.toContain("VTIMEZONE")
  })

  it("defines the summer-time change for a trip that crosses it", () => {
    const t = trip({
      timezone: "America/New_York",
      days: [
        { id: "d1", date: "2026-03-07", items: [stop({ time: "10:00" })] },
        { id: "d2", date: "2026-03-08", items: [stop({ id: "it-2", time: "10:00" })] },
      ],
    })
    const all = lines(tripToIcs(t, { now: NOW }).text)
    const tz = all.slice(all.indexOf("BEGIN:VTIMEZONE"), all.indexOf("END:VTIMEZONE") + 1)
    expect(tz).toEqual([
      "BEGIN:VTIMEZONE",
      "TZID:America/New_York",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0500",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "DTSTART:20260308T020000",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0400",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
    ])
    expect(all).toContain("DTSTART;TZID=America/New_York:20260308T100000")
  })

  it("puts a stop after midnight on the next date, on the day's own clock", () => {
    const t = trip({
      days: [
        {
          id: "d1",
          date: "2026-07-31",
          items: [
            stop({ id: "dinner", title: "Dinner", time: "19:00", endTime: "21:00" }),
            stop({ id: "bar", title: "Bar", time: "23:00" }),
            stop({ id: "club", title: "Club", time: "01:00", endTime: "04:00" }),
          ],
        },
      ],
    })
    const [, bar, club] = events(tripToIcs(t, { now: NOW }).text)
    expect(bar).toContain("DTSTART;TZID=Asia/Tokyo:20260731T230000")
    expect(club).toContain("DTSTART;TZID=Asia/Tokyo:20260801T010000")
    expect(club).toContain("DTEND;TZID=Asia/Tokyo:20260801T040000")
  })

  it("ends a cross-zone flight at its arrival, in the arrival zone", () => {
    const flight = (id: string, time: string, endTime: string, reservation: Partial<NonNullable<ItineraryItem["reservation"]>>) =>
      stop({
        id,
        kind: "reservation",
        title: id,
        time,
        endTime,
        status: "booked",
        reservation: { type: "flight", status: "confirmed", ...reservation },
      })
    const t = trip({
      timezone: "America/Los_Angeles",
      days: [
        // SFO 08:00 PDT → HNL 10:45 HST, the same date.
        { id: "d1", date: "2026-07-10", items: [flight("SFO-HNL", "08:00", "10:45", { endTimezone: "Pacific/Honolulu" })] },
        // HNL 13:00 HST → Tokyo 16:30 JST the next date: earlier on the clock than the old 12-hour guess allowed.
        {
          id: "d2",
          date: "2026-07-12",
          timezone: "Pacific/Honolulu",
          items: [flight("HNL-NRT", "13:00", "16:30", { endTimezone: "Asia/Tokyo" })],
        },
        // LAX 22:30 → SYD 06:45 two dates later, with the date given.
        {
          id: "d3",
          date: "2026-07-20",
          items: [flight("LAX-SYD", "22:30", "06:45", { endTimezone: "Australia/Sydney", endDate: "2026-07-22" })],
        },
      ],
    })
    const text = tripToIcs(t, { now: NOW }).text
    const [sfo, hnl, lax] = events(text)
    expect(sfo).toContain("DTSTART;TZID=America/Los_Angeles:20260710T080000")
    expect(sfo).toContain("DTEND;TZID=Pacific/Honolulu:20260710T104500")
    expect(hnl).toContain("DTSTART;TZID=Pacific/Honolulu:20260712T130000")
    expect(hnl).toContain("DTEND;TZID=Asia/Tokyo:20260713T163000")
    expect(lax).toContain("DTEND;TZID=Australia/Sydney:20260722T064500")
    // One VTIMEZONE for each zone an event is written in.
    const zones = lines(text).filter((l) => l.startsWith("TZID:"))
    expect(zones.sort()).toEqual(["TZID:America/Los_Angeles", "TZID:Asia/Tokyo", "TZID:Australia/Sydney", "TZID:Pacific/Honolulu"])
  })

  it("reads an arrival that lands before it leaves as no arrival", () => {
    const t = trip({
      days: [
        {
          id: "d1",
          date: "2026-07-10",
          items: [
            stop({
              kind: "reservation",
              time: "10:00",
              endTime: "09:00",
              reservation: { type: "flight", status: "confirmed", endTimezone: "Asia/Tokyo", endDate: "2026-07-10" },
            }),
          ],
        },
      ],
    })
    const [event] = events(tripToIcs(t, { now: NOW }).text)
    expect(event).toContain("DURATION:PT1H")
  })

  it("writes each day in its own zone", () => {
    const t = trip({
      days: [
        { id: "d1", date: "2026-07-10", items: [stop({ time: "10:00" })] },
        { id: "d2", date: "2026-07-11", timezone: "Asia/Seoul", items: [stop({ id: "it-2", time: "10:00" })] },
      ],
    })
    const text = tripToIcs(t, { now: NOW }).text
    const [tokyo, seoul] = events(text)
    expect(tokyo).toContain("DTSTART;TZID=Asia/Tokyo:20260710T100000")
    expect(seoul).toContain("DTSTART;TZID=Asia/Seoul:20260711T100000")
    expect(lines(text).filter((l) => l.startsWith("TZID:"))).toEqual(["TZID:Asia/Tokyo", "TZID:Asia/Seoul"])
  })

  it("reminds three hours before a flight and an hour before other bookings, never for ordinary stops", () => {
    const t = trip({
      days: [
        {
          id: "d1",
          date: "2026-07-10",
          items: [
            stop({ id: "fl", kind: "reservation", title: "NH 7", time: "08:00", reservation: { type: "flight", status: "confirmed" } }),
            stop({ id: "meal", kind: "reservation", title: "Sushi", time: "19:00", reservation: { type: "meal", status: "confirmed" } }),
            stop({ id: "museum", title: "Museum", time: "12:00", status: "booked" }),
            stop({ id: "walk", title: "Walk", time: "15:00" }),
            stop({ id: "hotel", kind: "reservation", title: "Hotel", reservation: { type: "hotel", status: "confirmed" } }),
            stop({ id: "gone", kind: "reservation", title: "Show", time: "21:00", status: "skipped", reservation: { type: "event", status: "confirmed" } }),
          ],
        },
      ],
    })
    const [flight, meal, museum, walk, hotel, gone] = events(tripToIcs(t, { now: NOW }).text)
    const triggers = (event: string[] | undefined) => event!.filter((l) => l.startsWith("TRIGGER:"))
    expect(triggers(flight)).toEqual(["TRIGGER:-PT3H"])
    expect(flight).toContain("ACTION:DISPLAY")
    expect(flight!.indexOf("BEGIN:VALARM")).toBeLessThan(flight!.indexOf("END:VALARM"))
    expect(triggers(meal)).toEqual(["TRIGGER:-PT1H"])
    expect(triggers(museum)).toEqual(["TRIGGER:-PT1H"])
    expect(triggers(walk)).toEqual([])
    // All day: no hour to ring at.
    expect(triggers(hotel)).toEqual([])
    // Skipped: cancelled, and silent.
    expect(triggers(gone)).toEqual([])
    expect(gone).toContain("STATUS:CANCELLED")
  })
})

describe("time zones", () => {
  it("reads offsets either side of a change", () => {
    expect(zoneOffsetMinutes("Europe/Lisbon", Date.UTC(2026, 0, 15))).toBe(0)
    expect(zoneOffsetMinutes("Europe/Lisbon", Date.UTC(2026, 6, 15))).toBe(60)
    expect(zoneOffsetMinutes("Asia/Kolkata", Date.UTC(2026, 6, 15))).toBe(330)
  })

  it("finds the autumn change to the minute", () => {
    const [change] = zoneTransitions("Europe/Lisbon", Date.UTC(2026, 9, 20), Date.UTC(2026, 10, 1))
    expect(change).toEqual({ at: Date.UTC(2026, 9, 25, 1), from: 60, to: 0 })
  })

  it("calls the southern summer daylight time", () => {
    const tz = vtimezone("Australia/Sydney", [2026, 4, 3], [2026, 4, 8])
    expect(tz).toContain("BEGIN:DAYLIGHT")
    expect(tz).toContain("BEGIN:STANDARD")
    expect(tz).toContain("DTSTART:20260405T030000")
  })

  it("has a single observance where there is no summer time", () => {
    const tz = vtimezone("Asia/Tokyo", [2026, 7, 10], [2026, 7, 12])
    expect(tz.filter((l) => l.startsWith("BEGIN:"))).toEqual(["BEGIN:VTIMEZONE", "BEGIN:STANDARD"])
  })
})

describe("calendarMenuItem", () => {
  it("is off when there is nothing to put in a calendar", () => {
    const empty = trip({ days: [{ id: "d1", date: "2026-07-10", items: [stop({ kind: "section", title: "Morning" })] }] })
    expect(calendarMenuItem(empty).disabled).toBe(true)
    expect(calendarMenuItem(trip()).disabled).toBe(false)
    expect(calendarMenuItem(trip(), trip().days[1]).disabled).toBe(false)
  })

  it("downloads <slug>.ics for the trip", async () => {
    const blobs: Blob[] = []
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob)
      return "blob:ics"
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("tokyo-2026.ics")
    })
    // The exporter is a lazy chunk: the click lands once it has loaded.
    calendarMenuItem(trip()).onSelect()
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(blobs[0]!.type).toBe("text/calendar;charset=utf-8")
    expect(await blobs[0]!.text()).toContain("BEGIN:VCALENDAR")
    create.mockRestore()
    click.mockRestore()
  })
})

describe("calendarFileName", () => {
  it("uses the slug, then a cleaned name, then the id", () => {
    expect(calendarFileName({ id: "t1", slug: "lisbon-2026", name: "Lisbon" })).toBe("lisbon-2026.ics")
    expect(calendarFileName({ id: "t1", name: "São Paulo & Rio!" })).toBe("sao-paulo-rio.ics")
    expect(calendarFileName({ id: "t1", name: "서울" })).toBe("t1.ics")
    expect(calendarFileName({ id: "t1", slug: "seoul" , name: "Seoul" }, { date: "2026-04-01" })).toBe("seoul-2026-04-01.ics")
  })
})
