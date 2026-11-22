import { Building2, Landmark, MapPin, Martini, ShoppingBag, Ticket, Trees, UtensilsCrossed, type LucideIcon } from "lucide-react"
import { ITEM_THEMES, type ItemTheme, type ItineraryItem } from "../types"

// What kind of outing a wishlist idea is: the wishlist's filter chips and
// its "Group by type" headings. The traveller's own pick (`item.theme`)
// always wins; without one the theme is read from the place itself, and
// anything this cannot tell lands in "Other" rather than a wrong guess.

export interface ThemeInfo {
  /** Sentence case, short enough for a chip ("Food & cafés"). */
  label: string
  icon: LucideIcon
}

export const THEMES: Record<ItemTheme, ThemeInfo> = {
  food: { label: "Food & cafés", icon: UtensilsCrossed },
  nature: { label: "Nature & outdoors", icon: Trees },
  sights: { label: "Sights & culture", icon: Landmark },
  neighborhood: { label: "Neighborhoods", icon: Building2 },
  shopping: { label: "Shopping", icon: ShoppingBag },
  nightlife: { label: "Bars & nightlife", icon: Martini },
  activity: { label: "Experiences", icon: Ticket },
  other: { label: "Other", icon: MapPin },
}

/** The order chips and type headings come in: `ITEM_THEMES`, "Other" last. */
export const THEME_ORDER: readonly ItemTheme[] = ITEM_THEMES

export const themeLabel = (theme: ItemTheme) => THEMES[theme].label

// ── From the place's category ───────────────────────────────────────────
//
// `location.category` is usually the coarse vocabulary the place searches
// write (server `categoryFor`, `geocode.ts`, Instagram imports: restaurant,
// cafe, bar, park, viewpoint, …), but an AI-added place can carry any short
// string, including a raw Google type (`hiking_area`, `ramen_restaurant`).
//
// A "vague" category has a likely theme that the name can overrule: the
// server files an amusement park under `park` and a ticketed tower under
// `landmark`, and OpenStreetMap files a beach under `viewpoint`.

interface FromCategory {
  theme: ItemTheme
  vague: boolean
}

const EXACT: Record<string, FromCategory> = {
  restaurant: { theme: "food", vague: false },
  cafe: { theme: "food", vague: false },
  bakery: { theme: "food", vague: false },
  // Gwangjang, Borough, La Boqueria: a market a traveller saves is mostly for eating
  // (the server's own meal signals count it as food too). A flea market says so by name.
  market: { theme: "food", vague: false },
  bar: { theme: "nightlife", vague: false },
  shopping: { theme: "shopping", vague: false },
  museum: { theme: "sights", vague: false },
  palace: { theme: "sights", vague: false },
  neighborhood: { theme: "neighborhood", vague: false },
  hotel: { theme: "other", vague: false },
  transit: { theme: "other", vague: false },
  park: { theme: "nature", vague: true },
  viewpoint: { theme: "sights", vague: true },
  landmark: { theme: "sights", vague: true },
  tourist_attraction: { theme: "sights", vague: true },
  experience: { theme: "activity", vague: true },
}

/**
 * Whole `_`-separated words of a raw type, so `speakeasy` is not a peak,
 * `public_bath` not a pub and `campus` not a campsite. A word may span
 * tokens (`theme_park`).
 */
const words = (list: string) => new RegExp(`(?:^|_)(?:${list})(?:$|_)`)

/** Raw types, first match wins. Order matters: `amusement_park` is an outing before it is a park. */
const RAW_TYPES: ReadonlyArray<[RegExp, ItemTheme]> = [
  [words("parking|lodging|hotel|hostel|motel|guest_house|airport|station|transit|bus_stop|car_rental|atm|bank|hospital|pharmacy"), "other"],
  [
    words("amusement_park|amusement_center|theme_park|water_park|zoo|aquarium|spa|sauna|hot_spring|onsen|jjimjilbang|tour|tours|theat(?:er|re)|cinema|movie_theater|concert_hall|performing_arts|stadium|arena|bowling_alley|golf_course|ski_resort|casino|escape_room|workshop|class"),
    "activity",
  ],
  [
    words("restaurant|cafe|cafeteria|coffee|coffee_shop|bakery|bistro|diner|food|food_court|meal_takeaway|meal_delivery|tea_house|dessert|dessert_shop|ice_cream|patisserie|pastry|confectionery|deli|juice_shop|brunch|bar_and_grill|steak_house|steakhouse|pizzeria|market|food_market|farmers_market|night_market"),
    "food",
  ],
  [words("bar|pub|night_?club|lounge|karaoke|brewery|brewpub|izakaya|jazz_club|beer_garden|biergarten|speakeasy"), "nightlife"],
  [words("store|shop|shopping|shopping_mall|mall|boutique|outlet|department_store|supermarket|duty_free|flea_market|bookstore"), "shopping"],
  [
    words("hiking_area|hiking|trail|park|national_park|state_park|garden|botanical_garden|beach|nature|nature_reserve|reserve|forest|mountain|mountain_peak|peak|lake|waterfall|island|campground|camping|valley|canyon|cave"),
    "nature",
  ],
  [
    words("museum|art_gallery|gallery|palace|castle|temple|shrine|church|cathedral|chapel|basilica|mosque|synagogue|pagoda|monastery|place_of_worship|monument|memorial|historic|historical|landmark|attraction|viewpoint|observation_deck|observatory|lookout|scenic_spot|tower|ruins|heritage|cultural_center|cultural"),
    "sights",
  ],
  [words("neighbou?rhood|sublocality|locality|district|quarter|street|route"), "neighborhood"],
]

/** Vague raw types: a likely theme the name may overrule. */
const VAGUE_RAW = words("attraction|landmark|viewpoint|observation_deck|lookout|scenic_spot|experience")

