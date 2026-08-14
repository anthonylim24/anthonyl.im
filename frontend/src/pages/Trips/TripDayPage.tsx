import { lazy, Suspense, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, ExternalLink, Globe2, MapPin, Pencil, Phone } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { EntityIndexProvider } from "../Korea/entityIndex"
import { LinkifiedText } from "../Korea/LinkifiedText"
import { useLoadedTrip } from "./useLoadedTrip"
import { ACCENT, calloutTone, formatTripDate, hasForecast, resolveAccent, todayIsoIn } from "./theme"
import { useAnchorHighlight, useAnchorTarget } from "./anchors"
import { ItemIcon } from "./components/ItemIcon"
import { ReservationChip, StatusChip } from "./components/StatusChip"
import { Timeline, TimelineItem } from "./components/Timeline"
import type { ItineraryItem } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  DISPLAY,
  alertErrorClass,
  chipBtnClass,
  displayCardClass,
  displaySectionClass,
  focusRingClass,
  ghostBtnClass,
  hoverArrowBackClass,
  hoverArrowClass,
  inkBtnClass,
  inlineLinkClass,
  mutedInkClass,
  pageClass,
  panelClass,
  revealDelay,
  secondaryBtnClass,
  skeletonClass,
  wrapAnywhereClass,
} from "./ui"

const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

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

function fadeUp(reduce: boolean | null, step: number) {
  return {
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(step) },
  }
}

