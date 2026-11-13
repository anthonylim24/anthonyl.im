import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BedDouble, Coffee, MapPin, Plane, StickyNote, Ticket } from "lucide-react"
import {
  addDays,
  dayCount,
  formatClock,
  formatRange,
  itemIcon,
  parseClock,
  plural,
  resolveAccent,
  titleCase,
  tripTiming,
  visibleTags,
} from "../meta"

describe("resolveAccent", () => {
  it("keeps a known accent", () => {
    expect(resolveAccent("rose")).toBe("rose")
    expect(resolveAccent("violet")).toBe("violet")
  })

  it("falls back to amber for missing or unknown values", () => {
    expect(resolveAccent(undefined)).toBe("amber")
    expect(resolveAccent(null)).toBe("amber")
    expect(resolveAccent("chartreuse")).toBe("amber")
    expect(resolveAccent("")).toBe("amber")
  })
})

describe("formatRange", () => {
  it("prints a single day once", () => {
    expect(formatRange("2026-05-26", "2026-05-26")).toBe("May 26, 2026")
  })

  it("shares the month inside one month", () => {
    expect(formatRange("2026-05-26", "2026-05-30")).toBe("May 26 – 30, 2026")
  })

  it("names both months across a month boundary", () => {
    expect(formatRange("2026-05-26", "2026-06-06")).toBe("May 26 – Jun 6, 2026")
  })

  it("names both years across a year boundary", () => {
    expect(formatRange("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 – Jan 3, 2027")
  })
})

describe("dayCount / addDays", () => {
  it("counts inclusive days and never returns less than one", () => {
    expect(dayCount("2026-05-26", "2026-05-26")).toBe(1)
    expect(dayCount("2026-05-26", "2026-06-06")).toBe(12)
    expect(dayCount("2026-05-26", "2026-05-20")).toBe(1)
  })

  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-05-30", 3)).toBe("2026-06-02")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(addDays("2026-03-01", 0)).toBe("2026-03-01")
  })
})

describe("tripTiming", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const trip = (startDate: string, endDate: string, timezone = "UTC") => ({ startDate, endDate, timezone })

  it("labels a finished trip with its month and year", () => {
    expect(tripTiming(trip("2026-05-01", "2026-05-10"))).toEqual({ phase: "past", label: "May 2026", daysAway: -45 })
  })

  it("labels a trip in progress as Day N of M", () => {
    expect(tripTiming(trip("2026-06-13", "2026-06-20"))).toEqual({ phase: "now", label: "Day 3 of 8", daysAway: -2 })
  })

  it("counts the first and last day as in progress", () => {
    expect(tripTiming(trip("2026-06-15", "2026-06-18")).label).toBe("Day 1 of 4")
    expect(tripTiming(trip("2026-06-10", "2026-06-15"))).toMatchObject({ phase: "now", label: "Day 6 of 6" })
  })

  it("labels upcoming trips by how far away they are", () => {
    expect(tripTiming(trip("2026-06-16", "2026-06-18"))).toEqual({ phase: "upcoming", label: "Tomorrow", daysAway: 1 })
    expect(tripTiming(trip("2026-06-20", "2026-06-22")).label).toBe("In 5 days")
    expect(tripTiming(trip("2026-07-06", "2026-07-10")).label).toBe("In 3 weeks")
    expect(tripTiming(trip("2026-09-13", "2026-09-20")).label).toBe("In 3 months")
  })

  it("uses the trip's own timezone for today", () => {
    // 12:00 UTC on the 15th is already the 16th in Kiritimati (UTC+14).
    expect(tripTiming(trip("2026-06-16", "2026-06-18", "Pacific/Kiritimati"))).toMatchObject({ phase: "now", label: "Day 1 of 3" })
    expect(tripTiming(trip("2026-06-16", "2026-06-18", "UTC")).phase).toBe("upcoming")
  })
})

describe("formatClock", () => {
  it("converts 24-hour times to AM/PM", () => {
    expect(formatClock("09:30")).toBe("9:30 AM")
    expect(formatClock("00:05")).toBe("12:05 AM")
    expect(formatClock("12:00")).toBe("12:00 PM")
    expect(formatClock("23:59")).toBe("11:59 PM")
  })

  it("leaves empty or unexpected values alone", () => {
    expect(formatClock()).toBe("")
    expect(formatClock("")).toBe("")
    expect(formatClock("late")).toBe("late")
    expect(formatClock("9:30")).toBe("9:30")
  })
})

describe("parseClock", () => {
  it.each([
    ["8", "08:00"],
    ["8a", "08:00"],
    ["8am", "08:00"],
    ["8:30", "08:30"],
    ["830pm", "20:30"],
    ["2 pm", "14:00"],
    ["14:00", "14:00"],
    ["1400", "14:00"],
    ["noon", "12:00"],
    ["midnight", "00:00"],
    ["12am", "00:00"],
    ["12pm", "12:00"],
    ["12:05 AM", "00:05"],
    ["11:59 PM", "23:59"],
    ["0", "00:00"],
    ["23:59", "23:59"],
    ["  9:05 P  ", "21:05"],
    ["9.30 a.m.", "09:30"],
    ["NOON", "12:00"],
  ])("reads %j as %s", (text, expected) => {
    expect(parseClock(text)).toBe(expected)
  })

  it.each(["", "   ", "soon", "24:00", "25", "8:60", "13pm", "0am", "8:5", "8:300", "-3", "8 o'clock", "12:00:00", "am"])(
    "rejects %j",
    (text) => {
      expect(parseClock(text)).toBeNull()
    },
  )

  it("round-trips with formatClock", () => {
    for (const time of ["00:00", "00:05", "09:30", "12:00", "12:45", "13:00", "23:59"]) {
      expect(parseClock(formatClock(time))).toBe(time)
    }
  })
})

describe("plural", () => {
  it("picks the singular only for one", () => {
    expect(plural(1, "day")).toBe("1 day")
    expect(plural(0, "day")).toBe("0 days")
    expect(plural(3, "day")).toBe("3 days")
    expect(plural(2, "city", "cities")).toBe("2 cities")
    expect(plural(1, "city", "cities")).toBe("1 city")
  })
})

describe("itemIcon", () => {
  it("maps known reservation types and place categories", () => {
    expect(itemIcon("reservation", undefined, "flight")).toBe(Plane)
    expect(itemIcon("reservation", undefined, "hotel")).toBe(BedDouble)
    expect(itemIcon("place", "cafe")).toBe(Coffee)
  })

  it("falls back for unknown or missing types", () => {
    expect(itemIcon("reservation")).toBe(Ticket)
    expect(itemIcon("reservation", "cafe", "teleport")).toBe(Ticket)
    expect(itemIcon("place")).toBe(MapPin)
    expect(itemIcon("place", "volcano")).toBe(MapPin)
    expect(itemIcon("section")).toBe(MapPin)
  })

  it("always uses the note icon for notes", () => {
    expect(itemIcon("note", "cafe", "flight")).toBe(StickyNote)
  })
})

describe("small label helpers", () => {
  it("hides migration bookkeeping tags", () => {
    expect(visibleTags(["food", "migrated", "family"])).toEqual(["food", "family"])
  })

  it("title-cases snake and kebab text", () => {
    expect(titleCase("needs_review")).toBe("Needs Review")
    expect(titleCase("guest-house")).toBe("Guest House")
  })
})
