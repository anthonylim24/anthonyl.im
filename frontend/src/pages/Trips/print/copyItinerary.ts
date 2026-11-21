import type { Trip } from "../types"
import { itineraryText } from "./itineraryText"

// Hand the itinerary to another app: the clipboard, or the system share
// sheet. The text is built before the first await so the browser still
// counts the call as part of the click (clipboard and share both need that).

export type CopyResult = "copied" | "failed"
export type ShareResult = "shared" | "cancelled" | CopyResult

/** What to announce after each outcome; a dismissed share sheet says nothing. */
export const COPY_MESSAGE: Record<ShareResult, string | null> = {
  copied: "Itinerary copied",
  shared: "Itinerary shared",
  cancelled: null,
  failed: "Couldn't copy the itinerary",
}

function execCopy(): boolean {
  try {
    return document.execCommand("copy")
  } catch {
    // Some browsers throw instead of returning false: same answer.
    return false
  }
}

/**
 * The pre-Clipboard-API path: select a hidden textarea and ask the document
 * to copy. Hands focus back to wherever it was, so the person keeps their place.
 */
function copyWithSelection(text: string): CopyResult {
  const area = document.createElement("textarea")
  area.value = text
  area.setAttribute("readonly", "")
  area.setAttribute("aria-hidden", "true")
  area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none"
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.body.append(area)
  area.select()
  const copied = execCopy()
  area.remove()
  previous?.focus({ preventScroll: true })
  return copied ? "copied" : "failed"
}

export async function copyText(text: string): Promise<CopyResult> {
  if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text)
      return "copied"
    } catch {
      // No permission, or the document lost focus: the selection path can still work.
    }
  }
  return copyWithSelection(text)
}

/** Copy the itinerary as plain text, ready to paste into a message. */
export function copyItinerary(trip: Trip, options: { includeNotes?: boolean } = {}): Promise<CopyResult> {
  return copyText(itineraryText(trip, { format: "plain", includeNotes: options.includeNotes }))
}

/** Open the share sheet with the itinerary; copy it where there is no share sheet. */
export async function shareItinerary(trip: Trip): Promise<ShareResult> {
  const text = itineraryText(trip, { format: "plain" })
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: trip.name, text })
      return "shared"
    } catch (error) {
      // Closing the sheet is a choice, not a failure. Compared by name, not
      // `instanceof DOMException`, which differs across test realms.
      if ((error as { name?: unknown } | null)?.name === "AbortError") return "cancelled"
      // Anything else (no permission, nothing to share to): copy instead.
    }
  }
  return copyText(text)
}
