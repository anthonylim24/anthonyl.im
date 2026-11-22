import { describe, expect, test } from "bun:test"
import { sameVenue, venueSet, type VenueLike } from "./sameVenue"

const place = (name: string, at?: [number, number]): VenueLike => ({
  kind: "place",
  title: name,
  location: { name, ...(at ? { lat: at[0], lng: at[1] } : {}) },
})

// Roughly 111 m per 0.001° of latitude.
const LEEUM: [number, number] = [37.5381, 126.9993]
const near = (at: [number, number], metersNorth: number): [number, number] => [at[0] + metersNorth / 111_000, at[1]]

describe("sameVenue", () => {
  test("a name with or without the words for its kind is one venue", () => {
    expect(sameVenue(place("Leeum Museum of Art"), place("Leeum Museum"))).toBe(true)
    expect(sameVenue(place("Leeum"), place("Leeum Museum of Art"))).toBe(true)
    expect(sameVenue(place("Gwangjang Market"), place("Gwangjang"))).toBe(true)
    expect(sameVenue(place("Gentle Monster Flagship Store"), place("Gentle Monster"))).toBe(true)
  })

  test("case, accents, punctuation, spacing and word order do not matter", () => {
    expect(sameVenue(place("CAFÉ ONION"), place("Cafe Onion"))).toBe(true)
    expect(sameVenue(place("Gyeongbokgung"), place("Gyeong-bok gung"))).toBe(true)
    expect(sameVenue(place("리움 미술관"), place("리움미술관"))).toBe(true)
    expect(sameVenue(place("N Seoul Tower"), place("Seoul Tower"))).toBe(true)
  })

  test("a bracketed name counts as another name for the venue", () => {
    expect(sameVenue(place("Gyeongbokgung Palace (경복궁)"), place("경복궁"))).toBe(true)
    expect(sameVenue(place("Leeum (Samsung Museum of Art)"), place("Leeum Museum of Art"))).toBe(true)
  })

  test("a word that names another venue keeps them apart", () => {
    expect(sameVenue(place("Lotte World"), place("Lotte World Tower"))).toBe(false)
    expect(sameVenue(place("Seoul Tower"), place("Seoul Station"))).toBe(false)
    expect(sameVenue(place("Myeongdong"), place("Myeongdong Kyoja"))).toBe(false)
    expect(sameVenue(place("Namdaemun"), place("Namdaemun Gate"))).toBe(false)
  })

  test("a kind of place alone is not a venue's name", () => {
    expect(sameVenue(place("Museum"), place("Leeum Museum"))).toBe(false)
    expect(sameVenue(place("Cafe"), place("Cafe Onion"))).toBe(false)
  })

  test("pins far apart are different venues, even with one name", () => {
    expect(sameVenue(place("Starbucks", LEEUM), place("Starbucks", near(LEEUM, 3_000)))).toBe(false)
    expect(sameVenue(place("Starbucks", LEEUM), place("Starbucks", near(LEEUM, 200)))).toBe(true)
  })

  test("names that only match up to a kind word need pins close together", () => {
    expect(sameVenue(place("Leeum", LEEUM), place("Leeum Museum of Art", near(LEEUM, 150)))).toBe(true)
    expect(sameVenue(place("Leeum", LEEUM), place("Leeum Museum of Art", near(LEEUM, 700)))).toBe(false)
  })

  test("without a place, the title is the name", () => {
    expect(sameVenue({ kind: "place", title: "Leeum Museum" }, place("Leeum Museum of Art"))).toBe(true)
  })

  test("notes and headings are never venues", () => {
    expect(sameVenue({ kind: "note", title: "Leeum" }, place("Leeum"))).toBe(false)
    expect(sameVenue({ kind: "section", title: "Leeum" }, { kind: "section", title: "Leeum" })).toBe(false)
    expect(sameVenue({ kind: "place", title: "  " }, { kind: "place", title: "" })).toBe(false)
  })
})

describe("venueSet", () => {
  test("knows the venues it started with and the ones added since", () => {
    const seen = venueSet([place("Leeum Museum of Art"), { kind: "note", title: "Gwangjang" }])
    expect(seen.has(place("Leeum"))).toBe(true)
    expect(seen.has(place("Gwangjang Market"))).toBe(false)
    seen.add(place("Gwangjang Market"))
    expect(seen.has(place("Gwangjang"))).toBe(true)
  })
})

describe("sameVenue word order", () => {
  test("numbers and order are part of the name", () => {
    expect(sameVenue(place("Stop 1-2"), place("Stop 2-1"))).toBe(false)
    expect(sameVenue(place("Stop 1-1"), place("Stop 1-2"))).toBe(false)
    expect(sameVenue(place("Stop 1"), place("Stop 11"))).toBe(false)
  })
})
