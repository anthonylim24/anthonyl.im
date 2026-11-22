import { CalendarArrowDown } from "lucide-react"
import { importWithRetry } from "../../../lib/lazyRetry"
import { reportClientEvent } from "../../../lib/telemetry"
import type { MenuItem } from "../components/kit"
import type { Trip, TripDay } from "../types"
import { isCalendarItem } from "./calendarItems"

/** Hand the browser a file to save. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.rel = "noopener"
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the blob after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Save the trip, or one day of it, as an `.ics` file. The exporter is its own
 * chunk, fetched on first use; the promise settles once the file is handed
 * over, or once a chunk that would not load has been reported (never thrown).
 */
export function exportCalendar(trip: Trip, day?: TripDay): Promise<void> {
  return importWithRetry(() => import("./ics"))
    .then(({ calendarFileName, tripToIcs }) => {
      const { text } = tripToIcs(trip, { dayId: day?.id, now: Date.now() })
      download(calendarFileName(trip, day), text)
    })
    .catch((error: unknown) => {
      reportClientEvent("calendar-export", error instanceof Error ? error.message : String(error))
    })
}

/** "Export to calendar" for a trip or day menu. Off when there is nothing to export. */
export function calendarMenuItem(trip: Trip, day?: TripDay): MenuItem {
  const days = day ? [day] : trip.days
  return {
    label: "Export to calendar",
    icon: <CalendarArrowDown size={16} strokeWidth={1.75} aria-hidden />,
    disabled: !days.some((d) => d.items.some(isCalendarItem)),
    onSelect: () => void exportCalendar(trip, day),
  }
}
