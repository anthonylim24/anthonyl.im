import { describe, expect, it } from "vitest"
import {
  archivePlaces,
  climatePlan,
  commonSky,
  median,
  readArchive,
  sampleYears,
  shiftYears,
  timeOfYear,
  typicalDay,
  typicalWords,
  type ClimateSample,
  type ClimateYear,
} from "../climate"

/** Seven days centred on `centre`, each from `day(offset)`. */
function week(centre: string, day: (offset: number) => Partial<ClimateSample>): ClimateSample[] {
  return [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const date = new Date(`${centre}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + offset)
    return { date: date.toISOString().slice(0, 10), highC: 10, lowC: 2, precipMm: 0, code: 3, ...day(offset) }
  })
}

describe("climate dates", () => {
  it("shifts a date by whole years, landing 29 February on the 28th in a common year", () => {
    expect(shiftYears("2026-12-24", -1)).toBe("2025-12-24")
    expect(shiftYears("2028-02-29", -1)).toBe("2027-02-28")
    expect(shiftYears("2028-02-29", -4)).toBe("2024-02-29")
  })

  it("samples the last three years whose dates have reached the archive", () => {
    expect(sampleYears("2026-12-27", "2026-11-21")).toEqual([1, 2, 3])
    // A trip more than a year out: last year's dates have not happened yet.
    expect(sampleYears("2027-12-27", "2026-11-21")).toEqual([2, 3, 4])
    // The archive trails by about a week: a date a few days short of a year out waits a year more.
    expect(sampleYears("2027-11-18", "2026-11-21")).toEqual([2, 3, 4])
  })

  it("asks the archive for each year's window, three days either side", () => {
    const plan = climatePlan({ key: "37.6,127", lat: 37.6, lng: 127, start: "2026-12-24", end: "2026-12-26", days: new Map() }, "2026-11-21")
    expect(plan.backs).toEqual([1, 2, 3])
    expect(archivePlaces([plan])).toEqual([
      { lat: 37.6, lng: 127, start: "2025-12-21", end: "2025-12-29" },
      { lat: 37.6, lng: 127, start: "2024-12-21", end: "2024-12-29" },
      { lat: 37.6, lng: 127, start: "2023-12-21", end: "2023-12-29" },
    ])
  })

  it("names the time of year", () => {
    expect(timeOfYear("2026-12-24")).toBe("late December")
    expect(timeOfYear("2026-03-04")).toBe("early March")
    expect(timeOfYear("2026-07-15")).toBe("mid July")
  })
})

describe("climate aggregation", () => {
  it("takes the median, not the mean, so one freak day does not move it", () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([1, 1, 1, 40])).toBe(1)
  })

  it("names the most common sky, driest first on a tie, and its most common code", () => {
    expect(commonSky([61, 63, 61, 0, 3])).toBe(61)
    // Two clear, two rain: a tie reads as the drier sky.
    expect(commonSky([0, 61, 0, 63])).toBe(0)
    // 1 and 2 are both "partly cloudy": the sky wins as a whole.
    expect(commonSky([1, 2, 2, 61, 63])).toBe(2)
    expect(commonSky([])).toBeNull()
  })

  it("derives the typical day from three years of the same week", () => {
    const years: ClimateYear[] = [
      // Last year: warm, and wet on two days of the seven.
      { back: 1, rows: week("2025-12-24", (o) => ({ highC: 8 + o, lowC: 1, precipMm: o === 0 || o === 1 ? 4 : 0, code: o === 0 || o === 1 ? 61 : 3 })) },
      // Two years back: grey and dry.
      { back: 2, rows: week("2024-12-24", () => ({ highC: 6, lowC: -1 })) },
      // Three years back: rain on four days, one of them under a millimetre.
      { back: 3, rows: week("2023-12-24", (o) => ({ highC: 7, lowC: 0, precipMm: o < 0 ? 2 : o === 0 ? 0.4 : 0, code: o <= 0 ? 61 : 3 })) },
    ]
    const typical = typicalDay("2026-12-24", years)
    expect(typical).toEqual({
      date: "2026-12-24",
      // 21 highs: 5…11 (last year), 6 ×7, 7 ×7 → the 11th smallest is 7.
      highC: 7,
      // 21 lows: 1 ×7, -1 ×7, 0 ×7 → 0.
      lowC: 0,
      // Wet (≥ 1 mm) on 2 + 0 + 3 of 21 days.
      rainChance: Math.round((5 / 21) * 100),
      // Overcast on 21 − 6 = 15 days.
      code: 3,
      years: 3,
    })
  })

  it("counts only days within three of the date, in every year", () => {
    const rows = [...week("2025-12-24", () => ({ highC: 5 })), { date: "2025-12-31", highC: 30, lowC: 25, precipMm: 50, code: 95 }]
    const typical = typicalDay("2026-12-24", [{ back: 1, rows }])
    expect(typical).toMatchObject({ highC: 5, rainChance: 0, code: 3, years: 1 })
  })

  it("says nothing with too few days to call typical, and skips rows without a temperature", () => {
    const sparse = week("2025-12-24", (o) => (o > -3 ? { highC: null, lowC: null } : {}))
    expect(typicalDay("2026-12-24", [{ back: 1, rows: sparse }])).toBeNull()
    expect(typicalDay("2026-12-24", [])).toBeNull()
  })

  it("reads the archive's columns and drops rows with nothing in them", () => {
    expect(
      readArchive({
        time: ["2025-12-23", "2025-12-24", "bad"],
        weather_code: [3, null, 3],
        temperature_2m_max: [6.1, null, 1],
        temperature_2m_min: [-1.2, null, 1],
        precipitation_sum: [0.2, null, 1],
      }),
    ).toEqual([{ date: "2025-12-23", highC: 6.1, lowC: -1.2, precipMm: 0.2, code: 3 }])
    expect(readArchive(undefined)).toEqual([])
  })
})

describe("typicalWords", () => {
  it("puts the sky and the wet days so they never read as a forecast", () => {
    expect(typicalWords({ code: 3, rainChance: 40 })).toEqual({ sky: "Mostly grey", wet: "Rain on 4 days in 10" })
    expect(typicalWords({ code: 0, rainChance: 5 })).toEqual({ sky: "Mostly clear", wet: "Seldom wet" })
    expect(typicalWords({ code: 61, rainChance: 20 })).toEqual({ sky: "Often rainy", wet: null })
    expect(typicalWords({ code: 73, rainChance: 50 })).toEqual({ sky: "Often snowy", wet: "Snow or rain on 5 days in 10" })
    expect(typicalWords({ code: 63, rainChance: 85 })).toEqual({ sky: "Often rainy", wet: "Rain most days" })
  })
})
