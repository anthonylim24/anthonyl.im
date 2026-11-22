import { describe, expect, it } from "vitest"
import { ITEM_THEMES, type ItineraryItem } from "../../types"
import { THEME_ORDER, THEMES, inferredTheme, themeFromCategory, themeFromName, themeOf } from "../themes"

function place(title: string, category?: string, extra: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: title,
    kind: "place",
    title,
    status: "none",
    createdBy: "user",
    location: { name: title, source: "user", ...(category ? { category } : {}) },
    ...extra,
  }
}

describe("THEMES", () => {
  it("labels and orders every stored theme, with Other last", () => {
    expect(Object.keys(THEMES).sort()).toEqual([...ITEM_THEMES].sort())
    expect(THEME_ORDER[THEME_ORDER.length - 1]).toBe("other")
    for (const theme of ITEM_THEMES) expect(THEMES[theme].label).toMatch(/^[A-Z]/)
  })
})

describe("themeOf", () => {
  it("keeps the traveller's own pick over anything it could infer", () => {
    expect(themeOf(place("Gwangjang Market", "market", { theme: "shopping" }))).toBe("shopping")
    expect(themeOf(place("Mystery", undefined, { theme: "nature" }))).toBe("nature")
  })

  it.each([
    ["Tosokchon", "restaurant", "food"],
    ["Anthracite", "cafe", "food"],
    ["Tartine", "bakery", "food"],
    ["Gwangjang Market", "market", "food"],
    ["Charles H.", "bar", "nightlife"],
    ["Hyundai Seoul", "shopping", "shopping"],
    ["Leeum", "museum", "sights"],
    ["Gyeongbokgung", "palace", "sights"],
    ["Seongsu", "neighborhood", "neighborhood"],
    ["Four Seasons", "hotel", "other"],
    ["Seoul Station", "transit", "other"],
  ] as const)("reads the place search's category: %s (%s) is %s", (title, category, theme) => {
    expect(themeOf(place(title, category))).toBe(theme)
  })

  it.each([
    ["Bukhansan", "hiking_area", "nature"],
    ["Seoraksan", "national_park", "nature"],
    ["Menya Sandaime", "ramen_restaurant", "food"],
    ["Octagon", "night_club", "nightlife"],
    ["Starfield COEX", "shopping_mall", "shopping"],
    ["Everland", "amusement_park", "activity"],
    ["COEX Aquarium", "Aquarium", "activity"],
    ["Ikseon", "sublocality_level_1", "neighborhood"],
    ["Daeyang Gallery", "art gallery", "sights"],
    ["Somewhere", "coffee-shop", "food"],
  ] as const)("reads a raw Google type: %s (%s) is %s", (title, category, theme) => {
    expect(themeOf(place(title, category))).toBe(theme)
  })

  it("lets the name overrule a vague category", () => {
    // OpenStreetMap files a beach as a viewpoint; the server files a theme park under park.
    expect(themeOf(place("Haeundae Beach", "viewpoint"))).toBe("nature")
    expect(themeOf(place("Lotte World theme park", "park"))).toBe("activity")
    expect(themeOf(place("Hiking trail to Inwangsan", "tourist_attraction"))).toBe("nature")
    expect(themeOf(place("Nanta cooking class", "experience"))).toBe("activity")
  })

  it("keeps a vague category's likely theme when the name says nothing", () => {
    expect(themeOf(place("Lotte World", "park"))).toBe("nature")
    expect(themeOf(place("N Seoul", "viewpoint"))).toBe("sights")
    expect(themeOf(place("Starfield Library", "landmark"))).toBe("sights")
    expect(themeOf(place("Hanok stay", "experience"))).toBe("activity")
  })

  it("does not let the name overrule a telling category", () => {
    expect(themeOf(place("Beach Road Café", "cafe"))).toBe("food")
    expect(themeOf(place("Park Hyatt", "hotel"))).toBe("other")
    expect(themeOf(place("Market Street Hotel", "hotel"))).toBe("other")
    expect(themeOf(place("Tower Records", "shopping"))).toBe("shopping")
  })

  it("reads a booking by what it is for", () => {
    const booking = (type: string, category?: string) =>
      place("Booked", category, { kind: "reservation", reservation: { type, status: "confirmed" } })
    expect(themeOf(booking("meal"))).toBe("food")
    expect(themeOf(booking("bar"))).toBe("nightlife")
    expect(themeOf(booking("experience"))).toBe("activity")
    expect(themeOf(booking("event"))).toBe("activity")
    expect(themeOf(booking("flight"))).toBe("other")
    expect(themeOf(booking("hotel"))).toBe("other")
    expect(themeOf(booking("car"))).toBe("other")
    // A specific category still says more than the booking type.
    expect(themeOf(booking("experience", "museum"))).toBe("sights")
  })

  it("reads a note by its words only, and a heading as Other", () => {
    expect(themeOf({ ...place("Try the ramen near the hotel"), kind: "note", location: undefined })).toBe("other")
    expect(themeOf({ ...place("Look for a jazz club"), kind: "note", location: undefined })).toBe("nightlife")
    expect(themeOf({ ...place("To schedule"), kind: "section", location: undefined })).toBe("other")
  })

  it("says Other when nothing tells, rather than guessing", () => {
    expect(themeOf(place("Starfield Library"))).toBe("other")
    expect(themeOf(place("Starfield Library", "venue"))).toBe("other")
    expect(themeOf(place("Mystery", "point_of_interest"))).toBe("other")
    expect(themeOf(place(""))).toBe("other")
  })

  it("never reads an address", () => {
    const idea = place("Onion", undefined, { location: { name: "Onion", address: "8 Achasan-ro 9-gil, Seongdong District, Seoul", source: "user" } })
    expect(themeOf(idea)).toBe("other")
  })
})

