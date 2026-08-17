import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Globe2, Pencil } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { EntityIndexProvider } from "../Korea/entityIndex"
import { placeCategoryToEntityType } from "../Korea/entityForReservation"
import { LinkifiedText } from "../Korea/LinkifiedText"
import { SmartEntity } from "../Korea/SmartEntity"
import { Time } from "../Korea/Time"
import { useLoadedTrip } from "./useLoadedTrip"
import { isMissingTripError, TripsNotFound } from "./TripsNotFound"
import { ACCENT, calloutTone, formatTripDate, resolveAccent, todayIsoIn } from "./theme"
import { useAnchorHighlight, useAnchorTarget } from "./anchors"
import { DossierSectionHeader } from "./components/DossierSectionHeader"
import { ItemIcon } from "./components/ItemIcon"
import { StatusChip } from "./components/StatusChip"
import { itemToReservation, nextMappedItem, walkLegBetween } from "./reservationView"
import type { ItineraryItem, TripDay } from "./types"
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
  timeCellClass,
  wrapAnywhereClass,
} from "./ui"

const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

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

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    Boolean(target.closest('[role="dialog"]'))
  )
}

function walkAfter(items: readonly ItineraryItem[], item: ItineraryItem) {
  const next = nextMappedItem(items, item.id)
  return next ? walkLegBetween(item.location, next.location) : null
}

