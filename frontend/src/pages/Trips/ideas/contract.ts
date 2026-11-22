import type { ReactNode } from "react"
import type { GetToken } from "../../../effect/http"
import type { UndoMark } from "../editorMachine"
import type { ItemTheme, ItineraryItem, Trip } from "../types"

// The seam between the wishlist's pieces: the details popover
// (`IdeaDetails`), the day picker with recommended days (`IdeaDayPicker`),
// the overlay that opens them (`IdeaOverlay`), and the map's idea pins.

/** One photo of a place. `url` carries no API key and goes straight into an <img>. */
export interface PlacePhoto {
  url: string
  width?: number
  height?: number
  /** Who took it. Google's terms require showing this with the photo. */
  author?: { name: string; uri?: string }
}

/** GET /api/places/details: what the popover shows. Fetched on open, never written to the trip. */
export interface PlaceDetails {
  placeId?: string
  name: string
  /** A sentence or two about the place. */
  summary?: string
  /** Where `summary` came from, for its credit line. */
  summarySource?: "google" | "wikipedia"
  /** The page the summary came from, when it has one (Wikipedia). */
  summaryUrl?: string
  address?: string
  /** 1 to 5. */
  rating?: number
  ratingCount?: number
  /** 0 free … 4 very expensive. */
  priceLevel?: 0 | 1 | 2 | 3 | 4
  /** One line per weekday, in the order and words Google writes them for the language asked ("Monday: 9:00 AM – 5:00 PM"). */
  hours?: string[]
  website?: string
  phone?: string
  mapsUrl?: string
  /** The kind of place, for people ("Ramen restaurant"). */
  typeLabel?: string
  photos: PlacePhoto[]
}

/** POST /api/trips/:id/ideas/suggest-days: the idea travels in the body, so one saved a moment ago works. */
export interface SuggestDaysRequest {
  idea: {
    title: string
    notes?: string
    theme?: ItemTheme
    location?: { name: string; address?: string; lat?: number; lng?: number; category?: string; placeId?: string }
  }
}

/** One recommended day. */
export interface DayPick {
  dayId: string
  /** One short sentence on why this day ("A short walk from Gwangjang Market, your lunch stop"). */
  reason: string
  /** Straight-line km from the idea to that day's nearest located stop, when both have points. */
  nearestKm?: number
}

export interface DaySuggestions {
  /** Best first, at most 3. Every `dayId` is a day of the trip. */
  picks: DayPick[]
  /** "ai": the model chose. "nearby": the distance fallback (no key, a failure, or a timeout). */
  source: "ai" | "nearby"
}

type Edit = (fn: (doc: Trip) => Trip, undo?: UndoMark) => void

/** Who opened an idea's details: a list row anchors a popover on it; a map pin opens a sheet. */
export type IdeaOpener = "row" | "map"

/** The details popover for one wishlist idea (`ideas/IdeaDetails.tsx`). */
export interface IdeaDetailsProps {
  trip: Trip
  idea: ItineraryItem
  /**
   * Who opened it. "row": a popover beside that list row on wide screens,
   * when the row is in view as they open. A map pin or a pasted link (null),
   * or a phone: a sheet. Read once, when they open.
   */
  from: IdeaOpener | null
  editable: boolean
  locked: boolean
  getToken: GetToken
  /** The category control, owned by the wishlist, shown by the title. */
  themeControl?: ReactNode
  onAddToDay: () => void
  onRemove: () => void
  onClose: () => void
}

/** The day picker for one idea, recommended days first (`ideas/IdeaDayPicker.tsx`). */
export interface IdeaDayPickerProps {
  trip: Trip
  idea: ItineraryItem
  getToken: GetToken
  onPick: (dayId: string) => void
  onClose: () => void
}

/**
 * What the wishlist opens over the page, mounted once by TripWorkspace
 * (`ideas/IdeaOverlay.tsx`), so a pin on any map opens the same popover the
 * list does. Driven by the URL: `?idea=<id>` opens that idea's details,
 * `?idea=<id>&add=1` its day picker.
 */
export interface IdeaOverlayProps {
  trip: Trip
  editable: boolean
  locked: boolean
  getToken: GetToken
  onEdit: Edit
}

/**
 * What to call an idea anywhere it is named (a heading, a dialog's name, an
 * alt text, a pin): its title, else its place's name. Never empty, so no
 * dialog or button goes unnamed.
 */
export function ideaName(idea: Pick<ItineraryItem, "title" | "location">): string {
  return idea.title.trim() || idea.location?.name.trim() || "Untitled place"
}

export const IDEA_PARAM = "idea"
export const IDEA_ADD_PARAM = "add"
/** `data-idea-anchor="<id>"` on the element a row opens the popover from. */
export const IDEA_ANCHOR_ATTR = "data-idea-anchor"

/** The params with `ideaId`'s details (or its day picker) open; null closes both. Never mutates `params`. */
export function withIdea(params: URLSearchParams, ideaId: string | null, add = false): URLSearchParams {
  const next = new URLSearchParams(params)
  if (ideaId) next.set(IDEA_PARAM, ideaId)
  else next.delete(IDEA_PARAM)
  if (ideaId && add) next.set(IDEA_ADD_PARAM, "1")
  else next.delete(IDEA_ADD_PARAM)
  return next
}