const normalise = (category: string) => category.trim().toLowerCase().replace(/[\s-]+/g, "_")

export function themeFromCategory(category: string | undefined): FromCategory | null {
  if (!category) return null
  const key = normalise(category)
  if (!key || key === "venue" || key === "other" || key === "point_of_interest" || key === "establishment") return null
  if (EXACT[key]) return EXACT[key]
  for (const [re, theme] of RAW_TYPES) {
    if (re.test(key)) return { theme, vague: VAGUE_RAW.test(key) }
  }
  return null
}

// ── From a booking ──────────────────────────────────────────────────────

const RESERVATION: Record<string, ItemTheme> = {
  meal: "food",
  bar: "nightlife",
  experience: "activity",
  event: "activity",
}

// ── From the name ───────────────────────────────────────────────────────
//
// Conservative on purpose: whole words only, the place's name and title
// only (an address is full of street names: "Park-ro", "-gil"), checked in
// this order so the more telling word wins ("Sushi Bar" is food, "Golf
// Club" is an outing, "Park Hyatt" a hotel). No match is "Other", never a
// guess. Hangul and Japanese have no word breaks: those match as suffixes
// or as whole tokens.

const NAME_RULES: ReadonlyArray<[RegExp, ItemTheme]> = [
  [/\b(hotel|hostel|inn|ryokan|guest ?house|hyatt|hilton|marriott|airport|station|terminal)\b|호텔|게스트하우스|공항|역$/, "other"],
  [
    /\b(theme park|amusement park|water ?park|zoo|aquarium|tours?|class|workshop|spa|sauna|jjimjilbang|onsen|hot springs?|cooking|cruise|kayak(ing)?|surf(ing)?|golf|bowling|escape room|cinema|theat(er|re)|musical|concert)\b|찜질방|체험|공연|温泉/,
    "activity",
  ],
  [
    /\b(restaurants?|caf[eé]s?|coffee|roast(ers|ery)|bakery|bakeries|boulangerie|patisserie|bistro|brasserie|trattoria|osteria|taverna|diner|eatery|noodles?|ramen|udon|soba|sushi|pizza|pizzeria|bbq|barbecue|dumplings?|tacos?|taqueria|deli|gelato|ice cream|desserts?|tea ?house|food|grill|juice|brunch|burgers?|bagels?|dim sum|hot ?pot|pojangmacha|pocha)\b|(?<!(flea|antiques?) )\bmarkets?\b|식당|맛집|카페|시장|국밥|냉면|베이커리|ラーメン|食堂|カフェ|市場/,
    "food",
  ],
  [/\b(bars?|pubs?|night ?club|jazz club|brewery|brewing|taproom|beer hall|cocktails?|speakeasy|karaoke|noraebang|lounge|izakaya)\b|술집|노래방|居酒屋/, "nightlife"],
  [/\b(shops?|shopping|stores?|mall|boutiques?|outlets?|department store|bookstore|bookshop|flagship|duty free|flea market|antiques?|vintage)\b|백화점|쇼핑|서점|아울렛/, "shopping"],
  [
    /\b(trails?|hikes?|hiking|trek(king)?|mountains?|mt|peak|summit|beach(es)?|park|forest|woods|waterfall|falls|lake|national park|nature|islands?|valley|canyon|gorge|cliffs?|caves?|botanic(al)? gardens?|gardens|volcano|crater|lagoon)\b|공원|해수욕장|해변|숲|둘레길|오름|폭포|公園/,
    "nature",
  ],
  [
    /\b(museum|gallery|palace|castle|temple|shrine|church|cathedral|chapel|basilica|mosque|synagogue|pagoda|monastery|abbey|monument|memorial|tower|fortress|ruins|tomb|gate|observatory|observation deck|lookout|viewpoint|bridge|statue|plaza|square|heritage)\b|박물관|미술관|성당|사찰|타워|궁(?=$|\s)|寺|神社|城|美術館|博物館/,
    "sights",
  ],
  [
    /\b(alley(way)?s?|lane|street|district|quarter|neighbou?rhood|old town|chinatown|downtown|village|[a-z]+-(gil|dong|ro|gu|machi|ch[oō]))\b|골목|거리|마을|(?:^|\s)[가-힣]+(?:동|길)(?=$|\s)/,
    "neighborhood",
  ],
]

export function themeFromName(name: string): ItemTheme | null {
  const text = name.normalize("NFC").toLowerCase()
  if (!text.trim()) return null
  for (const [re, theme] of NAME_RULES) if (re.test(text)) return theme
  return null
}

/**
 * The wishlist theme of an idea: the traveller's pick; else a telling
 * category; else what a booking is for; else a telling word in its name;
 * else a vague category's likely theme; else "other".
 */
export function themeOf(item: Pick<ItineraryItem, "kind" | "title" | "theme" | "location" | "reservation">): ItemTheme {
  if (item.theme) return item.theme
  if (item.kind === "section") return "other"
  const fromCategory = item.kind === "note" ? null : themeFromCategory(item.location?.category)
  if (fromCategory && !fromCategory.vague) return fromCategory.theme
  if (item.kind === "reservation") {
    const type = item.reservation?.type
    if (type) return RESERVATION[type] ?? "other"
  }
  const named = themeFromName([item.title, item.location?.name].filter(Boolean).join(" "))
  if (named) return named
  return fromCategory?.theme ?? "other"
}

/** The theme `themeOf` would infer if the traveller had not picked one: the "Automatic (…)" choice. */
export const inferredTheme = (item: Pick<ItineraryItem, "kind" | "title" | "theme" | "location" | "reservation">) =>
  themeOf({ ...item, theme: undefined })
