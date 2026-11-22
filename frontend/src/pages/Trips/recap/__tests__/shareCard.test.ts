import { describe, expect, it } from "vitest"
import type { Recap } from "../recapModel"
import { recapCardLines, recapFileName, shareRecapCard } from "../shareCard"

const recap = (overrides: Partial<Recap> = {}): Recap => ({
  name: "Winter in Korea",
  dates: "Dec 23 – 25, 2026",
  accent: "sky",
  days: 3,
  totalDays: 3,
  over: true,
  places: 6,
  cities: ["Seoul", "Busan"],
  distance: 348_200,
  points: [],
  loved: [
    { dayId: "d1", itemId: "a", title: "Gyeongbokgung", dayNumber: 1, city: "Seoul" },
    { dayId: "d3", itemId: "b", title: "Haeundae", dayNumber: 3, city: "Busan" },
  ],
  journal: [],
  spend: null,
  ...overrides,
})

describe("recapCardLines", () => {
  it("says the trip in figures, what was loved and where", () => {
    expect(recapCardLines(recap())).toEqual({
      eyebrow: "TRIP RECAP · DEC 23 – 25, 2026",
      name: "Winter in Korea",
      figures: [
        { value: "3", label: "days" },
        { value: "6", label: "places" },
        { value: "2", label: "cities" },
        { value: "≈348", label: "km" },
      ],
      loved: "Gyeongbokgung  ·  Haeundae",
      cities: "Seoul  ·  Busan",
    })
  })

  it("counts days so far on an unfinished trip and leaves out what there is none of", () => {
    const lines = recapCardLines(recap({ over: false, days: 2, places: 1, cities: [], distance: 400, loved: [] }))
    expect(lines.figures).toEqual([
      { value: "2", label: "of 3 days" },
      { value: "1", label: "place" },
    ])
    expect(lines.loved).toBeNull()
    expect(lines.cities).toBeNull()
  })
})

describe("recapFileName", () => {
  it("keeps any script and drops what a file name can't hold", () => {
    expect(recapFileName("Winter in Korea!")).toBe("winter-in-korea-recap.png")
    expect(recapFileName("서울 겨울 여행")).toBe("서울-겨울-여행-recap.png")
    expect(recapFileName("  ///  ")).toBe("trip-recap.png")
  })
})

describe("shareRecapCard", () => {
  it("never throws, even with no canvas to draw on", async () => {
    await expect(shareRecapCard(recap())).resolves.toBe("failed")
  })
})