export function TripDayPage() {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const { state, reload } = useLoadedTrip(tripId, getToken)
  const [mapOpen, setMapOpen] = useState(false)
  const anchorTarget = useAnchorTarget(state.status === "success")

  if (state.status === "loading") {
    return (
      <div className={PAGE} role="status" aria-label="Loading day">
        <div className={`${skeletonClass} h-4 w-40`} />
        <div className="mt-5 flex items-end gap-4">
          <div className={`${skeletonClass} h-14 w-12`} />
          <div className={`${skeletonClass} h-10 w-2/3`} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <div className={`${skeletonClass} h-8 w-28`} />
          <div className={`${skeletonClass} h-8 w-24`} />
        </div>
        <div className="mt-10 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4">
              <div className={`${skeletonClass} h-3 w-10 justify-self-end`} />
              <div className={`${skeletonClass} h-24`} />
            </div>
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
            Could not open this day. Check your connection, then try again. ({state.message})
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
        <h1 className={displaySectionClass} style={DISPLAY}>
          Day not found
        </h1>
        <p className={`mt-3 text-sm leading-relaxed ${mutedInkClass}`}>
          This day is not part of {trip.name} any more. It may have been removed in the editor.
        </p>
        <Link to={`/trips/${trip.slug ?? trip.id}`} className={`mt-4 ${secondaryBtnClass}`}>
          Back to the trip
        </Link>
      </div>
    )
  }

  const isToday = day.date === todayIsoIn(trip.timezone)
  const reservations = day.items.filter((i) => i.kind === "reservation")
  const blocks = narrativeBlocks(day.items)
  const callouts = day.callouts ?? []
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  const prev = trip.days[dayIndex - 1]
  const next = trip.days[dayIndex + 1]
  const hoods = day.neighborhoods?.slice(0, 3) ?? []
  const tripPath = `/trips/${trip.slug ?? trip.id}`
  const empty = reservations.length === 0 && callouts.length === 0 && blocks.length === 0
  let timelineStep = 0

  return (
    <EntityIndexProvider>
      <div className={PAGE} data-trip-accent={resolveAccent(trip.appearance?.accent)}>
        <motion.div {...fadeUp(reduce, 0)}>
          <Link
            to={tripPath}
            className={`inline-flex min-h-11 items-center ${mutedInkClass} ${focusRingClass} ${wrapAnywhereClass}`}
          >
            {trip.name}
          </Link>
        </motion.div>

        <motion.div {...fadeUp(reduce, 1)} className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          <span
            className={`font-mono-trips text-[clamp(2.5rem,6vw,3.5rem)] leading-none tabular-nums ${ACCENT.text}`}
            aria-hidden
          >
            {dayIndex + 1}
          </span>
          {day.emoji ? (
            <span aria-hidden className="text-3xl leading-none">
              {day.emoji}
            </span>
          ) : null}
          <h1 className={`min-w-0 flex-1 ${displaySectionClass} ${wrapAnywhereClass}`} style={DISPLAY}>
            {day.title ?? `Day ${dayIndex + 1}`}
          </h1>
        </motion.div>

        <motion.div {...fadeUp(reduce, 2)} className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p>
            {formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })}
          </p>
          {hasForecast(day.weather) ? (
            <p className={mutedInkClass}>
              {day.weather.highC}°C / {day.weather.lowC}°C, {day.weather.condition}
            </p>
          ) : null}
          {isToday ? (
            <p className={`inline-flex items-center gap-2 font-medium ${ACCENT.text}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${ACCENT.dot}`} aria-hidden />
              Today
            </p>
          ) : null}
        </motion.div>

        {hoods.length > 0 ? (
          <motion.ul {...fadeUp(reduce, 3)} className="mt-4 flex flex-wrap gap-2" aria-label="Neighborhoods">
            {hoods.map((name) => (
              <li
                key={name}
                className={`rounded-[var(--tr-r-control)] border border-[color:var(--tr-line)] px-2.5 py-1 text-xs ${mutedInkClass} ${wrapAnywhereClass}`}
              >
                {name}
              </li>
            ))}
          </motion.ul>
        ) : null}

        {day.notes ? (
          <motion.div
            {...fadeUp(reduce, 3)}
            className={`mt-5 max-w-[60ch] whitespace-pre-line text-base leading-[1.8] ${wrapAnywhereClass}`}
          >
            <LinkifiedText>{day.notes}</LinkifiedText>
          </motion.div>
        ) : null}

        <motion.div {...fadeUp(reduce, 4)} className="mt-6 flex flex-wrap items-center gap-3">
          {hasMappable ? (
            <button type="button" onClick={() => setMapOpen(true)} className={inkBtnClass}>
              <Globe2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Map Mode
            </button>
          ) : (
            <p className={`max-w-[42ch] text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
              Map Mode needs places with coordinates. Add them in the editor or run Enhance.
            </p>
          )}
          {editable ? (
            <Link to={`${tripPath}/edit#${day.id}`} className={secondaryBtnClass}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Edit this day
            </Link>
          ) : null}
        </motion.div>

        <nav aria-label="Adjacent days" className="mt-4 flex flex-wrap gap-2">
          {next ? (
            <Link
              rel="next"
              to={`${tripPath}/day/${next.id}`}
              className={`group order-1 ${ghostBtnClass} ${wrapAnywhereClass} sm:order-2 sm:ml-auto`}
            >
              {next.title ?? `Day ${dayIndex + 2}`}
              <ArrowUpRight className={`h-4 w-4 rotate-45 ${hoverArrowClass}`} strokeWidth={1.5} aria-hidden />
            </Link>
          ) : null}
          {prev ? (
            <Link
              rel="prev"
              to={`${tripPath}/day/${prev.id}`}
              className={`group order-2 ${ghostBtnClass} ${wrapAnywhereClass} sm:order-1`}
            >
              <ArrowUpRight className={`h-4 w-4 -rotate-[135deg] ${hoverArrowBackClass}`} strokeWidth={1.5} aria-hidden />
              {prev.title ?? `Day ${dayIndex}`}
            </Link>
          ) : null}
        </nav>

        {empty ? (
          <div className={`${panelClass} mt-10 px-5 py-8`}>
            <p className={displayCardClass} style={DISPLAY}>
              Nothing on this day yet
            </p>
            <p className={`mt-2 max-w-[48ch] text-sm leading-relaxed ${mutedInkClass}`}>
              {editable
                ? "Use the editor to add reservations, places, or notes."
                : "No reservations, places, or notes."}
            </p>
          </div>
        ) : (
          <Timeline label="Day timeline">
            {reservations.map((item) => {
              const index = timelineStep++
              return (
                <TimelineItem key={item.id} time={item.time} endTime={item.endTime} index={index}>
                  <ReservationCard item={item} flash={anchorTarget === `item-${item.id}`} />
                </TimelineItem>
              )
            })}
            {callouts.map((callout, i) => {
              const index = timelineStep++
              return (
                <TimelineItem key={`callout-${i}`} index={index}>
                  <div
                    className={`flex items-start gap-3 border p-4 text-sm rounded-[var(--tr-r-panel)] ${calloutTone(callout.tone)}`}
                  >
                    {callout.icon ? (
                      <span aria-hidden className="text-lg leading-none">
                        {callout.icon}
                      </span>
                    ) : null}
                    <p className={`min-w-0 flex-1 leading-[1.8] ${wrapAnywhereClass}`}>
                      <LinkifiedText>{callout.body}</LinkifiedText>
                    </p>
                  </div>
                </TimelineItem>
              )
            })}
            {blocks.map((block, bi) => (
              <BlockEntries
                key={block.section?.id ?? `block-${bi}`}
                block={block}
                anchorTarget={anchorTarget}
                nextIndex={() => timelineStep++}
              />
            ))}
          </Timeline>
        )}

        {mapOpen ? (
          <Suspense
            fallback={
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--tr-ink)]/80 text-sm text-[color:var(--tr-canvas)]"
                role="status"
              >
                Loading map
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
        ) : null}
      </div>
    </EntityIndexProvider>
  )
}

