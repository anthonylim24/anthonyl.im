import {
  ArrowLeft,
  ArrowRight,
  CalendarArrowDown,
  CalendarCheck,
  CalendarDays,
  ClipboardCopy,
  Info,
  LayoutGrid,
  List,
  ListChecks,
  Map as MapIcon,
  MapPinned,
  Printer,
  Settings2,
  Share2,
  Sparkles,
  Wallet,
} from "lucide-react"
import { isCalendarItem } from "../calendar/calendarItems"
import { IgGlyph } from "../instagram/IgGlyph"
import { formatClock, formatRange, formatTripDate, itemIcon, plural, visibleTags } from "../meta"
import { todayDay } from "../today"
import type { Trip, TripDay, TripSummary } from "../types"
import type { Command } from "./commands"

// Palette commands built from a trip document and the workspace's actions.
// Pure: the workspace passes callbacks in and registers what comes out.

export type TripTab = "itinerary" | "budget" | "checklist" | "essentials" | "neighborhoods"

/** What the workspace can do. An action left out is not offered. */
export interface TripCommandActions {
  share?: () => void
  improve?: () => void
  details?: () => void
  exportCalendar?: () => void
  print?: () => void
  copyText?: () => void
  openTab?: (tab: TripTab) => void
  instagram?: () => void
}

export interface TripCommandsInput {
  trip: Trip
  /** `/trips/<slug or id>`. */
  basePath: string
  navigate: (to: string) => void
  actions?: TripCommandActions
  /** The day in view, for "Previous day" / "Next day" / "Trip overview". */
  dayId?: string | null
  /** An AI run holds the editor: editing actions show but cannot run. */
  locked?: boolean
  /** The clock, for "Go to today". Read again when the command runs, so a palette left open past midnight still lands on today. */
  now?: () => number
}

/** "Thu May 28": the trip's own date, no comma, to sit in a "·" list. */
const shortDate = (day: TripDay, timezone: string) => formatTripDate(day.date, timezone).replace(",", "")

const dayTitle = (day: TripDay, index: number, timezone: string) =>
  [`Day ${index + 1}`, shortDate(day, timezone), day.title?.trim()].filter(Boolean).join(" · ")

const stopCount = (day: TripDay) => day.items.filter((item) => item.kind !== "section").length

/** Workspace tabs offered as actions. "Itinerary" is a way back, so it sits under Go to. */
const TAB_ACTIONS: ReadonlyArray<{ tab: TripTab; title: string; icon: Command["icon"]; keywords: string[] }> = [
  { tab: "budget", title: "Budget", icon: Wallet, keywords: ["money", "costs", "expenses", "spend", "split"] },
  { tab: "checklist", title: "Checklist", icon: ListChecks, keywords: ["packing", "to do", "todo", "documents"] },
  { tab: "essentials", title: "Essentials", icon: Info, keywords: ["info", "emergency", "currency", "visa", "plugs"] },
  { tab: "neighborhoods", title: "Neighborhoods", icon: MapPinned, keywords: ["areas", "districts", "parts of town", "where"] },
]