describe("themeFromName", () => {
  it.each([
    ["Bukchon Hanok Village", "neighborhood"],
    ["Insadong-gil", "neighborhood"],
    ["Ikseon-dong", "neighborhood"],
    ["Gangnam-gu", "neighborhood"],
    ["인사동길", "neighborhood"],
    ["익선동 골목", "neighborhood"],
    ["Myeongdong Cathedral", "sights"],
    ["N Seoul Tower", "sights"],
    ["국립중앙박물관", "sights"],
    ["경복궁", "sights"],
    ["Golden Gate Park", "nature"],
    ["Mt. Fuji", "nature"],
    ["Haeundae Beach", "nature"],
    ["Nami Island", "nature"],
    ["Kew Gardens", "nature"],
    ["Seoul Forest", "nature"],
    ["한강공원", "nature"],
    ["Sushi Bar Yasuda", "food"],
    ["Street food alley", "food"],
    ["Gwangjang Market", "food"],
    ["Myeongdong night market", "food"],
    ["광장시장", "food"],
    ["Golf club", "activity"],
    ["Food tour", "activity"],
    ["Dragon Hill Spa", "activity"],
    ["Rooftop bar", "nightlife"],
    ["Coin noraebang", "nightlife"],
    ["Dongmyo flea market", "shopping"],
    ["Kyobo bookstore", "shopping"],
    ["Park Hyatt", "other"],
    ["Seoul Station", "other"],
  ] as const)("%s is %s", (name, theme) => {
    expect(themeFromName(name)).toBe(theme)
  })

  it.each([
    "Starfield Library",
    "Myeongdong Kyoja", // a restaurant, not the neighbourhood: "dong" inside a word
    "Gildong's",
    "Dongdaemun DDP",
    "Barcelona",
    "Parkview",
    "Hello Kitty",
    "Olive",
    "",
  ])("finds nothing in %j", (name) => {
    expect(themeFromName(name)).toBeNull()
  })
})

describe("themeFromCategory", () => {
  it("knows nothing from a placeholder category", () => {
    expect(themeFromCategory(undefined)).toBeNull()
    expect(themeFromCategory("")).toBeNull()
    expect(themeFromCategory("venue")).toBeNull()
    expect(themeFromCategory("establishment")).toBeNull()
    expect(themeFromCategory("unicorn")).toBeNull()
  })

  it("marks the categories a name may overrule", () => {
    expect(themeFromCategory("viewpoint")).toEqual({ theme: "sights", vague: true })
    expect(themeFromCategory("tourist_attraction")).toEqual({ theme: "sights", vague: true })
    expect(themeFromCategory("park")).toEqual({ theme: "nature", vague: true })
    expect(themeFromCategory("national_park")).toEqual({ theme: "nature", vague: false })
    expect(themeFromCategory("restaurant")).toEqual({ theme: "food", vague: false })
  })

  it("treats parking and lodging as Other, not a park or a sight", () => {
    expect(themeFromCategory("parking")?.theme).toBe("other")
    expect(themeFromCategory("lodging")?.theme).toBe("other")
  })
})

describe("inferredTheme", () => {
  it("is what the idea would be without the traveller's pick", () => {
    expect(inferredTheme(place("Tosokchon", "restaurant", { theme: "nightlife" }))).toBe("food")
  })
})
