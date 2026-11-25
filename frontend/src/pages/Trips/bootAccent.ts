import { TRIP_ACCENTS } from "./meta"
import type { TripAccent } from "./types"

// The boot script in index.html reads this before any bundle runs, to paint
// the Trips boot screen in the accent of the trip being opened.
const KEY = "trips-boot-accent"
const KEEP = 24

function readSaved(): Record<string, TripAccent> {
  let parsed: unknown
  try {
    parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}")
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, TripAccent] => TRIP_ACCENTS.includes(entry[1] as TripAccent)),
  )
}

/** Remembers `accent` for the trip at `/trips/<urlId>`, the most recent 24 trips only. */
export function rememberTripAccent(urlId: string, accent: TripAccent): void {
  try {
    const saved = readSaved()
    if (saved[urlId] === accent) return
    delete saved[urlId]
    const kept = Object.entries(saved).slice(-(KEEP - 1))
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries([...kept, [urlId, accent]])))
  } catch {
    // Full or blocked storage: the boot screen paints in the Trips colours instead.
  }
}