export function TripDayPage() {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const { state, reload } = useLoadedTrip(tripId, getToken)
  const [mapOpen, setMapOpen] = useState(() => searchParams.get("map") === "1")
  const [focusPlaceId, setFocusPlaceId] = useState<string | undefined>(
    () => searchParams.get("focus") ?? undefined,
  )
  const anchorTarget = useAnchorTarget(state.status === "success")

  const trip = state.status === "success" ? state.trip : null
  const dayIndex = trip && dayId ? trip.days.findIndex((d) => d.id === dayId) : -1
  const day = trip && dayIndex >= 0 ? trip.days[dayIndex] : undefined
  const prev = trip && dayIndex > 0 ? trip.days[dayIndex - 1] : undefined
  const next = trip && dayIndex >= 0 && dayIndex < trip.days.length - 1 ? trip.days[dayIndex + 1] : undefined
  const tripPath = trip ? `/trips/${trip.slug ?? trip.id}` : ""

  useEffect(() => {
    const mapRequested = searchParams.get("map") === "1"
    setMapOpen(mapRequested)
    setFocusPlaceId(mapRequested ? (searchParams.get("focus") ?? undefined) : undefined)
  }, [searchParams])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [dayId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mapOpen || e.metaKey || e.ctrlKey || e.altKey) return
      if (typingTarget(e.target)) return
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault()
        navigate(`${tripPath}/day/${prev.id}`)
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault()
        navigate(`${tripPath}/day/${next.id}`)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [prev, next, navigate, mapOpen, tripPath])

  const closeMap = () => {
    setMapOpen(false)
    setFocusPlaceId(undefined)
    if (!searchParams.has("map") && !searchParams.has("focus")) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete("map")
    nextParams.delete("focus")
    setSearchParams(nextParams, { replace: true })
  }

  const openMap = (placeId?: string) => {
    setFocusPlaceId(placeId)
    setMapOpen(true)
  }

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
    if (isMissingTripError(state.message)) return <TripsNotFound />
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

  if (!trip || !day) {
    return (
      <div className={PAGE} role="alert">
        <h1 className="font-display text-3xl tracking-tight text-stone-900 dark:text-stone-100" style={SERIF}>
          Day not found
        </h1>
        <p className={`mt-3 text-sm leading-relaxed ${mutedInkClass}`}>
          This day isn’t part of {trip?.name ?? "this trip"} any more. It may have been removed in the editor.
        </p>
        <Link to={trip ? tripPath : "/trips"} className={`mt-4 ${secondaryBtnClass}`}>
          Back to the trip
        </Link>
      </div>
    )
  }

  const { editable } = state
  const a = ACCENT
  const isToday = day.date === todayIsoIn(trip.timezone)
  const reservations = day.items.filter((i) => i.kind === "reservation")
  const blocks = narrativeBlocks(day.items)
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)

  const fadeUp = (step: number) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(step) },
  })

  return (
    <EntityIndexProvider>
      <article className={PAGE} data-trip-accent={resolveAccent(trip.appearance?.accent)}>
        <header className="border-b border-stone-200/80 pb-8 dark:border-stone-800/80">
          <motion.p
            {...fadeUp(0)}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-trips text-[11px] uppercase tracking-[0.18em] ${mutedInkClass}`}
          >
            <Link
              to={tripPath}
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
            <motion.div
              {...fadeUp(2)}
              className={`mt-5 max-w-[60ch] whitespace-pre-line text-base leading-relaxed text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}
            >
              <LinkifiedText>{day.notes}</LinkifiedText>
            </motion.div>
          )}

          <motion.dl
            {...fadeUp(3)}
            className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-stone-200/80 pt-5 sm:grid-cols-3 sm:gap-x-10 dark:border-stone-800/80"
          >
            {day.city && (
              <Meta label="City">
                <SmartEntity name={day.city} type="city" className={wrapAnywhereClass} />
              </Meta>
            )}
            {day.weather && (
              <Meta label="Weather">
                {`${day.weather.highC}°C / ${day.weather.lowC}°C · ${day.weather.condition}`}
              </Meta>
            )}
            {day.neighborhoods && day.neighborhoods.length > 0 && (
              <Meta label="Neighborhoods">
                {day.neighborhoods.map((n, i) => (
                  <span key={n}>
                    {i > 0 && (
                      <span aria-hidden className="mx-1.5 text-stone-400 dark:text-stone-600">
                        ·
                      </span>
                    )}
                    <SmartEntity name={n} type="neighborhood" city={day.city} className={wrapAnywhereClass} />
                  </span>
                ))}
              </Meta>
            )}
            {reservations.length > 0 && (
              <Meta label="Booked">{`${reservations.length} reservation${reservations.length === 1 ? "" : "s"}`}</Meta>
            )}
          </motion.dl>

          <motion.div {...fadeUp(4)} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            {hasMappable ? (
              <button type="button" onClick={() => openMap()} className={inkBtnClass}>
                <Globe2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Enter Map Mode
              </button>
            ) : (
              <p className={`max-w-[42ch] text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
                Map Mode needs places with coordinates. Add them in the editor or run Enhance.
              </p>
            )}
            {editable && (
              <Link to={`${tripPath}#${day.id}`} className={secondaryBtnClass}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit this day
              </Link>
            )}
          </motion.div>
        </header>

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
                <span aria-hidden className="text-lg leading-none">
                  {c.icon}
                </span>
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
                  day={day}
                  dayNumber={dayIndex + 1}
                  index={i}
                  accentDot={a.dot}
                  flash={anchorTarget === `item-${item.id}`}
                  walk={walkAfter(day.items, item)}
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
                      <span className={`shrink-0 ${timeCellClass} uppercase tracking-[0.14em]`}>
                        <Time value={block.section.time} />
                        {block.section.endTime ? (
                          <>
                            {" – "}
                            <Time value={block.section.endTime} />
                          </>
                        ) : null}
                      </span>
                    )}
                  </div>
                )}
                {block.section?.notes && (
                  <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                    {block.section.notes
                      .split("\n")
                      .filter(Boolean)
                      .map((line, li) => (
                        <li key={li} className="flex gap-3">
                          <span
                            aria-hidden
                            className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-stone-400 dark:bg-stone-600"
                          />
                          <span className={`min-w-0 flex-1 ${wrapAnywhereClass}`}>
                            <LinkifiedText>{line.replace(/^-\s*/, "")}</LinkifiedText>
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                {block.items.length > 0 && (
                  <ol className="mt-5 space-y-4">
                    {block.items.map((item) => (
                      <NarrativeItem
                        key={item.id}
                        item={item}
                        city={day.city}
                        flash={anchorTarget === `item-${item.id}`}
                        walk={walkAfter(day.items, item)}
                        onOpenMap={item.location?.lat != null ? () => openMap(item.id) : undefined}
                      />
                    ))}
                  </ol>
                )}
              </motion.div>
            ))}
          </section>
        )}

        {/* Forward first on phones: the thumb reaches the top row, and the
            next day is what an in-trip reader wants. */}
        <p className={`mt-10 text-xs ${mutedInkClass}`}>
          Arrow keys move to the previous or next day.
        </p>
        <nav
          className="mt-3 grid grid-cols-1 gap-1 border-t border-stone-200/80 pt-6 sm:grid-cols-2 sm:gap-6 dark:border-stone-800/80"
          aria-label="Adjacent days"
        >
          {next && (
            <Link
              rel="next"
              to={`${tripPath}/day/${next.id}`}
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
              <ArrowUpRight
                className={`h-4 w-4 shrink-0 rotate-45 text-stone-500 dark:text-stone-400 ${hoverArrowClass}`}
                aria-hidden
              />
            </Link>
          )}
          {prev ? (
            <Link
              rel="prev"
              to={`${tripPath}/day/${prev.id}`}
              className={`group order-2 -mx-2 flex min-h-14 items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-stone-100/50 sm:order-1 dark:hover:bg-stone-900/40 ${focusRingClass}`}
            >
              <ArrowUpRight
                className={`h-4 w-4 shrink-0 -rotate-[135deg] text-stone-500 dark:text-stone-400 ${hoverArrowBackClass}`}
                aria-hidden
              />
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
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 text-sm text-stone-300"
                role="status"
              >
                Loading map…
              </div>
            }
          >
            <MapModeOverlay
              daySlug={day.id}
              dayTitle={day.title ?? `Day ${dayIndex + 1}`}
              placesUrl={`/api/trips/${encodeURIComponent(trip.id)}/days/${encodeURIComponent(day.id)}/places`}
              initialFocusPlaceId={focusPlaceId}
              onClose={closeMap}
            />
          </Suspense>
        )}
      </article>
    </EntityIndexProvider>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className={metaLabelClass}>{label}</dt>
      <dd className={`mt-1 text-sm leading-snug text-stone-800 dark:text-stone-200 ${wrapAnywhereClass}`}>
        {children}
      </dd>
    </div>
  )
}

