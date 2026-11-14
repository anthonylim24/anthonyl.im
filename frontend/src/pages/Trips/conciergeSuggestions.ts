import { dayWeekday } from "./conciergeProposal"
import { todayIsoIn } from "./meta"
import type { ItineraryItem, Trip, TripDay } from "./types"

// Starter prompts for an empty conversation. No model call: the trip
// document already says what phase the trip is in, which day is in view,
// and where a day is thin (no lunch, a long gap, nothing planned).

export type StarterKind = "today" | "near" | "plan" | "meal" | "gap" | "booking" | "route" | "idea"

export interface Starter {
  kind: StarterKind
  /** What the row says. */
  label: string
  /** What is sent. */
  prompt: string
  /** Ask for the traveller's position and send it with the prompt. */
  location?: boolean
}

const MAX = 4
const GAP_MINUTES = 150
const MEAL_CATEGORIES = new Set(["restaurant", "cafe", "market", "bar"])

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const isStop = (item: ItineraryItem) => item.kind === "place" || item.kind === "reservation"
const stopName = (item: ItineraryItem) => item.location?.name?.trim() || item.title

function isMeal(item: ItineraryItem): boolean {
  if (!isStop(item)) return false
  if (MEAL_CATEGORIES.has(item.location?.category ?? "")) return true
  if (item.reservation?.type === "meal" || item.reservation?.type === "bar") return true
  return /\b(breakfast|brunch|lunch|dinner|supper|tapas|izakaya|bistro|restaurant)\b/i.test(item.title)
}

export interface DayRead {
  stops: ItineraryItem[]
  hasLunch: boolean
  hasDinner: boolean
  /** The first gap of 2.5 h or more between timed stops. */
  gap?: { after: ItineraryItem; before: ItineraryItem }
  /** The stop the traveller is at around lunchtime, if any. */
  middayStop?: ItineraryItem
}

/** A light client-side reading of a day (the server computes the full one). */
export function readDay(day: TripDay): DayRead {
  const stops = day.items.filter(isStop)
  const timed = stops.filter((i) => i.time).sort((x, y) => x.time!.localeCompare(y.time!))
  const meals = stops.filter(isMeal)
  const at = (item: ItineraryItem) => (item.time ? minutes(item.time) : -1)
  const untimedMeals = meals.filter((m) => !m.time).length
  let hasLunch = meals.some((m) => at(m) >= 11 * 60 && at(m) < 15 * 60 + 30)
  let hasDinner = meals.some((m) => at(m) >= 17 * 60 + 30)
  for (let i = 0; i < untimedMeals; i++) {
    if (!hasLunch) hasLunch = true
    else hasDinner = true
  }
  let gap: DayRead["gap"]
  for (let i = 1; i < timed.length && !gap; i++) {
    const prev = timed[i - 1]!
    const from = prev.endTime && prev.endTime > prev.time! ? prev.endTime : prev.time!
    if (minutes(timed[i]!.time!) - minutes(from) >= GAP_MINUTES) gap = { after: prev, before: timed[i]! }
  }
  const middayStop = [...timed].reverse().find((i) => at(i) <= 13 * 60 && !isMeal(i))
  return { stops, hasLunch, hasDinner, gap, middayStop }
}

function needsSorting(item: ItineraryItem): boolean {
  return item.reservation?.status === "pending" || item.reservation?.status === "tentative" || item.status === "needs_review"
}

/**
 * Up to four starters, most useful first. `today` is the calendar date at
 * the destination (injectable for tests).
 */
export function conciergeSuggestions(trip: Trip, dayId?: string, today: string = todayIsoIn(trip.timezone)): Starter[] {
  const out: Starter[] = []
  const push = (starter: Starter) => {
    if (out.length < MAX && !out.some((s) => s.prompt === starter.prompt)) out.push(starter)
  }
  const during = today >= trip.startDate && today <= trip.endDate
  const before = today < trip.startDate
  const todayDay = during ? trip.days.find((d) => d.date === today) : undefined
  const focused = dayId ? trip.days.find((d) => d.id === dayId) : undefined
  const place = trip.destinations[0] ?? "the city"

  const forDay = (day: TripDay, isToday: boolean) => {
    const name = isToday ? "today" : dayWeekday(day)
    const on = isToday ? "today" : `on ${dayWeekday(day)}`
    const read = readDay(day)
    if (read.stops.length === 0) {
      push({ kind: "plan", label: isToday ? "Nothing planned today. Plan it" : `${dayWeekday(day)} is empty. Plan it`, prompt: `${isToday ? "Today" : dayWeekday(day)} is empty. Plan it for us.` })
      return
    }
    if (isToday) push({ kind: "today", label: "What's next today?", prompt: "What's next today, and how do we get there?" })
    if (!read.hasLunch && read.stops.length >= 2) {
      const near = read.middayStop ? ` near ${stopName(read.middayStop)}` : ""
      push({ kind: "meal", label: `Find lunch${near}`, prompt: `Where should we eat lunch${near} ${on}?` })
    }
    if (read.gap) {
      push({
        kind: "gap",
        label: `Fill the gap after ${stopName(read.gap.after)}`,
        prompt: `We have free time between ${stopName(read.gap.after)} and ${stopName(read.gap.before)} ${on}. What should we do?`,
      })
    }
    if (!read.hasDinner && read.stops.length >= 2) {
      const last = read.stops[read.stops.length - 1]!
      push({ kind: "meal", label: `Find dinner for ${name}`, prompt: `Where should we have dinner ${on}, not far from ${stopName(last)}?` })
    }
    if (!isToday) push({ kind: "idea", label: `Check ${dayWeekday(day)}'s plan`, prompt: `Is ${dayWeekday(day)} in a sensible order? Anything you would change?` })
  }

  if (focused) forDay(focused, focused.id === todayDay?.id)
  else if (todayDay) forDay(todayDay, true)

  if (during) {
    push({ kind: "near", label: "What's good near me right now?", prompt: "What's good near me right now?", location: true })
  }

  if (trip.days.some((d) => d.items.some(needsSorting))) {
    push({ kind: "booking", label: "Which bookings still need sorting?", prompt: "Which bookings still need sorting out?" })
  }

  const emptyAhead = trip.days.find((d) => d.date >= today && d.id !== focused?.id && d.id !== todayDay?.id && readDay(d).stops.length === 0)
  if (emptyAhead) {
    push({ kind: "plan", label: `${dayWeekday(emptyAhead)} is empty. Plan it`, prompt: `${dayWeekday(emptyAhead)} is empty. Plan it for us.` })
  }

  const last = trip.days[trip.days.length - 1]
  const departure = last?.items.find((i) => i.reservation?.type === "flight" || i.reservation?.type === "transit")
  if (departure && last && last.date >= today) {
    push({ kind: "route", label: "When should we leave for the airport?", prompt: `When should we leave for ${departure.title} on ${dayWeekday(last)}, and how?` })
  }

  if (before) push({ kind: "booking", label: "What should we book ahead?", prompt: `What should we book ahead for ${place}, and how far in advance?` })
  push({ kind: "meal", label: `Where should we eat in ${place}?`, prompt: `Where should we eat in ${place}? One pick for lunch and one for dinner.` })
  push({ kind: "idea", label: `What should we not miss in ${place}?`, prompt: `What should we not miss in ${place} that is not on our plan yet?` })

  return out
}
