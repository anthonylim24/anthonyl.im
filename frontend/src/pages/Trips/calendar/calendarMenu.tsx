import { CalendarArrowDown } from "lucide-react"
import type { MenuItem } from "../components/kit"
import type { Trip, TripDay } from "../types"
import { calendarFileName, isCalendarItem, tripToIcs } from "./ics"

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

/** Save the trip, or one day of it, as an `.ics` file. */
export function exportCalendar(trip: Trip, day?: TripDay): void {
  const { text } = tripToIcs(trip, { dayId: day?.id, now: Date.now() })
  download(calendarFileName(trip, day), text)
}

/** "Export to calendar" for a trip or day menu. Off when there is nothing to export. */
export function calendarMenuItem(trip: Trip, day?: TripDay): MenuItem {
  const days = day ? [day] : trip.days
  return {
    label: "Export to calendar",
    icon: <CalendarArrowDown size={16} strokeWidth={1.75} aria-hidden />,
    disabled: !days.some((d) => d.items.some(isCalendarItem)),
    onSelect: () => exportCalendar(trip, day),
  }
}
