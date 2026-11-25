import type { ItemTheme, ItineraryItem, Trip } from "../types"
import { ELSEWHERE, areaOf, normaliseName, streetFirst } from "./areas"
import { ideaName, type PlacePhoto } from "./contract"
import { cachedPlaceDetails, detailsTarget, type DetailsTarget } from "./placeDetailsApi"
import { themeOf } from "./themes"

// What the map's preview card says about a wishlist place, from the trip
// and what this session already looked up. The card asks for the photo
// itself (`lookup`), once the pointer or focus has rested on the pin.

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
  /** A photo loaded for its details this session. */
  photo: PlacePhoto | null
  /** What to look up for a photo: this session has no answer about the place yet. Null once it has, or with nothing to look up. */
  lookup: DetailsTarget | null
}

const plain = (part: string) => normaliseName(part.replace(/\S*\d\S*/g, ""))

/**
 * "161 Sajik-ro, Jongno District, Seoul, South Korea" in Seoul → "161
 * Sajik-ro, Jongno District"; "Japan, 〒150-0041 Tokyo, Shibuya, Jinnan,
 * 1-chōme-22-7" in Tokyo → "1-chōme-22-7, Jinnan". Never the country or a postcode.
 */
export function streetLine(address: string | undefined, area: string | null, name: string): string | null {
  const parts = streetFirst(address)
  const town = area ? parts.findIndex((part) => plain(part) === normaliseName(area)) : -1
  const before = (town >= 0 ? parts.slice(0, town) : parts.slice(0, 2)).filter((part) => normaliseName(part) !== normaliseName(name))
  return before.length > 0 ? before.slice(0, 2).join(", ") : null
}

export function ideaPreview(idea: ItineraryItem, trip: Pick<Trip, "days" | "destinations">, now = Date.now()): IdeaPreview {
  const name = ideaName(idea)
  const found = areaOf(idea, trip)
  const area = found.rank < ELSEWHERE.rank ? found.label : null
  const target = detailsTarget(idea)
  const known = target ? cachedPlaceDetails(target, now) : null
  const note = idea.notes?.split("\n").map((line) => line.trim()).find(Boolean) ?? null
  return {
    name,
    theme: themeOf(idea),
    area,
    street: streetLine(idea.location?.address, area, name),
    note,
    photo: known?.photos[0] ?? null,
    lookup: target && known === undefined ? target : null,
  }
}
