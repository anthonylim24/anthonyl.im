import { formatTripDate, plural } from "../meta"
import { dayFull } from "../tripEdits"
import type { Trip } from "../types"
import type { DayChoice } from "../workspace/DayPicker"

/** Every day of the trip as a place to send an idea: "Day 3 · Sat, Nov 14", "Kyoto · 4 stops", full days off. */
export function ideaDayChoices(trip: Pick<Trip, "days" | "timezone">): DayChoice[] {
  return trip.days.map((day, i) => ({
    id: day.id,
    label: `Day ${i + 1} · ${formatTripDate(day.date, day.timezone ?? trip.timezone)}`,
    detail: [day.city, plural(day.items.filter((item) => item.kind !== "section").length, "stop")].filter(Boolean).join(" · "),
    off: dayFull(day) ? "Full" : undefined,
  }))
}
