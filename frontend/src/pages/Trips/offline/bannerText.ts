import type { CopyShown } from "./tripsDevice"

/** "3:12 PM" today, "Mar 3, 3:12 PM" before. */
export function copyTime(savedAt: number, now = Date.now()): string {
  const at = new Date(savedAt)
  const today = new Date(now).toDateString() === at.toDateString()
  return new Intl.DateTimeFormat(undefined, today ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at)
}

/**
 * What the banner says while pages show kept copies: why, what, and from
 * when. Null when everything on screen is live.
 */
export function copyBannerText({
  shown,
  mode,
  online,
  now = Date.now(),
}: {
  shown: CopyShown | null
  mode: "live" | "copy"
  online: boolean
  now?: number
}): string | null {
  if (!shown && mode === "live") return null
  const why = !online ? "Offline" : mode === "copy" ? "Sign-in isn’t loading" : "Can’t reach the server"
  const what = !shown
    ? "showing what’s saved on this device"
    : `showing your saved ${shown.what === "list" ? "list of trips" : "copy"} from ${copyTime(shown.savedAt, now)}`
  const edits = shown?.unsaved ? ", with edits made here that aren’t saved yet" : ""
  return `${why} · ${what}${edits}. Nothing can be changed until it’s back.`
}

/** What the banner says when edits on a trip just left couldn't be stored. */
export function leftUnsavedText(name: string, reason: string, kept: boolean): string {
  const trip = name.trim() ? `“${name.trim()}”` : "this trip"
  return kept
    ? `Your last edits to ${trip} aren’t saved yet: ${reason}. They’re kept on this device and will save when you open the trip again.`
    : `Your last edits to ${trip} couldn’t be saved: ${reason}.`
}
