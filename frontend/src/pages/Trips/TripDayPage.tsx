import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, ExternalLink, Globe2, MapPin, Pencil, Phone } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { EntityIndexProvider } from "../Korea/entityIndex"
import { LinkifiedText } from "../Korea/LinkifiedText"
import { getTrip } from "./tripsApi"
import { ACCENT, calloutTone, formatTripDate, resolveAccent, todayIsoIn } from "./theme"
import { useAnchorHighlight, useAnchorTarget } from "./anchors"
import { DossierSectionHeader } from "./components/DossierSectionHeader"
import { ItemIcon } from "./components/ItemIcon"
import { StatusChip } from "./components/StatusChip"
import type { ItineraryItem, Trip } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  SERIF,
  alertErrorClass,
  chipBtnClass,
  focusRingClass,
  hoverArrowBackClass,
  hoverArrowClass,
  inkBtnClass,
  inlineLinkClass,
  metaLabelClass,
  mutedInkClass,
  pageClass,
  revealDelay,
  secondaryBtnClass,
  wrapAnywhereClass,
} from "./ui"

const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; trip: Trip; editable: boolean }

/** `<main>` is unconstrained so trip heroes can be full-bleed. */
const PAGE = pageClass("reading")

function narrativeBlocks(items: ItineraryItem[]): Array<{ section: ItineraryItem | null; items: ItineraryItem[] }> {
  const blocks: Array<{ section: ItineraryItem | null; items: ItineraryItem[] }> = []
  let current: { section: ItineraryItem | null; items: ItineraryItem[] } | null = null
  for (const item of items) {
    if (item.kind === "reservation") continue
    if (item.kind === "section") {
      current = { section: item, items: [] }
      blocks.push(current)
    } else {
      if (!current) {
        current = { section: null, items: [] }
        blocks.push(current)
      }
      current.items.push(item)
    }
  }
  return blocks.filter((b) => b.section || b.items.length > 0)
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

function telHref(contact: string): string | null {
  const digits = contact.replace(/[^\d+]/g, "")
  return digits.length >= 7 ? `tel:${digits}` : null
}

export function TripDayPage() {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [mapOpen, setMapOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const anchorTarget = useAnchorTarget(state.status === "success")
  const reload = useCallback(() => {
    setState({ status: "loading" })
    setReloadKey((k) => k + 1)
  }, [])
  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    void (async () => {
      try {
        const { trip, access } = await getTrip(getToken, tripId)
        if (!cancelled) setState({ status: "success", trip, editable: access === "edit" || access === "owner" })
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tripId, getToken, reloadKey])

  if (state.status === "loading") {
    return (
      <div className={PAGE} role="status" aria-label="Loading day">
        <div className="h-4 w-72 animate-pulse rounded bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-6 h-16 w-2/3 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
          ))}
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className={PAGE}>
        <div className={alertErrorClass} role="alert">
          <p className={`min-w-0 ${wrapAnywhereClass}`}>
            Couldn’t open this day. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" className={`mt-1 font-semibold ${inlineLinkClass}`} onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { trip, editable } = state
  const dayIndex = trip.days.findIndex((d) => d.id === dayId)
  const day = trip.days[dayIndex]
  if (!day) {
    return (
      <div className={PAGE} role="alert">
        <h1 className="font-display text-3xl tracking-tight text-stone-900 dark:text-stone-100" style={SERIF}>
          Day not found
        </h1>
        <p className={`mt-3 text-sm leading-relaxed ${mutedInkClass}`}>
          This day isn’t part of {trip.name} any more. It may have been removed in the editor.
        </p>
        <Link to={`/trips/${trip.slug ?? trip.id}`} className={`mt-4 ${secondaryBtnClass}`}>
          Back to the trip
        </Link>
      </div>
    )
  }

  const a = ACCENT
  const isToday = day.date === todayIsoIn(trip.timezone)
  const reservations = day.items.filter((i) => i.kind === "reservation")
  const blocks = narrativeBlocks(day.items)
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  const prev = trip.days[dayIndex - 1]
  const next = trip.days[dayIndex + 1]

  const fadeUp = (step: number) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(step) },
  })

  return (
    <EntityIndexProvider>
      <div className={PAGE} data-trip-accent={resolveAccent(trip.appearance?.accent)}>
        <motion.p
          {...fadeUp(0)}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-trips text-[11px] uppercase tracking-[0.18em] ${mutedInkClass}`}
        >
          <Link
            to={`/trips/${trip.slug ?? trip.id}`}
            className={`inline-block py-1.5 -my-1.5 text-stone-700 transition-colors hover:underline dark:text-stone-300 ${focusRingClass} ${wrapAnywhereClass}`}
          >
            {trip.name}
          </Link>
          <span aria-hidden className="h-px w-6 bg-stone-300 dark:bg-stone-700" />
          <span className="tabular-nums">
            Day {String(dayIndex + 1).padStart(2, "0")} of {String(trip.days.length).padStart(2, "0")}
          </span>
          <span aria-hidden>·</span>
          <span>{formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })}</span>
          {isToday && (
            <span className={`flex items-center gap-1.5 ${a.text}`}>
              <span aria-hidden>·</span>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
              live
            </span>
          )}
        </motion.p>

        <motion.div {...fadeUp(1)} className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span
            className={`font-display text-[clamp(3rem,8vw,4.75rem)] font-light leading-[0.85] tabular-nums ${a.text}`}
            style={SERIF}
            aria-hidden
          >
            {dayIndex + 1}
          </span>
          {day.emoji && <span aria-hidden className="text-4xl leading-none sm:text-5xl">{day.emoji}</span>}
          <h1
            className={`min-w-0 flex-1 font-display text-[clamp(1.85rem,5vw,3rem)] font-medium leading-[1.05] tracking-[-0.02em] text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
            style={SERIF}
          >
            {day.title ?? `Day ${dayIndex + 1}`}
          </h1>
        </motion.div>

        {day.notes && (
          <motion.div {...fadeUp(2)} className="mt-5 max-w-[60ch] whitespace-pre-line text-base leading-relaxed text-stone-700 dark:text-stone-300">
            <LinkifiedText>{day.notes}</LinkifiedText>
          </motion.div>
        )}

        <motion.dl
          {...fadeUp(3)}
          className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-stone-200/80 pt-5 sm:grid-cols-3 sm:gap-x-10 dark:border-stone-800/80"
        >
          {day.city && <Meta label="City" value={day.city} />}
          {day.weather && (
            <Meta label="Weather" value={`${day.weather.highC}°C / ${day.weather.lowC}°C · ${day.weather.condition}`} />
          )}
          {day.neighborhoods && day.neighborhoods.length > 0 && (
            <Meta label="Neighborhoods" value={day.neighborhoods.join(" · ")} />
          )}
          {reservations.length > 0 && (
            <Meta label="Booked" value={`${reservations.length} reservation${reservations.length === 1 ? "" : "s"}`} />
          )}
        </motion.dl>

        <motion.div {...fadeUp(4)} className="mt-7 flex flex-wrap items-center gap-3">
          {hasMappable ? (
            <button type="button" onClick={() => setMapOpen(true)} className={inkBtnClass}>
              <Globe2 className="h-4 w-4" aria-hidden />
              Map Mode
            </button>
          ) : (
            <p className={`max-w-[42ch] text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
              Map Mode needs places with coordinates. Add them in the editor or run Enhance.
            </p>
          )}
          {editable && (
            <Link to={`/trips/${trip.slug ?? trip.id}/edit#${day.id}`} className={secondaryBtnClass}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit this day
            </Link>
          )}
        </motion.div>

        {day.callouts && day.callouts.length > 0 && (
          <div className="mt-9 space-y-3">
            {day.callouts.map((c, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(i) }}
                className={`flex items-start gap-3 rounded-xl border p-4 text-sm text-stone-800 dark:text-stone-200 ${calloutTone(c.tone)}`}
              >
                <span aria-hidden className="text-lg leading-none">{c.icon}</span>
                <p className={`min-w-0 flex-1 ${wrapAnywhereClass}`}>
                  <LinkifiedText>{c.body}</LinkifiedText>
                </p>
              </motion.div>
            ))}
          </div>
        )}

        {reservations.length > 0 && (
          <section className="mt-12">
            <DossierSectionHeader num="01" eyebrow="Booked moments" title="Reservations" />
            <ol className="relative mt-6 space-y-5 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-stone-200/90 sm:pl-8 sm:before:left-[11px] dark:before:bg-stone-800/90">
              {reservations.map((item, i) => (
                <ReservationTimelineItem
                  key={item.id}
                  item={item}
                  index={i}
                  accentDot={a.dot}
                  flash={anchorTarget === `item-${item.id}`}
                />
              ))}
            </ol>
          </section>
        )}

        {blocks.length > 0 && (
          <section className="mt-12 divide-y divide-stone-200/80 dark:divide-stone-800/80">
            {blocks.map((block, bi) => (
              <motion.div
                key={block.section?.id ?? `block-${bi}`}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15%" }}
                transition={{ duration: REVEAL_DURATION, ease: EASE }}
                className="py-8 first:pt-0 sm:py-10"
              >
                {block.section && (
                  <div className="flex items-baseline justify-between gap-x-4 sm:gap-x-6">
                    <h3
                      className={`min-w-0 font-display text-xl font-medium tracking-[-0.01em] text-stone-900 sm:text-2xl dark:text-stone-100 ${wrapAnywhereClass}`}
                      style={SERIF}
                    >
                      {block.section.title}
                    </h3>
                    {block.section.time && (
                      <span className={`shrink-0 font-mono-trips text-[11px] uppercase tracking-[0.14em] ${mutedInkClass}`}>
                        {block.section.time}
                        {block.section.endTime ? ` – ${block.section.endTime}` : ""}
                      </span>
                    )}
                  </div>
                )}
                {block.section?.notes && (
                  <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                    {block.section.notes.split("\n").filter(Boolean).map((line, li) => (
                      <li key={li} className="flex gap-3">
                        <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-stone-400 dark:bg-stone-600" />
                        <span className={`min-w-0 flex-1 ${wrapAnywhereClass}`}>
                          <LinkifiedText>{line.replace(/^-\s*/, "")}</LinkifiedText>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {block.items.length > 0 && (
                  <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                    {block.items.map((item) => (
                      <NarrativeItem key={item.id} item={item} flash={anchorTarget === `item-${item.id}`} />
                    ))}
                  </ul>
                )}
              </motion.div>
            ))}
          </section>
        )}

        {/* Forward first on phones — the thumb reaches the top row, and the
            next day is what an in-trip reader wants. */}
        <nav
          className="mt-12 grid grid-cols-1 gap-1 border-t border-stone-200/80 pt-6 sm:grid-cols-2 sm:gap-6 dark:border-stone-800/80"
          aria-label="Adjacent days"
        >
          {next && (
            <Link
              rel="next"
              to={`/trips/${trip.slug ?? trip.id}/day/${next.id}`}
              className={`group order-1 -mx-2 flex min-h-14 items-center justify-between gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-stone-100/50 sm:order-2 sm:justify-end sm:text-right dark:hover:bg-stone-900/40 ${focusRingClass}`}
            >
              <span className="min-w-0">
                <span className={`block font-mono-trips text-[10px] uppercase tracking-[0.18em] ${mutedInkClass}`}>
                  Next · Day {dayIndex + 2}
                </span>
                <span
                  className={`line-clamp-2 font-display text-base font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
                  style={SERIF}
                >
                  {next.title ?? `Day ${dayIndex + 2}`}
                </span>
              </span>
              <ArrowUpRight className={`h-4 w-4 shrink-0 rotate-45 text-stone-500 dark:text-stone-400 ${hoverArrowClass}`} aria-hidden />
            </Link>
          )}
          {prev ? (
            <Link
              rel="prev"
              to={`/trips/${trip.slug ?? trip.id}/day/${prev.id}`}
              className={`group order-2 -mx-2 flex min-h-14 items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-stone-100/50 sm:order-1 dark:hover:bg-stone-900/40 ${focusRingClass}`}
            >
              <ArrowUpRight className={`h-4 w-4 shrink-0 -rotate-[135deg] text-stone-500 dark:text-stone-400 ${hoverArrowBackClass}`} aria-hidden />
              <span className="min-w-0">
                <span className={`block font-mono-trips text-[10px] uppercase tracking-[0.18em] ${mutedInkClass}`}>
                  Previous · Day {dayIndex}
                </span>
                <span
                  className={`line-clamp-2 font-display text-base font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
                  style={SERIF}
                >
                  {prev.title ?? `Day ${dayIndex}`}
                </span>
              </span>
            </Link>
          ) : (
            <span className="hidden sm:order-1 sm:block" />
          )}
        </nav>

        {mapOpen && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 text-sm text-stone-300" role="status">
                Loading map…
              </div>
            }
          >
            <MapModeOverlay
              daySlug={day.id}
              dayTitle={day.title ?? `Day ${dayIndex + 1}`}
              placesUrl={`/api/trips/${encodeURIComponent(trip.id)}/days/${encodeURIComponent(day.id)}/places`}
              onClose={() => setMapOpen(false)}
            />
          </Suspense>
        )}
      </div>
    </EntityIndexProvider>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={metaLabelClass}>{label}</dt>
      <dd className={`mt-1 text-sm leading-snug text-stone-800 dark:text-stone-200 ${wrapAnywhereClass}`}>{value}</dd>
    </div>
  )
}

function ReservationTimelineItem({
  item,
  index,
  accentDot,
  flash,
}: {
  item: ItineraryItem
  index: number
  accentDot: string
  flash: boolean
}) {
  const reduce = useReducedMotion()
  const highlight = useAnchorHighlight(flash)
  const phone = item.reservation?.contact ? telHref(item.reservation.contact) : null
  const time = item.time ? `${item.time}${item.endTime ? ` – ${item.endTime}` : ""}` : null
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
      className="relative"
    >
      <span className={`absolute -left-[23px] top-8 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--trips-canvas)] sm:-left-[29px] ${accentDot}`} aria-hidden />
      <div
        id={`item-${item.id}`}
        className={`rounded-xl border border-stone-200/90 bg-[var(--trips-surface)] p-4 dark:border-stone-800 dark:bg-stone-900/50 ${highlight}`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ACCENT.softBg} ${ACCENT.text}`}
            aria-hidden
          >
            <ItemIcon kind={item.kind} category={item.location?.category} reservationType={item.reservation?.type} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-x-3 gap-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className={`min-w-0 text-sm font-semibold text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                  {item.title}
                </h3>
                <StatusChip status={item.status} />
                {item.reservation?.status && item.reservation.status !== "confirmed" && (
                  <span className={`text-[10px] uppercase capitalize tracking-wider ${mutedInkClass}`}>
                    {item.reservation.status}
                  </span>
                )}
              </div>
              {time && (
                <span className={`shrink-0 pt-0.5 font-mono-trips text-[11px] uppercase tracking-[0.14em] tabular-nums ${mutedInkClass}`}>
                  {time}
                </span>
              )}
            </div>
            {item.notes && (
              <p className={`mt-1 text-sm text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}>
                <LinkifiedText>{item.notes}</LinkifiedText>
              </p>
            )}
            {item.reservation?.confirmation && (
              <p className={`mt-1 font-mono-trips text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
                Conf · {item.reservation.confirmation}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.location?.address && (
                <a href={mapsUrl(item.location.address)} target="_blank" rel="noopener noreferrer" className={chipBtnClass}>
                  <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  Maps
                </a>
              )}
              {phone && (
                <a href={phone} className={chipBtnClass}>
                  <Phone className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  Call
                </a>
              )}
              {item.reservation?.url && (
                <a href={item.reservation.url} target="_blank" rel="noopener noreferrer" className={chipBtnClass}>
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  Booking
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.li>
  )
}

function NarrativeItem({ item, flash }: { item: ItineraryItem; flash: boolean }) {
  const highlight = useAnchorHighlight(flash)
  return (
    // `-mx-2 px-2` keeps the text on the same optical line as the headings
    // while giving the arrival highlight room to breathe.
    <li id={`item-${item.id}`} className={`-mx-2 flex gap-3 rounded-lg px-2 ${highlight}`}>
      <ItemIcon
        kind={item.kind}
        category={item.location?.category}
        className="mt-1 h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400"
      />
      <span className={`min-w-0 flex-1 ${wrapAnywhereClass}`}>
        {item.time && (
          <span className={`mr-2 font-mono-trips text-[11px] uppercase tracking-[0.12em] ${mutedInkClass}`}>
            {item.time}
          </span>
        )}
        <span className="font-medium text-stone-900 dark:text-stone-100">{item.title}</span>
        {item.notes && (
          <span className={mutedInkClass}>
            {" "}
            · <LinkifiedText>{item.notes}</LinkifiedText>
          </span>
        )}
        {item.location?.address && (
          <a
            href={mapsUrl(item.location.address)}
            target="_blank"
            rel="noopener noreferrer"
            // `py-1.5 -my-1.5` is the inline-secondary-link rule: a 44px-tall
            // target that leaves the list rhythm alone.
            className={`mt-0.5 block rounded py-1.5 -my-1.5 text-xs underline decoration-stone-300 underline-offset-2 hover:text-stone-900 dark:decoration-stone-600 dark:hover:text-stone-200 ${mutedInkClass} ${focusRingClass} ${wrapAnywhereClass}`}
          >
            {item.location.address}
          </a>
        )}
      </span>
    </li>
  )
}
