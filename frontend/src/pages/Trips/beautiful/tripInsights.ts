import { todayIsoIn } from "../theme"
import type { Trip } from "../types"
import type { InsightCard } from "./types"

/** Insights from fields already on the trip document. No invented metrics. */
export function buildTripInsights(trip: Trip, dayId?: string): InsightCard[] {
  const today = todayIsoIn(trip.timezone)
  const cards: InsightCard[] = []
  const day = dayId ? trip.days.find((d) => d.id === dayId) : undefined
  const weatherDays = trip.days.filter((d) => d.weather)
  const focusWeather = day?.weather ?? weatherDays.find((d) => d.date >= today)?.weather ?? weatherDays[0]?.weather
  if (focusWeather) {
    cards.push({
      id: "weather",
      title: "Weather",
      body: `${focusWeather.condition}. High ${focusWeather.highC}°C, low ${focusWeather.lowC}°C.`,
      meta: day ? day.date : `${weatherDays.length} day${weatherDays.length === 1 ? "" : "s"} with a forecast`,
    })
  }

  const emptyDays = trip.days.filter((d) => d.items.length === 0)
  if (day) {
    const stops = day.items.filter((i) => i.kind === "place" || i.kind === "reservation").length
    cards.push({
      id: "pacing",
      title: "Pacing",
      body:
        stops === 0
          ? "This day has no places or reservations yet."
          : `${stops} stop${stops === 1 ? "" : "s"} on this day.`,
      meta: `${day.items.length} item${day.items.length === 1 ? "" : "s"}`,
    })
  } else if (emptyDays.length > 0) {
    cards.push({
      id: "pacing",
      title: "Pacing",
      body: `${emptyDays.length} day${emptyDays.length === 1 ? "" : "s"} still empty.`,
      meta: `${trip.days.length} day${trip.days.length === 1 ? "" : "s"} total`,
    })
  } else if (trip.days.length > 0) {
    cards.push({
      id: "pacing",
      title: "Pacing",
      body: "Every day has at least one stop.",
      meta: `${trip.itemCount ?? trip.days.reduce((n, d) => n + d.items.length, 0)} items`,
    })
  }

  const upcoming = trip.days.flatMap((d) =>
    d.items
      .filter((i) => i.kind === "reservation" && d.date >= today)
      .map((item) => ({ day: d, item })),
  )
  const next = upcoming[0]
  if (next) {
    cards.push({
      id: "next-reservation",
      title: "Next reservation",
      body: next.item.title,
      meta: [next.item.time, next.day.title || next.day.date].filter(Boolean).join(" · "),
    })
  }

  return cards.slice(0, 3)
}
