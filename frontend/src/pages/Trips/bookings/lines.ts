import { dayShort } from "../conciergeProposal"
import { clockMinutes, dayZone, validZone, zonedEpoch } from "../dayClock"
import { daysBetween } from "../meta"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { bookingForm, reservationOf } from "./kinds"

// The words a booking is read in: "HA 11 · SFO → HNL · lands 13:40 HST
// (+1 day)", "4 nights · Check-out Thu 24 Dec, 11:00". Times are the
// booking's own 24-hour clock, dates the concierge's "Thu 24 Dec", so a line
// reads the same as the confirmation it came from.

type Ctx = { trip: Pick<Trip, "timezone">; day: Pick<TripDay, "date" | "timezone"> }

const join = (parts: readonly (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ")

/** " (+1 day)", " (+2 days)", " (−1 day)", or nothing for the same day. */
export function dayOffsetLabel(days: number): string {
  if (days === 0 || !Number.isFinite(days)) return ""
  const n = Math.abs(days)
  return ` (${days > 0 ? "+" : "−"}${n} day${n === 1 ? "" : "s"})`
}

/** The zone's short name at a wall time there: "HST", "GMT+9". */
export function zoneShortName(date: string, time: string | undefined, zone: string): string {
  try {
    const epoch = zonedEpoch(date, clockMinutes(time) ?? 12 * 60, zone)
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(new Date(epoch))
      .find((p) => p.type === "timeZoneName")
    return part?.value ?? zone
  } catch {
    return zone
  }
}

function dateWords(iso: string, time: string | undefined): string {
  return `${dayShort({ date: iso })}${time ? `, ${time}` : ""}`
}

/** "lands 13:40 HST (+1 day)": the end of a journey, its zone named only when it isn't the day's. */
function arrival(verb: string, item: ItineraryItem, { trip, day }: Ctx): string | null {
  const r = reservationOf(item)
  const offset = r.endDate ? daysBetween(day.date, r.endDate) : 0
  if (!item.endTime) return r.endDate && offset !== 0 ? `${verb} ${dayShort({ date: r.endDate })}` : null
  const zone = validZone(r.endTimezone)
  const named = zone && zone !== dayZone(trip, day) ? ` ${zoneShortName(r.endDate ?? day.date, item.endTime, zone)}` : ""
  return `${verb} ${item.endTime}${named}${dayOffsetLabel(offset)}`
}

function route(from: string | undefined, to: string | undefined): string | null {
  if (from && to) return `${from} → ${to}`
  if (from) return `from ${from}`
  if (to) return `to ${to}`
  return null
}

function terminalWords(terminal: string): string {
  if (/^terminal\b/i.test(terminal)) return terminal
  return `Terminal ${terminal.replace(/^T(?=\d)/i, "")}`
}

/**
 * The detail lines under a booking's title, by kind. Empty when the booking
 * holds nothing past its time and confirmation (a table for two).
 */
export function bookingLines(item: ItineraryItem, ctx: Ctx): string[] {
  const r = reservationOf(item)
  const t = (s: string | undefined) => s?.trim() || undefined
  const provider = t(r.provider)
  const number = t(r.number)
  const [from, to, seat, terminal] = [t(r.from), t(r.to), t(r.seat), t(r.terminal)]
  const lines: string[] = []
  switch (bookingForm(r.type)) {
    case "flight":
    case "ride": {
      const verb = bookingForm(r.type) === "flight" ? "lands" : "arrives"
      lines.push(join([number ?? provider, route(from, to), arrival(verb, item, ctx)]))
      lines.push(join([number ? provider : null, terminal && terminalWords(terminal), seat && `Seat ${seat}`]))
      break
    }
    case "stay": {
      const nights = r.endDate ? daysBetween(ctx.day.date, r.endDate) : 0
      const checkOut = r.endDate && nights > 0 ? `Check-out ${dateWords(r.endDate, item.endTime)}` : item.endTime ? `Check-out ${item.endTime}` : null
      lines.push(join([nights > 0 && `${nights} night${nights === 1 ? "" : "s"}`, checkOut]))
      if (provider) lines.push(`Booked with ${provider}`)
      break
    }
    case "car": {
      lines.push(join([provider, from && `pick up at ${from}`]))
      const when = r.endDate ? dateWords(r.endDate, item.endTime) : item.endTime
      lines.push(to && when ? `Drop off at ${to} · ${when}` : to ? `Drop off at ${to}` : when ? `Drop off ${when}` : "")
      break
    }
    case "plain":
      if (provider) lines.push(`Booked with ${provider}`)
      break
  }
  return lines.filter(Boolean)
}

/** "Thu 24 Dec · 10:40", the booking's own day and start. */
export function bookingWhen(item: Pick<ItineraryItem, "time">, day: Pick<TripDay, "date">): string {
  return `${dayShort(day)}${item.time ? ` · ${item.time}` : ""}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A `tel:` link for a phone number, a `mailto:` for an address, else null (a name, a desk). */
export function contactHref(contact: string | undefined): string | null {
  const text = contact?.trim() ?? ""
  if (!text) return null
  if (EMAIL.test(text)) return `mailto:${text}`
  if (ISO_DATE.test(text) || !/^\+?[\d\s().\-/]+$/.test(text)) return null
  const digits = text.replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) return null
  return `tel:${text.startsWith("+") ? "+" : ""}${digits}`
}

/** The link when it is a well-formed https URL, else null: nothing else is ever linked. */
export function httpsUrl(raw: string | undefined): string | null {
  const text = raw?.trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === "https:" && url.hostname ? url.href : null
  } catch {
    return null
  }
}

/** "hawaiianairlines.com" for a link's label. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/**
 * A typed link, tidied for saving: "example.com/b/123" gains https://; an
 * empty field clears it. Anything that is not https is refused rather than
 * stored, so the read view never links to it.
 */
export function cleanLinkInput(text: string): { ok: true; value: string | undefined } | { ok: false } {
  const typed = text.trim()
  if (!typed) return { ok: true, value: undefined }
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : /^[^\s/]+\.[^\s/]+/.test(typed) ? `https://${typed}` : typed
  const url = httpsUrl(withScheme)
  return url ? { ok: true, value: url } : { ok: false }
}
