import type { Trip, TripDay } from "./types"

const MAX = 3

function uniquePush(out: string[], value: string | undefined) {
  if (!value) return
  if (out.includes(value)) return
  out.push(value)
}

function dayIndex(trip: Trip, day: TripDay): number {
  return trip.days.findIndex((d) => d.id === day.id) + 1
}

function dayLabel(trip: Trip, day: TripDay): string {
  return day.title?.trim() || `Day ${dayIndex(trip, day)}`
}

/** Prompt chips derived from the itinerary the user is looking at.
 *  No extra model call: the trip document already knows what's booked,
 *  pending, and where the day is set. */
export function conciergeSuggestions(trip: Trip, dayId?: string): string[] {
  const out: string[] = []
  const focused = dayId ? trip.days.find((d) => d.id === dayId) : undefined

  if (focused) {
    uniquePush(out, `What's the plan for ${dayLabel(trip, focused)}?`)
    const reservation = focused.items.find((i) => i.kind === "reservation")
    if (reservation?.title) uniquePush(out, `When is ${reservation.title}?`)
    const neighborhood = focused.neighborhoods?.find((n) => n.trim())
    if (neighborhood) uniquePush(out, `Where should we eat near ${neighborhood}?`)
    else if (focused.city) uniquePush(out, `Where should we eat in ${focused.city}?`)
    if (focused.weather?.condition) {
      uniquePush(out, `Should we plan around the ${focused.weather.condition.toLowerCase()}?`)
    }
    const nextStop = focused.items.find((i) => i.kind === "place" && i.title.trim())
    if (nextStop && out.length < MAX) uniquePush(out, `What's worth knowing about ${nextStop.title}?`)
  } else {
    const pending = trip.days.flatMap((d) =>
      d.items.filter(
        (i) => i.reservation?.status === "pending" || i.reservation?.status === "tentative" || i.status === "needs_review",
      ),
    )
    if (pending.length > 0) uniquePush(out, "Which reservations still need confirming?")

    const cities = [...new Set(trip.days.map((d) => d.city?.trim()).filter((c): c is string => Boolean(c)))]
    if (cities.length > 1) uniquePush(out, `What's the best day for ${cities[cities.length - 1]}?`)
    else if (trip.destinations[0]) uniquePush(out, `Where should we eat in ${trip.destinations[0]}?`)

    const shopping = trip.days.some((d) =>
      d.items.some((i) => i.location?.category === "shopping" || /shop|market|boutique/i.test(i.title)),
    )
    if (shopping) uniquePush(out, "What's the best day for shopping?")

    const firstReservation = trip.days.flatMap((d) => d.items.filter((i) => i.kind === "reservation" && i.title.trim()))[0]
    if (firstReservation) uniquePush(out, `When is ${firstReservation.title}?`)

    uniquePush(out, "What's a realistic pace for this itinerary?")
  }

  if (out.length < MAX) {
    uniquePush(out, "What should I add to this itinerary first?")
    uniquePush(out, "Help me think through a day's flow.")
  }

  return out.slice(0, MAX)
}
