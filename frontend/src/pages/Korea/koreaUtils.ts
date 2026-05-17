// Misc cross-page utilities for the Korea route — theme persistence, today
// detection, reservation ordering, ICS export.

import type { Day, Reservation, Snapshot } from "./types"

// ---------- Theme ----------

const THEME_KEY = "korea-theme"
export type Theme = "light" | "dark" | "system"

export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system"
  const stored = window.localStorage.getItem(THEME_KEY) as Theme | null
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const effective =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme
  root.classList.toggle("dark", effective === "dark")
  root.dataset.koreaTheme = effective
}

export function persistTheme(theme: Theme) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(THEME_KEY, theme)
}

// ---------- Today detection ----------

// Returns the current date as an ISO yyyy-mm-dd string in Asia/Seoul time.
export function todayKstIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return fmt.format(new Date())
}

// Identify the day in the trip that matches "today" in Asia/Seoul time, if any.
export function todayDay(days: Day[]): Day | null {
  const iso = todayKstIso()
  return days.find((d) => d.date === iso) ?? null
}

// Was this date in the past at the snapshot's "now"?
export function isPastDate(iso: string): boolean {
  return iso < todayKstIso()
}

// Build a Date from an ISO yyyy-mm-dd + optional HH:mm, anchored to Asia/Seoul.
// JS doesn't let us natively construct in a specific TZ; we lean on the
// "+09:00" offset since Korea has no DST.
export function makeKstDate(iso: string, hhmm?: string): Date {
  const time = hhmm ?? "00:00"
  return new Date(`${iso}T${time}:00+09:00`)
}

// ---------- Up-next reservation ----------

export function upcomingReservations(snapshot: Snapshot, limit = 3): Reservation[] {
  const now = new Date()
  const enriched = snapshot.reservations
    .map((r) => ({ r, ts: makeKstDate(r.date, r.time ?? "00:00").getTime() }))
    .filter(({ ts }) => ts >= now.getTime())
    .sort((a, b) => a.ts - b.ts)
  return enriched.slice(0, limit).map(({ r }) => r)
}

// ---------- Countdown ----------

export interface Countdown {
  totalMs: number
  days: number
  hours: number
  minutes: number
  isPast: boolean
}

export function countdownTo(target: Date, from: Date = new Date()): Countdown {
  const ms = target.getTime() - from.getTime()
  const absMs = Math.abs(ms)
  const days = Math.floor(absMs / 86_400_000)
  const hours = Math.floor((absMs % 86_400_000) / 3_600_000)
  const minutes = Math.floor((absMs % 3_600_000) / 60_000)
  return { totalMs: ms, days, hours, minutes, isPast: ms < 0 }
}

export function formatCountdown(c: Countdown): string {
  if (c.isPast) return "just now"
  if (c.days >= 1) return `${c.days}d ${c.hours}h`
  if (c.hours >= 1) return `${c.hours}h ${c.minutes}m`
  return `${c.minutes}m`
}

// ---------- ICS export ----------

function ts(date: string, time?: string): string {
  // Format: YYYYMMDDTHHMMSS — ICS local time + TZID
  const t = (time ?? "00:00").replace(":", "")
  return date.replace(/-/g, "") + "T" + t + "00"
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

const DURATIONS: Partial<Record<Reservation["type"], number>> = {
  flight: 12 * 60,
  meal: 120,
  bar: 90,
  appointment: 90,
  experience: 120,
  transit: 180,
  event: 60,
  wedding: 300,
  hotel: 24 * 60,
}

function endTimeForRes(r: Reservation): { date: string; time: string } {
  const minutes = DURATIONS[r.type] ?? 60
  const start = makeKstDate(r.date, r.time ?? "00:00")
  const end = new Date(start.getTime() + minutes * 60_000)
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(end)
  const hh = end
    .toLocaleString("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false })
    .replace(/[^\d:]/g, "")
    .slice(0, 5)
  return { date: iso, time: hh }
}

export function buildIcs(reservations: Reservation[], calName = "South Korea Trip"): string {
  const lines: string[] = []
  lines.push("BEGIN:VCALENDAR")
  lines.push("VERSION:2.0")
  lines.push("PRODID:-//anthonyl.im//Korea Itinerary//EN")
  lines.push("CALSCALE:GREGORIAN")
  lines.push(`X-WR-CALNAME:${escapeIcs(calName)}`)
  lines.push("X-WR-TIMEZONE:Asia/Seoul")

  // Embed Asia/Seoul timezone block (no DST)
  lines.push("BEGIN:VTIMEZONE")
  lines.push("TZID:Asia/Seoul")
  lines.push("BEGIN:STANDARD")
  lines.push("DTSTART:19880101T000000")
  lines.push("TZOFFSETFROM:+0900")
  lines.push("TZOFFSETTO:+0900")
  lines.push("TZNAME:KST")
  lines.push("END:STANDARD")
  lines.push("END:VTIMEZONE")

  for (const r of reservations) {
    const end = endTimeForRes(r)
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:${r.id}@anthonyl.im`)
    lines.push(`DTSTAMP:${ts(r.date, r.time)}`)
    lines.push(`DTSTART;TZID=Asia/Seoul:${ts(r.date, r.time)}`)
    lines.push(`DTEND;TZID=Asia/Seoul:${ts(end.date, end.time)}`)
    lines.push(`SUMMARY:${escapeIcs(r.title)}`)
    const desc: string[] = []
    if (r.subtitle) desc.push(r.subtitle)
    if (r.contact) desc.push(`Contact: ${r.contact}`)
    if (r.notes) desc.push(r.notes)
    desc.push(`Status: ${r.status}`)
    lines.push(`DESCRIPTION:${escapeIcs(desc.join("\n"))}`)
    if (r.address) lines.push(`LOCATION:${escapeIcs(r.address)}`)
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}

export function downloadIcs(filename: string, ics: string) {
  if (typeof window === "undefined") return
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".ics") ? filename : filename + ".ics"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------- Slugify ----------

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
