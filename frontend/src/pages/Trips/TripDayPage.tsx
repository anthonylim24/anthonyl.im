import { useTabTitle } from "@/hooks/useTabTitle"
import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'
import { day as dy } from './toy.stylex'
import { lazy, Suspense, useEffect, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Globe2, Pencil, Plane, Ticket } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { EntityIndexProvider } from "../Korea/entityIndex"
import { placeCategoryToEntityType } from "../Korea/entityForReservation"
import { LinkifiedText } from "../Korea/LinkifiedText"
import { SmartEntity } from "../Korea/SmartEntity"
import { Time } from "../Korea/Time"
import { useLoadedTrip } from "./useLoadedTrip"
import { isMissingTripError, TripsNotFound } from "./TripsNotFound"
import { ACCENT, calloutToneStyle, formatTripDate, resolveAccent, todayIsoIn } from "./theme"
import { useAnchorHighlight, useAnchorTarget } from "./anchors"
import { DateStrip } from "./components/DateStrip"
import { FlipTime } from "./components/FlipTime"
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
  useTabTitle(trip && day ? `Day ${dayIndex + 1}${day.title ? ` · ${day.title}` : ""} · ${trip.name}` : null)

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
      <div {...sx(PAGE)} role="status" aria-label="Loading day">
        <div {...sx(styles.h4, styles.w72, skeletonClass)} />
        <div {...sx(styles.skeletonMt6, styles.h16, styles.w2_3, skeletonClass)} />
        <div {...sx(styles.loadingStack)}>
          {[0, 1, 2].map((i) => (
            <div key={i} {...sx(styles.h20, skeletonClass)} />
          ))}
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    if (isMissingTripError(state.message)) return <TripsNotFound />
    return (
      <div {...sx(PAGE)}>
        <div {...sx(alertErrorClass)} role="alert">
          <p {...sx(styles.minW0, wrapAnywhereClass)}>
            Couldn’t open this day. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" {...sx(styles.linkSemiboldMt1, inlineLinkClass)} onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!trip || !day) {
    return (
      <div {...sx(PAGE)} role="alert">
        <h1 {...sx(styles.dayNotFoundTitle)}>
          Day not found
        </h1>
        <p {...sx(styles.mt3, styles.textSm, styles.leadingRelaxed, mutedInkClass)}>
          This day isn’t part of {trip?.name ?? "this trip"} any more. It may have been removed in the editor.
        </p>
        <Link to={trip ? tripPath : "/trips"} {...sx(styles.linkMt4, secondaryBtnClass)}>
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
      <article {...sx(PAGE)} data-trip-accent={resolveAccent(trip.appearance?.accent)}>
        <DateStrip
          days={trip.days}
          timezone={trip.timezone}
          activeId={day.id}
          toFor={(d) => `${tripPath}/day/${d.id}`}
        />
        <header {...sx(styles.dayHeader, dy.postcard)}>
          <DateStamp date={day.date} timezone={trip.timezone} city={day.city} />
          <motion.p
            {...fadeUp(0)}
            {...sx(typeMetaClass, mutedInkClass)}
          >
            <Link
              to={tripPath}
              {...sx(focusRingClass, wrapAnywhereClass)}
            >
              {trip.name}
            </Link>
            <span aria-hidden {...sx(styles.dayBreadcrumbSep)}>
              /
            </span>
            <span {...sx(styles.tabularNums)}>
              Day {dayIndex + 1} of {trip.days.length}
            </span>
            {isToday && (
              <span {...sx(styles.flexCenterGap15, a.text)}>
                <span {...sx(styles.accentDotSm, a.dot)} aria-hidden />
                Today
              </span>
            )}
          </motion.p>

          <motion.div {...fadeUp(1)} {...sx(styles.mt4)}>
            {day.emoji && <span aria-hidden {...sx(styles.dayEmoji)}>{day.emoji}</span>}
            <h1
              {...sx(styles.minW0, typePageTitleClass, wrapAnywhereClass)}
            >
              {day.title ?? `Day ${dayIndex + 1}`}
            </h1>
          </motion.div>

          <p {...sx(styles.dayDateLine, mutedInkClass)}>
            {formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })}
            {day.city ? ` · ${day.city}` : ""}
            {day.weather ? ` · ${day.weather.highC}° / ${day.weather.lowC}°` : ""}
          </p>

          {day.notes && (
            <motion.div
              {...fadeUp(2)}
              {...sx(styles.dayNotesBody, wrapAnywhereClass)}
            >
              <LinkifiedText>{day.notes}</LinkifiedText>
            </motion.div>
          )}

          <motion.div {...fadeUp(4)} {...sx(styles.dayActionsRow)}>
            {hasMappable ? (
              <button type="button" onClick={() => openMap()} {...sx(inkBtnClass)}>
                <Globe2 {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
                Enter Map Mode
              </button>
            ) : (
              <p {...sx(styles.textXs, mutedInkClass, wrapAnywhereClass)}>
                Map Mode needs places with coordinates. Add them in the editor or run Enhance.
              </p>
            )}
            {editable && (
              <Link to={`${tripPath}#${day.id}`} {...sx(secondaryBtnClass)}>
                <Pencil {...sx(styles.icon35)} aria-hidden />
                Edit this day
              </Link>
            )}
          </motion.div>
        </header>

        {day.callouts && day.callouts.length > 0 && (
          <div {...sx(styles.calloutsStack)}>
            {day.callouts.map((c, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(i) }}
                {...sx(styles.calloutRow, calloutToneStyle(c.tone))}
              >
                <span aria-hidden {...sx(styles.calloutIcon)}>
                  {c.icon}
                </span>
                <p {...sx(styles.minW0, styles.flex1, wrapAnywhereClass)}>
                  <LinkifiedText>{c.body}</LinkifiedText>
                </p>
              </motion.div>
            ))}
          </div>
        )}

        {reservations.length > 0 && (
          <section {...sx(styles.daySectionMt10)}>
            <ol {...sx(dy.passes)}>
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
          <section {...sx(styles.daySectionMt10)}>
            <SectionHeading title="Stops" />
            {blocks.map((block, bi) => (
              <motion.div
                key={block.section?.id ?? `block-${bi}`}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-15%" }}
                transition={{ duration: REVEAL_DURATION, ease: EASE }}
                {...sx(styles.stopsBlock)}
              >
                {block.section && (
                  <div {...sx(styles.stopsSectionHeader)}>
                    <h3
                      {...sx(styles.stopsSectionTitle, wrapAnywhereClass)}
                    >
                      {block.section.title}
                    </h3>
                    {block.section.time && (
                      <span {...sx(styles.shrink0, timeCellClass, styles.uppercaseTrackingWide)}>
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
                  <ul {...sx(styles.stopsNotesList)}>
                    {block.section.notes
                      .split("\n")
                      .filter(Boolean)
                      .map((line, li) => (
                        <li key={li} {...sx(styles.stopsBulletItem)}>
                          <span
                            aria-hidden
                            {...sx(styles.stopsBulletDot)}
                          />
                          <span {...sx(styles.minW0, styles.flex1, wrapAnywhereClass)}>
                            <LinkifiedText>{line.replace(/^-\s*/, "")}</LinkifiedText>
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                {block.items.length > 0 && (
                  <ol {...sx(styles.stopsItemList)}>
                    {block.items.map((item, ii) => (
                      <NarrativeItem
                        key={item.id}
                        item={item}
                        last={ii === block.items.length - 1}
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
        <p {...sx(styles.dayHintMt10, mutedInkClass)}>
          Arrow keys move to the previous or next day.
        </p>
        <nav
          {...sx(styles.dayPager)}
          aria-label="Adjacent days"
        >
          {next && (
            <Link
              rel="next"
              to={`${tripPath}/day/${next.id}`}
              {...sx('group', styles.dayPagerLink, styles.dayPagerLinkEnd, overlayHoverClass, focusRingClass)}
            >
              <span {...sx(styles.minW0)}>
                <span {...sx(styles.dayPagerLabel, mutedInkClass)}>
                  Next · Day {dayIndex + 2}
                </span>
                <span {...sx(styles.dayPagerHeading, wrapAnywhereClass)}>
                  {next.title ?? `Day ${dayIndex + 2}`}
                </span>
              </span>
              <ArrowUpRight
                {...sx(styles.dayPagerIcon, styles.rotate45, hoverArrowClass)}
                aria-hidden
              />
            </Link>
          )}
          {prev ? (
            <Link
              rel="prev"
              to={`${tripPath}/day/${prev.id}`}
              {...sx('group', styles.dayPagerLink, styles.dayPagerLinkStart, overlayHoverClass, focusRingClass)}
            >
              <ArrowUpRight
                {...sx(styles.dayPagerIcon, styles.rotateNeg135, hoverArrowBackClass)}
                aria-hidden
              />
              <span {...sx(styles.minW0)}>
                <span {...sx(styles.dayPagerLabel, mutedInkClass)}>
                  Previous · Day {dayIndex}
                </span>
                <span {...sx(styles.dayPagerHeading, wrapAnywhereClass)}>
                  {prev.title ?? `Day ${dayIndex}`}
                </span>
              </span>
            </Link>
          ) : (
            <span {...sx(styles.hiddenSmOrder1)} />
          )}
        </nav>

        {mapOpen && (
          <Suspense
            fallback={
              <div
                {...sx(styles.mapLoadingOverlay)}
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

/** Postage stamp for the day: month, date, weekday — with a wobbly postmark. */
function DateStamp({ date, timezone, city }: { date: string; timezone: string; city?: string }) {
  const part = (o: Intl.DateTimeFormatOptions) => formatTripDate(date, timezone, { weekday: undefined, month: undefined, day: undefined, ...o })
  return (
    <div aria-hidden {...sx(dy.stamp)}>
      <span {...sx(dy.stampMonth)}>{part({ month: "short" })}</span>
      <span {...sx(dy.stampDay)}>{part({ day: "numeric" })}</span>
      <span {...sx(dy.stampWeek)}>{city ?? part({ weekday: "short" })}</span>
      <svg viewBox="0 0 64 40" {...sx(dy.postmark)}>
        <circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M30 12 q6 -4 12 0 t12 0 t10 0 M30 20 q6 -4 12 0 t12 0 t10 0 M30 28 q6 -4 12 0 t12 0 t10 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function WalkLeg({ walk }: { walk: { distance: string; walk: string } }) {
  return (
    <p {...sx(styles.mt2, styles.text13, mutedInkClass)}>
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
    <li id={`item-${item.id}`} {...sx(dy.pass, highlight)}>
      <div {...sx(dy.passStub)}>
        <span {...sx(dy.passType)}>{reservation.type}</span>
        {reservation.type === "flight" ? (
          <Plane {...sx(dy.passIcon)} strokeWidth={2} aria-hidden />
        ) : (
          <Ticket {...sx(dy.passIcon)} strokeWidth={2} aria-hidden />
        )}
      </div>
      <div {...sx(dy.passBody)}>
      {featured ? (
        <div {...sx(styles.reservationHeroRow)}>
          <div {...sx(styles.minW0)}>
            <p {...sx(typeHeroTimeClass, styles.inkPrimary)}>
              {reservation.time ? <FlipTime value={reservation.time} playOnMount /> : <span {...sx(styles.reservationTimeLg)}>Time TBD</span>}
            </p>
            <p {...sx(styles.narrativeTitleLg, wrapAnywhereClass)}>
              <SmartEntity name={reservation.title} type={placeCategoryToEntityType(item.location?.category ?? "place")} />
            </p>
          </div>
          <StatusChip status={item.status} />
        </div>
      ) : (
        <div {...sx(styles.flexRowWrapBaselineBetween)}>
          <p {...sx(styles.reservationTimeLg)}>
            {reservation.time ? <Time value={reservation.time} /> : "TBD"}
          </p>
          <StatusChip status={item.status} />
        </div>
      )}
      {!featured && (
        <p {...sx(styles.mt1, styles.fontMedium, styles.inkPrimary, wrapAnywhereClass)}>
          <SmartEntity name={reservation.title} type={placeCategoryToEntityType(item.location?.category ?? "place")} />
        </p>
      )}
      {reservation.subtitle && (
        <p {...sx(styles.mt1, styles.settingsLabel, mutedInkClass, wrapAnywhereClass)}>{reservation.subtitle}</p>
      )}
      {reservation.address && (
        <p {...sx(styles.mt1, styles.textSm, wrapAnywhereClass)}>
          <a href={mapsUrl(reservation.address)} {...sx(inlineLinkClass)}>
            {reservation.address}
          </a>
        </p>
      )}
      {reservation.notes && (
        <p {...sx(styles.mt1, styles.textSm, mutedInkClass, wrapAnywhereClass)}>
          <LinkifiedText>{reservation.notes}</LinkifiedText>
        </p>
      )}
      {walk && <WalkLeg walk={walk} />}
      </div>
    </li>
  )
}

function NarrativeItem({
  item,
  last,
  city,
  flash,
  walk,
  onOpenMap,
}: {
  item: ItineraryItem
  last: boolean
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
      {...sx(dy.stop, highlight)}
    >
      <div {...sx(styles.itemTimeCol, timeCellClass)}>
        {item.time ? <Time value={item.time} /> : <span aria-hidden>·</span>}
        {item.endTime && (
          <span {...sx(styles.narrativeEndTimeBlock)}>
            <Time value={item.endTime} />
          </span>
        )}
      </div>
      <div aria-hidden {...sx(dy.stopRail)}>
        <span {...sx(dy.stopDot, item.status === "booked" && dy.stopDotBooked)} />
        {!last && <span className="toy-route" {...sx(dy.stopRoute)} />}
      </div>
      <div {...sx(styles.minW0)}>
        <div {...sx(styles.narrativeItemRow)}>
          <ItemIcon
            kind={item.kind}
            category={item.location?.category}
            className={sx(styles.narrativeItemIcon).className}
          />
          <div {...sx(styles.minW0, styles.flex1)}>
            <div {...sx(styles.narrativeTitleRow)}>
              {titled ? (
                <SmartEntity
                  name={item.title}
                  type={entityType}
                  city={city}
                  {...sx(styles.narrativeTitle, wrapAnywhereClass)}
                />
              ) : (
                <span {...sx(styles.narrativeTitle, wrapAnywhereClass)}>
                  {item.title}
                </span>
              )}
              <StatusChip status={item.status} />
            </div>
            {item.notes && (
              <p {...sx(styles.narrativeNotes, wrapAnywhereClass)}>
                <LinkifiedText>{item.notes}</LinkifiedText>
              </p>
            )}
            {item.location?.address && (
              <a
                href={mapsUrl(item.location.address)}
                target="_blank"
                rel="noopener noreferrer"
                {...sx(styles.mt1, styles.block, styles.textXs, mutedInkClass, focusRingClass, wrapAnywhereClass)}
              >
                {item.location.address}
              </a>
            )}
            {walk && <WalkLeg walk={walk} />}
            {onOpenMap && (
              <button type="button" onClick={onOpenMap} {...sx(styles.chipBtnMt2, chipBtnClass)}>
                <Globe2 {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
                Map
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}