function BlockEntries({
  block,
  anchorTarget,
  nextIndex,
}: {
  block: { section: ItineraryItem | null; items: ItineraryItem[] }
  anchorTarget: string | null
  nextIndex: () => number
}) {
  return (
    <>
      {block.section ? (
        <TimelineItem time={block.section.time} endTime={block.section.endTime} index={nextIndex()}>
          <SectionBlock section={block.section} flash={anchorTarget === `item-${block.section.id}`} />
        </TimelineItem>
      ) : null}
      {block.items.map((item) => (
        <TimelineItem key={item.id} time={item.time} endTime={item.endTime} index={nextIndex()}>
          <PlaceOrNote item={item} flash={anchorTarget === `item-${item.id}`} />
        </TimelineItem>
      ))}
    </>
  )
}

function SectionBlock({ section, flash }: { section: ItineraryItem; flash: boolean }) {
  const highlight = useAnchorHighlight(flash)
  const lines = section.notes?.split("\n").filter(Boolean) ?? []
  return (
    <div id={`item-${section.id}`} className={highlight}>
      <h3 className={`${displayCardClass} ${wrapAnywhereClass}`} style={DISPLAY}>
        {section.title}
      </h3>
      {lines.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-[1.8]">
          {lines.map((line, li) => (
            <li key={li} className={wrapAnywhereClass}>
              <LinkifiedText>{line.replace(/^-\s*/, "")}</LinkifiedText>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ReservationCard({ item, flash }: { item: ItineraryItem; flash: boolean }) {
  const highlight = useAnchorHighlight(flash)
  const phone = item.reservation?.contact ? telHref(item.reservation.contact) : null
  return (
    <div id={`item-${item.id}`} className={`${panelClass} p-4 ${highlight}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--tr-r-control)] ${ACCENT.softBg} ${ACCENT.text}`}
          aria-hidden
        >
          <ItemIcon
            kind={item.kind}
            category={item.location?.category}
            reservationType={item.reservation?.type}
            className="h-4 w-4"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className={`min-w-0 text-sm font-semibold ${wrapAnywhereClass}`}>{item.title}</h3>
            <StatusChip status={item.status} />
            {item.reservation ? <ReservationChip status={item.reservation.status} /> : null}
          </div>
          {item.notes ? (
            <p className={`mt-1 text-sm leading-[1.8] ${wrapAnywhereClass}`}>
              <LinkifiedText>{item.notes}</LinkifiedText>
            </p>
          ) : null}
          {item.reservation?.confirmation ? (
            <p className={`mt-1 font-mono-trips text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
              Confirmation {item.reservation.confirmation}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {item.location?.address ? (
              <a href={mapsUrl(item.location.address)} target="_blank" rel="noopener noreferrer" className={chipBtnClass}>
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Maps
              </a>
            ) : null}
            {phone ? (
              <a href={phone} className={chipBtnClass}>
                <Phone className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Call
              </a>
            ) : null}
            {item.reservation?.url ? (
              <a href={item.reservation.url} target="_blank" rel="noopener noreferrer" className={chipBtnClass}>
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Booking
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlaceOrNote({ item, flash }: { item: ItineraryItem; flash: boolean }) {
  const highlight = useAnchorHighlight(flash)
  return (
    <div id={`item-${item.id}`} className={`-mx-1 rounded-[var(--tr-r-control)] px-1 ${highlight}`}>
      <div className="flex items-start gap-3">
        <ItemIcon
          kind={item.kind}
          category={item.location?.category}
          className={`mt-0.5 h-4 w-4 shrink-0 ${mutedInkClass}`}
        />
        <div className={`min-w-0 flex-1 ${wrapAnywhereClass}`}>
          <p className="text-sm font-medium leading-relaxed">{item.title}</p>
          {item.notes ? (
            // The note is its own sentence; running it into the title with a
            // comma reads as one long run-on once the note is a full line.
            <p className={`mt-0.5 text-sm leading-[1.8] ${mutedInkClass}`}>
              <LinkifiedText>{item.notes}</LinkifiedText>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={item.status} />
            {item.location?.address ? (
              <a href={mapsUrl(item.location.address)} target="_blank" rel="noopener noreferrer" className={chipBtnClass}>
                <MapPin className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Maps
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
