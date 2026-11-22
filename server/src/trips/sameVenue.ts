import { haversineMeters } from "../data/koreaPlaces"
import type { ItemKind } from "./types"

/**
 * Whether two stops are the same venue, so a review never puts one on the
 * trip twice under a slightly different name.
 *
 * A stop's name is its place's name, or its title when it has none; a part
 * in brackets counts as another name for it ("Gyeongbokgung Palace
 * (경복궁)"). Names are compared word by word, in order, ignoring case,
 * accents, punctuation, spacing and filler ("of", "the"). Two names match
 * when they have the same words, or when the longer one only adds words
 * that say what kind of place it is ("Leeum" and "Leeum Museum of Art",
 * "Gwangjang Market" and "Gwangjang"). A word that names a different place
 * ("Lotte World" and "Lotte World Tower") or a different number ("Stop 1-2"
 * and "Stop 2-1") never matches.
 *
 * Where both stops have a pin, the pins must agree too: two branches of a
 * chain far apart are different stops.
 */

/** The parts of an item or a proposed stop that say which venue it is. */
export interface VenueLike {
  kind?: ItemKind
  title?: string
  location?: { name?: string; lat?: number; lng?: number }
}

/** Pins further apart than this are different venues, whatever the names say. */
export const SAME_NAME_MAX_METERS = 1_000
/** For names that only match up to a kind word, the pins must be this close. */
export const SIMILAR_NAME_MAX_METERS = 400

const FILLER = new Set(["the", "of", "and", "a", "an", "at", "in", "on", "de", "la", "le"])

/**
 * Words that say what kind of place a venue is without naming another one.
 * Kept short on purpose: "tower", "station" or "gate" often name a different
 * venue next door ("Lotte World Tower", "Namdaemun Gate").
 */
const KIND_WORDS = new Set([
  "museum",
  "art",
  "arts",
  "gallery",
  "palace",
  "temple",
  "shrine",
  "market",
  "park",
  "garden",
  "gardens",
  "cafe",
  "coffee",
  "restaurant",
  "bakery",
  "official",
  "main",
  "flagship",
  "store",
  "shop",
  "branch",
  "hall",
  "center",
  "centre",
  "observatory",
  "aquarium",
  "cathedral",
  "church",
])

interface Name {
  words: readonly string[]
  joined: string
}

interface Venue {
  names: readonly Name[]
  point?: { lat: number; lng: number }
}

function words(text: string): string[] {
  const all = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w))
  // A lone Latin letter ("N Seoul Tower") rarely tells two venues apart.
  const kept = all.filter((w) => !/^[a-z]$/.test(w))
  return kept.length ? kept : all
}

function name(text: string): Name | null {
  const list = words(text)
  return list.length ? { words: list, joined: list.join("") } : null
}

/** The name, the name without its brackets, and what the brackets hold. */
function namesOf(text: string): Name[] {
  const bracketed = [...text.matchAll(/[([（]([^)\]）]*)[)\]）]/g)].map((m) => m[1]!)
  const bare = text.replace(/[([（][^)\]）]*[)\]）]/g, " ")
  const out: Name[] = []
  for (const candidate of [text, bare, ...bracketed]) {
    const n = name(candidate)
    if (n && !out.some((o) => o.joined === n.joined)) out.push(n)
  }
  return out
}

function venueOf(item: VenueLike): Venue | null {
  if (item.kind === "note" || item.kind === "section") return null
  const label = item.location?.name?.trim() || item.title?.trim() || ""
  const names = namesOf(label)
  if (names.length === 0) return null
  const loc = item.location
  return { names, ...(loc?.lat != null && loc.lng != null ? { point: { lat: loc.lat, lng: loc.lng } } : {}) }
}

type NameMatch = "same" | "similar" | null

function compareNames(a: Name, b: Name): NameMatch {
  if (a.joined === b.joined) return "same"
  const [small, large] = a.words.length <= b.words.length ? [a.words, b.words] : [b.words, a.words]
  if (small.length === large.length) return null
  // The shorter name has to name something, not just be a kind of place.
  if (small.every((w) => KIND_WORDS.has(w))) return null
  // Its words in order, with only kind words around them.
  let next = 0
  for (const word of large) {
    if (next < small.length && word === small[next]) next++
    else if (!KIND_WORDS.has(word)) return null
  }
  return next === small.length ? "similar" : null
}

function sameVenueOf(a: Venue, b: Venue): boolean {
  let best: NameMatch = null
  for (const x of a.names) {
    for (const y of b.names) {
      const m = compareNames(x, y)
      if (m === "same") best = "same"
      else if (m === "similar" && best === null) best = "similar"
    }
    if (best === "same") break
  }
  if (best === null) return false
  if (!a.point || !b.point) return true
  const meters = haversineMeters(a.point, b.point)
  return meters <= (best === "same" ? SAME_NAME_MAX_METERS : SIMILAR_NAME_MAX_METERS)
}

/** Whether `a` and `b` are the same venue. Notes and headings are never venues. */
export function sameVenue(a: VenueLike, b: VenueLike): boolean {
  const va = venueOf(a)
  const vb = venueOf(b)
  return va !== null && vb !== null && sameVenueOf(va, vb)
}

/** Venues seen so far: the trip's stops, then each stop a review adds. */
export interface VenueSet {
  has(item: VenueLike): boolean
  add(item: VenueLike): void
}

export function venueSet(items: Iterable<VenueLike> = []): VenueSet {
  const seen: Venue[] = []
  const set: VenueSet = {
    has(item) {
      const v = venueOf(item)
      return v !== null && seen.some((s) => sameVenueOf(s, v))
    },
    add(item) {
      const v = venueOf(item)
      if (v) seen.push(v)
    },
  }
  for (const item of items) set.add(item)
  return set
}
