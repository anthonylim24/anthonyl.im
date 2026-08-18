import { lazy, Suspense, useEffect, useState } from "react"
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
import { DateStrip } from "./components/DateStrip"
import { SectionHeading } from "./components/SectionHeading"
import { ItemIcon } from "./components/ItemIcon"
import { StatusChip } from "./components/StatusChip"
import { itemToReservation, nextMappedItem, walkLegBetween } from "./reservationView"
import type { ItineraryItem, TripDay } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  alertErrorClass,
  chipBtnClass,
  documentClass,
  focusRingClass,
  hoverArrowBackClass,
  hoverArrowClass,
  inkBtnClass,
  inlineLinkClass,
  mutedInkClass,
  overlayHoverClass,
  revealDelay,
  secondaryBtnClass,
  skeletonClass,
  timeCellClass,
  typeHeroTimeClass,
  typeMetaClass,
  typePageTitleClass,
  wrapAnywhereClass,
} from "./ui"

const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

const PAGE = documentClass

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
        <div className={`h-4 w-72 ${skeletonClass}`} />
        <div className={`mt-6 h-16 w-2/3 ${skeletonClass}`} />
        <div className="mt-10 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-20 ${skeletonClass}`} />
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
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
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
        <DateStrip
          days={trip.days}
          timezone={trip.timezone}
          activeId={day.id}
          toFor={(d) => `${tripPath}/day/${d.id}`}
        />
        <header className="mt-5">
          <motion.p
            {...fadeUp(0)}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${typeMetaClass} ${mutedInkClass}`}
          >
            <Link
              to={tripPath}
              className={`inline-block py-1.5 -my-1.5 text-stone-700 transition-colors hover:underline dark:text-stone-300 ${focusRingClass} ${wrapAnywhereClass}`}
            >
              {trip.name}
            </Link>
            <span aria-hidden className="text-stone-300 dark:text-stone-600">
              /
            </span>
            <span className="tabular-nums">
              Day {dayIndex + 1} of {trip.days.length}
            </span>
            {isToday && (
              <span className={`flex items-center gap-1.5 ${a.text}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                Today
              </span>
            )}
          </motion.p>

          <motion.div {...fadeUp(1)} className="mt-4">
            {day.emoji && <span aria-hidden className="mb-2 block text-xl leading-none">{day.emoji}</span>}
            <h1
              className={`${typePageTitleClass} min-w-0 leading-none ${wrapAnywhereClass}`}
            >
              {day.title ?? `Day ${dayIndex + 1}`}
            </h1>
          </motion.div>

          <p className={`mt-3 font-display text-lg tabular-nums ${mutedInkClass}`}>
            {formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })}
            {day.city ? ` · ${day.city}` : ""}
            {day.weather ? ` · ${day.weather.highC}° / ${day.weather.lowC}°` : ""}
          </p>

          {day.notes && (
            <motion.div
              {...fadeUp(2)}
              className={`mt-3 max-w-[60ch] whitespace-pre-line text-sm leading-relaxed text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}
            >
              <LinkifiedText>{day.notes}</LinkifiedText>
            </motion.div>
          )}

          <motion.div {...fadeUp(4)} className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
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
                className={`flex items-start gap-3 rounded-[length:var(--trips-radius)] border p-4 text-base text-[color:var(--trips-ink)] ${calloutTone(c.tone)}`}
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
          <section className="mt-10">
            <ol className="divide-y divide-[color:var(--trips-border)] border-y border-[color:var(--trips-border)]">
              {reservations.map((item, i) => (
                <ReservationTableRow
                  key={item.id}
                  item={item}
                  day={day}
                  dayNumber={dayIndex + 1}
                  flash={anchorTarget === `item-${item.id}`}
                  walk={item.reservation?.type === "flight" ? null : walkAfter(day.items, item)}
                  featured={i === 0}
                />
              ))}
            </ol>
          </section>
        )}

        {blocks.length > 0 && (
          <section className="mt-10">
            <SectionHeading title="Stops" />
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
                      className={`min-w-0 text-lg font-semibold tracking-tight text-stone-900 sm:text-xl dark:text-stone-100 ${wrapAnywhereClass}`}
                    >
                      {block.section.title}
                    </h3>
                    {block.section.time && (
                      <span className={`shrink-0 ${timeCellClass} uppercase tracking-[0.14em]`}>
                        <Time value={block.section.time} />
                        {block.section.endTime ? (
                          <>
                            {" to "}
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
                            className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--trips-ink-tertiary)]"
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
          className="mt-3 grid grid-cols-1 gap-1 border-t border-[color:var(--trips-border)] pt-6 sm:grid-cols-2 sm:gap-6"
          aria-label="Adjacent days"
        >
          {next && (
            <Link
              rel="next"
              to={`${tripPath}/day/${next.id}`}
              className={`group order-1 -mx-2 flex min-h-14 items-center justify-between gap-4 rounded-[length:var(--trips-radius)] px-2 py-3 transition-colors ${overlayHoverClass} sm:order-2 sm:justify-end sm:text-right ${focusRingClass}`}
            >
              <span className="min-w-0">
                <span className={`block text-[13px] ${mutedInkClass}`}>
                  Next · Day {dayIndex + 2}
                </span>
                <span
                  className={`line-clamp-2 text-base font-semibold text-[color:var(--trips-ink)] ${wrapAnywhereClass}`}
                >
                  {next.title ?? `Day ${dayIndex + 2}`}
                </span>
              </span>
              <ArrowUpRight
                className={`h-4 w-4 shrink-0 rotate-45 text-[color:var(--trips-ink-tertiary)] ${hoverArrowClass}`}
                aria-hidden
              />
            </Link>
          )}
          {prev ? (
            <Link
              rel="prev"
              to={`${tripPath}/day/${prev.id}`}
              className={`group order-2 -mx-2 flex min-h-14 items-center gap-4 rounded-[length:var(--trips-radius)] px-2 py-3 transition-colors ${overlayHoverClass} sm:order-1 ${focusRingClass}`}
            >
              <ArrowUpRight
                className={`h-4 w-4 shrink-0 -rotate-[135deg] text-[color:var(--trips-ink-tertiary)] ${hoverArrowBackClass}`}
                aria-hidden
              />
              <span className="min-w-0">
                <span className={`block text-[13px] ${mutedInkClass}`}>
                  Previous · Day {dayIndex}
                </span>
                <span
                  className={`line-clamp-2 text-base font-semibold text-[color:var(--trips-ink)] ${wrapAnywhereClass}`}
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
                className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--trips-scrim)] text-sm text-[color:var(--trips-band-ink)]"
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

function WalkLeg({ walk }: { walk: { distance: string; walk: string } }) {
  return (
    <p className={`mt-2 text-[13px] ${mutedInkClass}`}>
      {walk.walk}
      <span aria-hidden> · </span>
      {walk.distance}
    </p>
  )
}

function ReservationTableRow({
  item,
  day,
  dayNumber,
  flash,
  featured,
  walk,
}: {
  item: ItineraryItem
  day: TripDay
  dayNumber: number
  flash: boolean
  featured: boolean
  walk: { distance: string; walk: string } | null
}) {
  const highlight = useAnchorHighlight(flash)
  const reservation = itemToReservation(item, day, dayNumber)
  if (!reservation) return null
  return (
    <li id={`item-${item.id}`} className={`py-5 ${highlight}`}>
      {featured ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className={`${typeHeroTimeClass} text-[color:var(--trips-ink)]`}>
              {reservation.time ? <Time value={reservation.time} /> : "TBD"}
            </p>
            <p className={`mt-3 font-display text-xl font-semibold tracking-tight text-[color:var(--trips-ink)] sm:text-2xl ${wrapAnywhereClass}`}>
              <SmartEntity name={reservation.title} type={placeCategoryToEntityType(item.location?.category ?? "place")} />
            </p>
          </div>
          <StatusChip status={item.status} />
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="font-display text-xl font-semibold tabular-nums text-[color:var(--trips-ink)] sm:text-2xl">
            {reservation.time ? <Time value={reservation.time} /> : "TBD"}
          </p>
          <StatusChip status={item.status} />
        </div>
      )}
      {!featured && (
        <p className={`mt-1 font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
          <SmartEntity name={reservation.title} type={placeCategoryToEntityType(item.location?.category ?? "place")} />
        </p>
      )}
      {reservation.subtitle && (
        <p className={`mt-1 text-[13px] ${mutedInkClass} ${wrapAnywhereClass}`}>{reservation.subtitle}</p>
      )}
      {reservation.address && (
        <p className={`mt-1 text-sm ${wrapAnywhereClass}`}>
          <a href={mapsUrl(reservation.address)} className={inlineLinkClass}>
            {reservation.address}
          </a>
        </p>
      )}
      {reservation.notes && (
        <p className={`mt-1 text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
          <LinkifiedText>{reservation.notes}</LinkifiedText>
        </p>
      )}
      {walk && <WalkLeg walk={walk} />}
    </li>
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
      className={`grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 rounded-[length:var(--trips-radius)] sm:grid-cols-[4rem_minmax(0,1fr)] ${highlight}`}
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
