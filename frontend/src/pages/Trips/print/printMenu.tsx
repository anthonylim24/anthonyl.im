import { ClipboardCopy, Printer } from "lucide-react"
import type { MenuItem } from "../components/kit"
import type { Trip } from "../types"
import { COPY_MESSAGE, copyItinerary } from "./copyItinerary"

/** "Print itinerary" for the trip menu. Pair with `usePrintItinerary`. */
export function printMenuItem(controls: { printing: boolean; print: () => void }): MenuItem {
  return {
    label: "Print itinerary",
    icon: <Printer size={16} strokeWidth={1.75} aria-hidden />,
    disabled: controls.printing,
    onSelect: controls.print,
  }
}

/** "Copy itinerary" for the trip menu: plain text for a message. `announce` gets the outcome. */
export function copyMenuItem(trip: Trip, announce: (message: string) => void): MenuItem {
  return {
    label: "Copy itinerary",
    icon: <ClipboardCopy size={16} strokeWidth={1.75} aria-hidden />,
    onSelect: () =>
      void copyItinerary(trip).then((result) => {
        const message = COPY_MESSAGE[result]
        if (message) announce(message)
      }),
  }
}