function WalkLeg({ walk }: { walk: { distance: string; walk: string } }) {
  return (
    <p className={`mt-2 font-mono-trips text-[11px] uppercase tracking-[0.12em] ${mutedInkClass}`}>
      {walk.walk}
      <span aria-hidden> · </span>
      {walk.distance}
    </p>
  )
}

function ReservationTimelineItem({
  item,
  day,
  dayNumber,
  index,
  accentDot,
  flash,
  walk,
}: {
  item: ItineraryItem
  day: TripDay
  dayNumber: number
  index: number
  accentDot: string
  flash: boolean
  walk: { distance: string; walk: string } | null
}) {
  const reduce = useReducedMotion()
  const highlight = useAnchorHighlight(flash)
  const reservation = itemToReservation(item, day, dayNumber)
  if (!reservation) return null
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
      className="relative"
    >
      <span
        className={`absolute -left-[23px] top-8 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--trips-canvas)] sm:-left-[29px] ${accentDot}`}
        aria-hidden
      />
      <div id={`item-${item.id}`} className={highlight}>
        <article className="min-w-0">
          <div className="flex items-start gap-3">
            <ItemIcon
              kind={item.kind}
              category={item.location?.category}
              reservationType={item.reservation?.type}
              className="mt-1 h-4 w-4 shrink-0 text-stone-500"
            />
            <div className="min-w-0 flex-1">
              <h3
                className={`font-display text-xl font-medium leading-snug text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
                style={SERIF}
              >
                <SmartEntity name={reservation.title} type={placeCategoryToEntityType(item.location?.category ?? "place")} />
              </h3>
              {reservation.subtitle && (
                <p className={`mt-1 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>{reservation.subtitle}</p>
              )}
              {reservation.time && (
                <p className={`mt-1 font-mono-trips text-[12px] tabular-nums ${mutedInkClass}`}>
                  <Time value={reservation.time} />
                </p>
              )}
              {reservation.address && (
                <p className={`mt-2 text-sm ${wrapAnywhereClass}`}>
                  <a href={mapsUrl(reservation.address)} className={inlineLinkClass}>
                    {reservation.address}
                  </a>
                </p>
              )}
              {reservation.notes && (
                <p className={`mt-2 text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
                  <LinkifiedText>{reservation.notes}</LinkifiedText>
                </p>
              )}
            </div>
            <StatusChip status={item.status} />
          </div>
        </article>
        {walk && <WalkLeg walk={walk} />}
      </div>
    </motion.li>
  )
}

function NarrativeItem({
  item,
  city,
  flash,
  walk,
  onOpenMap,
}: {
  item: ItineraryItem
  city?: string
  flash: boolean
  walk: { distance: string; walk: string } | null
  onOpenMap?: () => void
}) {
  const highlight = useAnchorHighlight(flash)
  const entityType = placeCategoryToEntityType(item.location?.category ?? "place")
  const titled = item.kind === "place" && item.title.trim().length > 0
  return (
    <li
      id={`item-${item.id}`}
      className={`grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 rounded-lg sm:grid-cols-[4rem_minmax(0,1fr)] ${highlight}`}
    >
      <div className={`pt-0.5 text-right ${timeCellClass}`}>
        {item.time ? <Time value={item.time} /> : <span aria-hidden>·</span>}
        {item.endTime && (
          <span className="mt-0.5 block">
            <Time value={item.endTime} />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-2.5">
          <ItemIcon
            kind={item.kind}
            category={item.location?.category}
            className="mt-1 h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {titled ? (
                <SmartEntity
                  name={item.title}
                  type={entityType}
                  city={city}
                  className={`font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
                />
              ) : (
                <span className={`font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                  {item.title}
                </span>
              )}
              <StatusChip status={item.status} />
            </div>
            {item.notes && (
              <p className={`mt-1 text-sm leading-relaxed text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}>
                <LinkifiedText>{item.notes}</LinkifiedText>
              </p>
            )}
            {item.location?.address && (
              <a
                href={mapsUrl(item.location.address)}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-1 block rounded py-1.5 -my-1.5 text-xs underline decoration-stone-300 underline-offset-2 hover:text-stone-900 dark:decoration-stone-600 dark:hover:text-stone-200 ${mutedInkClass} ${focusRingClass} ${wrapAnywhereClass}`}
              >
                {item.location.address}
              </a>
            )}
            {walk && <WalkLeg walk={walk} />}
            {onOpenMap && (
              <button type="button" onClick={onOpenMap} className={`mt-2 ${chipBtnClass}`}>
                <Globe2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Map
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
