import { describe, expect, it } from "vitest"
import type { ItineraryItem, TripDay } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { addressLocality, normaliseName, streetFirst } from "../address"
import { ELSEWHERE, NO_LOCATION, areaOf, compareAreas, ideaAreas, type Area } from "../areas"

// Seoul (City Hall), Busan (Haeundae), Lisbon: far enough apart that "nearest" is never close.
const SEOUL = { lat: 37.5665, lng: 126.978 }
const BUSAN = { lat: 35.1587, lng: 129.1604 }

const stop = (id: string, point: { lat: number; lng: number }) =>
  makeItem({ id, title: id, location: { name: id, source: "user", ...point } })

function idea(location?: Partial<NonNullable<ItineraryItem["location"]>>): ItineraryItem {
  return makeItem({ id: "idea", title: "Idea", location: location ? { name: "Idea", source: "user", ...location } : undefined })
}

function korea(days: TripDay[], destinations = ["Seoul", "Busan"]) {
  return makeTrip({ destinations, days })
}

const seoulDay: TripDay = { id: "d1", date: "2026-05-01", city: "Seoul", items: [stop("palace", SEOUL)] }
const busanDay: TripDay = { id: "d2", date: "2026-05-02", city: "Busan", items: [stop("beach", BUSAN)] }

describe("areaOf", () => {
  it("is the city of the day whose stops are nearest", () => {
    const trip = korea([seoulDay, busanDay])
    expect(areaOf(idea({ lat: 37.58, lng: 126.99 }), trip)).toEqual({ key: "seoul", label: "Seoul", rank: 0 })
    expect(areaOf(idea({ lat: 35.16, lng: 129.15 }), trip)).toEqual({ key: "busan", label: "Busan", rank: 1 })
  })

  it("groups one city across several days under its first day", () => {
    const again: TripDay = { id: "d3", date: "2026-05-03", city: " seoul ", items: [stop("market", { lat: 37.57, lng: 126.999 })] }
    const trip = korea([seoulDay, busanDay, again])
    const area = areaOf(idea({ lat: 37.5701, lng: 126.9991 }), trip)
    expect(area.key).toBe("seoul")
    expect(area.rank).toBe(0)
  })

  it("takes the nearest named day when the nearest stop's day has no city", () => {
    const unnamed: TripDay = { id: "d0", date: "2026-04-30", items: [stop("airport", { lat: 37.56, lng: 126.98 })] }
    const trip = korea([unnamed, seoulDay])
    expect(areaOf(idea({ lat: 37.561, lng: 126.981 }), trip).label).toBe("Seoul")
  })

  it("reads a trip city out of the address when the idea is not near any stop", () => {
    const trip = korea([seoulDay, busanDay])
    expect(areaOf(idea({ address: "12 Insadong-gil, Jongno District, Seoul 03145, South Korea" }), trip)).toEqual({
      key: "seoul",
      label: "Seoul",
      rank: 0,
    })
    // A destination no day names yet still counts, after the days.
    expect(areaOf(idea({ address: "Jeju-si, Jeju, South Korea" }), korea([seoulDay], ["Seoul", "Jeju"]))).toEqual({
      key: "jeju",
      label: "Jeju",
      rank: 2,
    })
  })

  it("falls back to the town the address ends in", () => {
    const trip = korea([seoulDay])
    expect(areaOf(idea({ address: "1 Rua Augusta, 1100-053 Lisboa, Portugal" }), trip)).toEqual({ key: "lisboa", label: "Lisboa", rank: 100_000 })
  })

  it("is Elsewhere for a pinned place far from the trip with nothing to read", () => {
    expect(areaOf(idea({ lat: 38.72, lng: -9.14 }), korea([seoulDay]))).toEqual(ELSEWHERE)
    expect(areaOf(idea({ address: "Somewhere nice" }), korea([seoulDay]))).toEqual(ELSEWHERE)
  })

  it("is No location with no pin and no address", () => {
    expect(areaOf(idea(), korea([seoulDay]))).toEqual(NO_LOCATION)
    expect(areaOf(idea({ address: "  " }), korea([seoulDay]))).toEqual(NO_LOCATION)
  })

  it("does not take a far city just because it is the nearest", () => {
    // 330 km from Seoul, no address: not "Busan" or "Seoul".
    expect(areaOf(idea({ lat: 35.8714, lng: 128.6014 }), korea([seoulDay, busanDay]))).toEqual(ELSEWHERE)
  })
})

