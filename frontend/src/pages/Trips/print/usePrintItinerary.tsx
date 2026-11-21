import { Suspense, useCallback, useState, type ReactNode } from "react"
import { OverlayBoundary } from "@/components/OverlayBoundary"
import { lazyRetry } from "@/lib/lazyRetry"
import type { Trip } from "../types"

// The printout (its layout, map stills and print stylesheet) is fetched the
// first time someone prints, not with the workspace.
const PrintItinerary = lazyRetry(() => import("./PrintItinerary").then((m) => ({ default: m.PrintItinerary })))

export interface PrintItineraryControls {
  /** True from `print()` until the dialog is over (or cancelled, or the printout failed to load). */
  printing: boolean
  /** Prepare the printout and open the print dialog. Ignored while printing or without a trip. */
  print: () => void
  /** Render this anywhere: it portals itself into `document.body`. */
  node: ReactNode
}

/**
 * Print state for a page that offers "Print itinerary". The printout is
 * taken from `trip` as it is when `print()` is called. `onError` hears when
 * the printout could not load or render (offline, a stale build); printing
 * is over by then.
 */
export function usePrintItinerary(trip: Trip | null, onError?: (error: Error) => void): PrintItineraryControls {
  const [printing, setPrinting] = useState(false)
  const done = useCallback(() => setPrinting(false), [])
  const print = useCallback(() => {
    if (trip) setPrinting(true)
  }, [trip])
  const failed = (error: Error) => {
    setPrinting(false)
    onError?.(error)
  }
  return {
    printing,
    print,
    node:
      printing && trip ? (
        <OverlayBoundary onError={failed}>
          <Suspense fallback={null}>
            <PrintItinerary trip={trip} onDone={done} />
          </Suspense>
        </OverlayBoundary>
      ) : null,
  }
}
