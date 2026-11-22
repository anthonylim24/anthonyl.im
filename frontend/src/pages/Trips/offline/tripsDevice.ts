import { createContext, useContext, useEffect } from "react"
import { noStore, type DeviceStore } from "./deviceStore"

// What every Trips page needs to know about this device: where trips are
// kept, whose they are, and whether the pages are showing kept copies
// because sign-in or the server can't be reached. `TripsLayout` provides
// it; without a provider nothing is kept and everything is live.

/** A page is showing what this device kept, not the server's latest. */
export interface CopyShown {
  what: "trip" | "list"
  /** When the copy was taken (ms since the epoch). */
  savedAt: number
  /** It includes edits made on this device that aren't stored yet. */
  unsaved: boolean
}

export interface TripsDevice {
  store: DeviceStore
  /** Whose trips this device may keep and show; null keeps nothing. */
  owner: string | null
  /**
   * "copy": sign-in can't load (offline, or blocked) but this browser is
   * still signed in as `owner`. Pages show kept copies, read-only, and
   * make no requests that need sign-in.
   */
  mode: "live" | "copy"
  /** Say a page is showing a kept copy (null when it stops). Use `useShowCopy`. */
  showCopy: (shown: CopyShown | null) => void
  /** Edits on a trip just left couldn't be stored. They stay on this device for the next visit. */
  leftUnsaved: (tripName: string, reason: string) => void
}

const nothing = () => undefined

export const liveOnly: TripsDevice = { store: noStore, owner: null, mode: "live", showCopy: nothing, leftUnsaved: nothing }

export const TripsDeviceContext = createContext<TripsDevice>(liveOnly)

export const useTripsDevice = () => useContext(TripsDeviceContext)

/** Tell the layout this page shows a kept copy, for as long as it does. */
export function useShowCopy(shown: CopyShown | null): void {
  const { showCopy } = useTripsDevice()
  const what = shown?.what
  const savedAt = shown?.savedAt
  const unsaved = shown?.unsaved ?? false
  useEffect(() => {
    if (what === undefined || savedAt === undefined) return
    showCopy({ what, savedAt, unsaved })
    return () => showCopy(null)
  }, [showCopy, what, savedAt, unsaved])
}