export function tripCommands({ trip, basePath, navigate, actions = {}, dayId = null, locked = false, now = Date.now }: TripCommandsInput): Command[] {
  const commands: Command[] = []
  const hasItems = trip.days.some((day) => day.items.length > 0)

  // ── Actions ─────────────────────────────────────────
  const action = (command: Omit<Command, "group" | "run">, run: (() => void) | undefined) => {
    if (run) commands.push({ ...command, group: "Actions", run })
  }
  action({ id: "trip:share", title: "Share trip", icon: Share2, keywords: ["invite", "link", "collaborate"] }, actions.share)
  action(
    {
      id: "trip:improve",
      title: hasItems ? "Improve with AI" : "Draft with AI",
      icon: Sparkles,
      keywords: ["ai", "suggest", "enhance", "draft", "ideas"],
      disabled: locked,
    },
    actions.improve,
  )
  action(
    { id: "trip:details", title: "Trip details", icon: Settings2, keywords: ["name", "dates", "rename", "colour", "color", "time zone"], disabled: locked },
    actions.details,
  )
  action(
    {
      id: "trip:calendar",
      title: "Export to calendar",
      icon: CalendarArrowDown,
      keywords: ["ics", "ical", "google calendar", "outlook", "download"],
      // Same rule as the trip menu: nothing to export, nothing to offer.
      disabled: !trip.days.some((day) => day.items.some(isCalendarItem)),
    },
    actions.exportCalendar,
  )
  action({ id: "trip:print", title: "Print itinerary", icon: Printer, keywords: ["pdf", "paper"] }, actions.print)
  action({ id: "trip:copy", title: "Copy itinerary as text", icon: ClipboardCopy, keywords: ["clipboard", "plain text", "paste"] }, actions.copyText)
  action(
    { id: "trip:instagram", title: "Add places from Instagram", icon: IgGlyph, keywords: ["import", "reel", "post", "ig"], disabled: locked },
    actions.instagram,
  )
  const openTab = actions.openTab

  // ── Go to ───────────────────────────────────────────
  // While the trip is under way, today is one keystroke away from anywhere in it.
  const today = todayDay(trip, now())
  if (today && today.id !== dayId) {
    commands.push({
      id: "trip:today",
      title: "Go to today",
      subtitle: dayTitle(today, trip.days.indexOf(today), trip.timezone),
      group: "Go to",
      icon: CalendarCheck,
      keywords: ["now", "today", "live", "where am i"],
      run: () => {
        const current = todayDay(trip, now())
        navigate(current ? `${basePath}/day/${current.id}` : basePath)
      },
    })
  }
  const dayIndex = dayId ? trip.days.findIndex((day) => day.id === dayId) : -1
  if (dayIndex >= 0) {
    commands.push({
      id: "trip:overview",
      title: "Trip overview",
      group: "Go to",
      icon: LayoutGrid,
      keywords: ["all days", "summary", trip.name],
      run: () => navigate(basePath),
    })
    const prev = trip.days[dayIndex - 1]
    if (prev) {
      commands.push({
        id: "trip:prev-day",
        title: "Previous day",
        subtitle: dayTitle(prev, dayIndex - 1, trip.timezone),
        group: "Go to",
        icon: ArrowLeft,
        shortcut: ["left"],
        keywords: ["back", "yesterday"],
        run: () => navigate(`${basePath}/day/${prev.id}`),
      })
    }
    const next = trip.days[dayIndex + 1]
    if (next) {
      commands.push({
        id: "trip:next-day",
        title: "Next day",
        subtitle: dayTitle(next, dayIndex + 1, trip.timezone),
        group: "Go to",
        icon: ArrowRight,
        shortcut: ["right"],
        keywords: ["forward", "tomorrow"],
        run: () => navigate(`${basePath}/day/${next.id}`),
      })
    }
  }
  if (openTab) {
    commands.push({
      id: "trip:tab-itinerary",
      title: "Itinerary",
      group: "Go to",
      icon: List,
      keywords: ["plan", "schedule", "days"],
      run: () => openTab("itinerary"),
    })
    // The overview's other tabs are places to go, not actions.
    for (const { tab, title, icon, keywords } of TAB_ACTIONS) {
      commands.push({ id: `trip:tab-${tab}`, title, group: "Go to", icon, keywords, run: () => openTab(tab) })
    }
  }

  // ── Days ────────────────────────────────────────────
  trip.days.forEach((day, index) => {
    commands.push({
      id: `day:${day.id}`,
      title: dayTitle(day, index, trip.timezone),
      subtitle: [day.city, plural(stopCount(day), "stop")].filter(Boolean).join(" · "),
      group: "Days",
      icon: CalendarDays,
      keywords: [
        `go to day ${index + 1}`,
        formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" }),
        day.date,
        ...(day.neighborhoods ?? []),
      ],
      run: () => navigate(`${basePath}/day/${day.id}`),
    })
  })

  // ── Stops ───────────────────────────────────────────
  trip.days.forEach((day, index) => {
    for (const item of day.items) {
      const title = item.title.trim()
      if (item.kind === "section" || !title) continue
      const keywords = [
        item.location?.name,
        item.location?.address,
        item.location?.category,
        item.reservation?.type,
        item.reservation?.confirmation,
        day.city,
      ].filter((word): word is string => Boolean(word))
      commands.push({
        id: `stop:${item.id}`,
        title,
        subtitle: [`Day ${index + 1}`, item.time && formatClock(item.time)].filter(Boolean).join(" · "),
        group: "Stops",
        icon: itemIcon(item.kind, item.location?.category, item.reservation?.type),
        keywords,
        run: () => navigate(`${basePath}/day/${day.id}#item-${encodeURIComponent(item.id)}`),
      })
    }
  })

  return commands
}

/** One command per trip on the list, opening it. */
export function tripListCommands(summaries: readonly TripSummary[], navigate: (to: string) => void): Command[] {
  return summaries.map((trip) => ({
    id: `open-trip:${trip.id}`,
    title: trip.name,
    subtitle: formatRange(trip.startDate, trip.endDate),
    group: "Trips",
    icon: MapIcon,
    keywords: [...trip.destinations, ...visibleTags(trip.tags)],
    run: () => navigate(`/trips/${trip.slug ?? trip.id}`),
  }))
}
