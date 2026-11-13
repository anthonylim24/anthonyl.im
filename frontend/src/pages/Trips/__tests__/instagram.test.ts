import { describe, expect, it } from "vitest"
import {
  bestDayFor,
  dayWithPlace,
  describeProblem,
  extractInstagramUrls,
  isInstagramUrl,
  jobProgress,
  placeCategory,
  postLabel,
  stopFromPlace,
} from "../instagram/instagram"
import type { IgJob, IgPlace } from "../instagram/instagramApi"
import { makeItem, makeTrip } from "./tripFixtures"

const place = (overrides: Partial<IgPlace> = {}): IgPlace => ({
  id: 1,
  post_id: 9,
  name: "Pastéis de Belém",
  name_romanized: null,
  city: "Lisbon",
  category: "cafe",
  confidence_band: "high",
  supporting_quote: "the original custard tarts",
  address: "R. de Belém 84-92",
  lat: 38.6975,
  lng: -9.2032,
  ...overrides,
})

const job = (overrides: Partial<IgJob> = {}): IgJob => ({
  id: 7,
  url: "https://www.instagram.com/reel/abc/",
  status: "running",
  step: "bundling",
  step_started_at: null,
  attempts: 1,
  last_error: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  post_id: null,
  skip_video: true,
  places: [],
  post_preview: null,
  ...overrides,
})

describe("extractInstagramUrls", () => {
  it("finds post links in pasted text, once each, without trailing punctuation", () => {
    const text =
      "look at this https://www.instagram.com/reel/abc/?igsh=xyz, and https://instagram.com/p/def/. also https://www.instagram.com/reel/abc/?utm_source=x and https://example.com/p/1"
    expect(extractInstagramUrls(text)).toEqual(["https://www.instagram.com/reel/abc/?igsh=xyz", "https://instagram.com/p/def/"])
  })

  it("ignores look-alike hosts", () => {
    expect(isInstagramUrl("https://instagram.com.evil.example/p/1")).toBe(false)
    expect(isInstagramUrl("https://m.instagram.com/p/1")).toBe(true)
    expect(extractInstagramUrls("not a link")).toEqual([])
  })
})

describe("jobProgress", () => {
  it("names each step in plain words and moves forward", () => {
    const steps = (["queued", "fetching", "bundling", "extracting", "geocoding", "saving"] as const).map((step) =>
      jobProgress(job({ step, status: step === "queued" ? "pending" : "running" })),
    )
    expect(steps.map((s) => s.phase)).toEqual(Array(6).fill("working"))
    expect(steps.map((s) => s.fraction)).toEqual([...steps.map((s) => s.fraction)].sort((a, b) => a - b))
    expect(steps[2]!.label).toBe("Reading the caption")
    expect(jobProgress(job({ step: "bundling", skip_video: false })).label).toBe("Watching the video")
  })

  it("separates found, empty and failed", () => {
    expect(jobProgress(job({ status: "done", step: "done", places: [place()] }))).toMatchObject({ phase: "done", label: "1 place" })
    expect(jobProgress(job({ status: "done", step: "done" })).phase).toBe("empty")
    const dead = jobProgress(job({ status: "dead", step: "fetching", last_error: "bright data returned empty array" }))
    expect(dead.phase).toBe("failed")
    expect(dead.problem).toContain("private or deleted")
  })

  it("keeps working through a retry backoff", () => {
    expect(jobProgress(job({ status: "pending", step: "fetching", attempts: 1, last_error: "timeout" }))).toMatchObject({
      phase: "working",
      label: "Hit a snag, trying again",
    })
  })

  it("never shows a raw server error", () => {
    expect(describeProblem("TypeError: fetch failed at wire.ts:44")).toBe("This post couldn’t be read.")
  })
})

describe("placing a place on the trip", () => {
  const trip = makeTrip({
    days: [
      { id: "day-1", date: "2026-07-10", items: [makeItem({ id: "a", title: "Castelo", location: { name: "Castelo de São Jorge", lat: 38.7139, lng: -9.1335, source: "user" } })] },
      { id: "day-2", date: "2026-07-11", items: [makeItem({ id: "b", title: "Tower", location: { name: "Torre de Belém", lat: 38.6916, lng: -9.216, source: "user" } })] },
    ],
  })

  it("picks the day whose stops are nearest", () => {
    expect(bestDayFor(trip, place())?.id).toBe("day-2")
    expect(bestDayFor(trip, place({ lat: 38.7118, lng: -9.1301 }))?.id).toBe("day-1")
  })

  it("falls back to the emptiest day when nothing is nearby or the place has no pin", () => {
    const fresh = makeTrip()
    expect(bestDayFor(fresh, place())?.id).toBe("day-1")
    expect(bestDayFor(trip, place({ lat: 37.55, lng: 127.05 }))?.id).toBe("day-1")
    expect(bestDayFor(trip, place({ lat: null, lng: null }))?.id).toBe("day-1")
  })

  it("knows when a place is already on the trip, by name or by spot", () => {
    expect(dayWithPlace(trip, place({ name: "torre de belém ", lat: null, lng: null }))).toBe(2)
    expect(dayWithPlace(trip, place({ name: "Belém Tower", lat: 38.69161, lng: -9.21601 }))).toBe(2)
    expect(dayWithPlace(trip, place())).toBeNull()
  })

  it("turns a place into a stop that keeps its post link and pin", () => {
    const stop = stopFromPlace(place({ name: "성수 카페", name_romanized: "Seongsu Cafe", category: "activity", google_place_id: "gp1" }), "https://www.instagram.com/p/x/")
    expect(stop.title).toBe("성수 카페 (Seongsu Cafe)")
    expect(stop.links).toEqual(["https://www.instagram.com/p/x/"])
    expect(stop.location).toMatchObject({ name: "성수 카페", lat: 38.6975, lng: -9.2032, category: "experience", placeId: "gp1", confidence: "high" })
    expect(dayWithPlace({ days: [{ id: "d", date: "2026-07-10", items: [stop] }] }, place({ name: "성수 카페", name_romanized: "Seongsu Cafe", lat: null, lng: null }))).toBe(1)
  })

  it("marks an uncertain pin and drops unknown categories", () => {
    const stop = stopFromPlace(place({ geocode_disagree: true, category: "other" }))
    expect(stop.location?.confidence).toBe("low")
    expect(stop.location?.category).toBeUndefined()
    expect(placeCategory("bar")).toBe("bar")
  })
})

describe("postLabel", () => {
  it("uses the author when known, otherwise the kind of post", () => {
    expect(postLabel(job({ post_preview: { caption: null, owner_username: "lisboa" } }))).toBe("@lisboa")
    expect(postLabel(job())).toBe("Instagram reel")
    expect(postLabel(job({ url: "https://www.instagram.com/p/x/" }))).toBe("Instagram post")
  })
})
