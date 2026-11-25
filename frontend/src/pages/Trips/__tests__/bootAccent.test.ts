import { afterEach, describe, expect, it, vi } from "vitest"
import { clearBoot, paintBoot } from "@/test/bootPage"
import { rememberTripAccent } from "../bootAccent"

const saved = () => JSON.parse(localStorage.getItem("trips-boot-accent") ?? "null") as Record<string, string> | null

afterEach(() => {
  vi.restoreAllMocks()
  clearBoot()
})

describe("the accent the Trips boot screen paints a trip in", () => {
  it("is the one the trip last opened with, read by the boot script before any bundle runs", () => {
    rememberTripAccent("korea-2026", "rose")
    expect(paintBoot("/trips/korea-2026/day/day-3")).toHaveAttribute("data-accent", "rose")
  })

  it("keeps only the accent name, per trip, and writes only when it changes", () => {
    const write = vi.spyOn(localStorage, "setItem")
    rememberTripAccent("korea-2026", "rose")
    rememberTripAccent("korea-2026", "rose")
    expect(write).toHaveBeenCalledTimes(1)
    rememberTripAccent("tokyo-in-spring", "sky")
    rememberTripAccent("korea-2026", "emerald")
    expect(write).toHaveBeenCalledTimes(3)
    expect(saved()).toEqual({ "tokyo-in-spring": "sky", "korea-2026": "emerald" })
  })

  it("remembers the 24 most recently changed trips", () => {
    for (let n = 1; n <= 25; n++) rememberTripAccent(`trip-${n}`, "amber")
    const trips = Object.keys(saved() ?? {})
    expect(trips).toHaveLength(24)
    expect(trips).not.toContain("trip-1")
    expect(trips).toContain("trip-2")

    rememberTripAccent("trip-2", "violet")
    rememberTripAccent("trip-26", "rose")
    expect(Object.keys(saved() ?? {})).toHaveLength(24)
    expect(saved()).toMatchObject({ "trip-2": "violet", "trip-26": "rose" })
    expect(saved()).not.toHaveProperty("trip-3")
  })

  it("starts over from a stored value it cannot read", () => {
    localStorage.setItem("trips-boot-accent", '["rose"]')
    rememberTripAccent("korea-2026", "rose")
    expect(saved()).toEqual({ "korea-2026": "rose" })
    localStorage.setItem("trips-boot-accent", '{"korea-2026":"crimson","tokyo-in-spring":"sky"}')
    rememberTripAccent("lisbon", "amber")
    expect(saved()).toEqual({ "tokyo-in-spring": "sky", lisbon: "amber" })
  })

  it("is silent when storage is full or blocked", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(() => rememberTripAccent("korea-2026", "rose")).not.toThrow()
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })
    expect(() => rememberTripAccent("korea-2026", "rose")).not.toThrow()
  })
})
