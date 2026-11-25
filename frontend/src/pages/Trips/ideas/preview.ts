import type { ItemTheme, ItineraryItem, Trip } from "../types"
import { ELSEWHERE, areaOf, normaliseName } from "./areas"
import { ideaName, type PlacePhoto } from "./contract"
import { cachedPlaceDetails, detailsTarget } from "./placeDetailsApi"
import { themeOf } from "./themes"

// What the map's preview card says about a wishlist place, from the trip
// and what this page already holds: no request is made for a preview.

export interface IdeaPreview {
  name: string
  /** The category the Wishlist tab files it under. */
  theme: ItemTheme
  /** The trip's city or the town it is in; null when the most that could be said is "Elsewhere". */
  area: string | null
  /** The street part of its address, when that says more than the area and the name. */
  street: string | null
  /** The first line of the traveller's notes. */
  note: string | null
  /** A photo already loaded for its details this session; null rather than a fetch. */
  photo: PlacePhoto | null
}

const plain = (part: string) => normaliseName(part.replace(/\S*\d\S*/g, ""))

/** "161 Sajik-ro, Jongno District, Seoul, South Korea" in Seoul → "161 Sajik-ro, Jongno District". */
export function streetLine(address: string | undefined, area: string | null, name: string): string | null {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean)
  const town = area ? parts.findIndex((part) => plain(part) === normaliseName(area)) : -1
  const before = (town >= 0 ? parts.slice(0, town) : parts.slice(0, 2)).filter((part) => normaliseName(part) !== normaliseName(name))
  return before.length > 0 ? before.slice(0, 2).join(", ") : null
}

export function ideaPreview(idea: ItineraryItem, trip: Pick<Trip, "days" | "destinations">, now = Date.now()): IdeaPreview {
  const name = ideaName(idea)
  const found = areaOf(idea, trip)
  const area = found.rank < ELSEWHERE.rank ? found.label : null
  const target = detailsTarget(idea)
  const note = idea.notes?.split("\n").map((line) => line.trim()).find(Boolean) ?? null
  return {
    name,
    theme: themeOf(idea),
    area,
    street: streetLine(idea.location?.address, area, name),
    note,
    photo: (target && cachedPlaceDetails(target, now)?.photos[0]) || null,
  }
}
