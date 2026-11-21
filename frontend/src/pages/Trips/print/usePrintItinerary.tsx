import { useCallback, useState, type ReactNode } from "react"
import type { Trip } from "../types"
import { PrintItinerary } from "./PrintItinerary"

export interface PrintItineraryControls {
  /** True from `print()` until the dialog is over (or cancelled). */
  printing: boolean
  /** Prepare the printout and open the print dialog. Ignored while printing or without a trip. */
  print: () => void
  /** Render this anywhere: it portals itself into `document.body`. */
  node: ReactNode
}

/**
 * Print state for a page that offers "Print itinerary". The printout is
 * taken from `trip` as it is when `print()` is called.
 */
export function usePrintItinerary(trip: Trip | null): PrintItineraryControls {
  const [printing, setPrinting] = useState(false)
  const done = useCallback(() => setPrinting(false), [])
  const print = useCallback(() => {
    if (trip) setPrinting(true)
  }, [trip])
  return {
    printing,
    print,
    node: printing && trip ? <PrintItinerary trip={trip} onDone={done} /> : null,
  }
}