describe("ideaAreas", () => {
  it("works out every idea's area at once", () => {
    const trip = korea([seoulDay, busanDay])
    const ideas = [
      { ...idea({ lat: 35.16, lng: 129.15 }), id: "a" },
      { ...idea(), id: "b" },
    ]
    const areas = ideaAreas(trip, ideas)
    expect(areas.get("a")?.label).toBe("Busan")
    expect(areas.get("b")).toEqual(NO_LOCATION)
  })
})

describe("addressLocality", () => {
  it.each([
    ["12 Insadong-gil, Jongno District, Seoul 03145, South Korea", "Seoul"],
    ["1-2-3 Jingumae, Shibuya City, Tokyo 150-0001, Japan", "Tokyo"],
    ["5 Av. Anatole France, 75007 Paris, France", "Paris"],
    ["Westminster, London SW1A 0AA, UK", "London"],
    ["89 E 42nd St, New York, NY 10017, USA", "New York"],
    ["Martim Moniz, Lisbon", "Lisbon"],
    ["Seoul, South Korea", "Seoul"],
    ["Japan, 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme−22−7 岩本ビル B1F", "Tokyo"],
    ["South Korea, Busan, 부산광역시 중구 자갈치해안로 52 (남포동4가)", "Busan"],
  ])("%s → %s", (address, town) => {
    expect(addressLocality(address)).toBe(town)
  })

  it.each([undefined, "", "Insadong-gil 12", "서울특별시 종로구 인사동길 12", "South Korea, Japan", "75007, France"])("finds no town in %j", (address) => {
    expect(addressLocality(address)).toBeNull()
  })
})

describe("streetFirst", () => {
  it("turns a country-first address round and drops the country and bare postcodes", () => {
    expect(streetFirst("Japan, 〒150-0041 Tokyo, Shibuya, Jinnan, 1-chōme−22−7")).toEqual(["1-chōme−22−7", "Jinnan", "Shibuya", "〒150-0041 Tokyo"])
    expect(streetFirst("1 Kinkakujichō, Kita Ward, Kyoto, 603-8361, Japan")).toEqual(["1 Kinkakujichō", "Kita Ward", "Kyoto"])
  })

  it("keeps a street-first address in its order, and a lone name as it is", () => {
    expect(streetFirst("88 Changgyeonggung-ro, Jongno District, Seoul 03195, South Korea")).toEqual(["88 Changgyeonggung-ro", "Jongno District", "Seoul 03195"])
    expect(streetFirst("Insadong-gil 12")).toEqual(["Insadong-gil 12"])
    expect(streetFirst(undefined)).toEqual([])
  })
})

describe("compareAreas", () => {
  it("orders the trip's cities, then other towns A to Z, then Elsewhere, then No location", () => {
    const areas: Area[] = [
      NO_LOCATION,
      { key: "porto", label: "Porto", rank: 100_000 },
      ELSEWHERE,
      { key: "busan", label: "Busan", rank: 1 },
      { key: "evora", label: "Évora", rank: 100_000 },
      { key: "seoul", label: "Seoul", rank: 0 },
    ]
    expect([...areas].sort(compareAreas).map((area) => area.label)).toEqual(["Seoul", "Busan", "Évora", "Porto", "Elsewhere", "No location"])
  })
})

describe("normaliseName", () => {
  it("ignores case, accents and spacing", () => {
    expect(normaliseName("  Évora ")).toBe(normaliseName("evora"))
    expect(normaliseName("New   York")).toBe("new york")
  })
})
