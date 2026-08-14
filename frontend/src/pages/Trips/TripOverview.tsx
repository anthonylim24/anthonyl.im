import { Link, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Pencil } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { useLoadedTrip } from "./useLoadedTrip"
import {
  ACCENT,
  collaboratorSummary,
  daysUntilIn,
  formatTripDate,
  hasForecast,
  resolveAccent,
  todayIsoIn,
} from "./theme"
import { SectionHeader } from "./components/SectionHeader"
import { ItemIcon } from "./components/ItemIcon"
import { ReservationChip, StatusChip } from "./components/StatusChip"
import type { ItineraryItem, Trip, TripDay } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  DISPLAY,
  accentBandClass,
  alertErrorClass,
  displayCardClass,
  displayTitleClass,
  focusRingClass,
  focusRingInsetClass,
  hoverArrowClass,
  inlineLinkClass,
  metaLabelClass,
  mutedInkClass,
  overlayHoverClass,
  pageClass,
  panelClass,
  panelInteractiveClass,
  primaryBtnClass,
  revealDelay,
  rowPerfClass,
  sectionSpaceClass,
  skeletonClass,
  wrapAnywhereClass,
} from "./ui"

const SHELL = "mx-auto max-w-6xl px-4 sm:px-6"
const PRESS = "active:translate-y-px motion-reduce:active:translate-y-0"

function fadeUp(reduce: boolean | null, step: number) {
  return {
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(step) },
  }
}

function statusLineFor(trip: Trip, today: string): string {
  const dayCount = trip.days.length
  const inTrip = today >= trip.startDate && today <= trip.endDate
  const past = today > trip.endDate
  const tMinus = daysUntilIn(trip.startDate, trip.timezone)
  if (inTrip) {
    return `Day ${trip.days.findIndex((d) => d.date === today) + 1 || 1} of ${dayCount}`
  }
  if (past) return "Concluded"
  if (tMinus === 0) return "Departing today"
  if (tMinus === 1) return "1 day to go"
  return `${Math.max(tMinus, 0)} days to go`
}

function leadDayIndex(trip: Trip, today: string): number | null {
  const todayIdx = trip.days.findIndex((d) => d.date === today)
  if (todayIdx >= 0) return todayIdx
  if (today < trip.startDate && trip.days.length > 0) return 0
  return null
}

function reservationGroups(trip: Trip): Array<{ day: TripDay; dayIndex: number; items: ItineraryItem[] }> {
  return trip.days.flatMap((day, dayIndex) => {
    const items = day.items.filter((item) => item.kind === "reservation")
    return items.length > 0 ? [{ day, dayIndex, items }] : []
  })
}

export function TripOverview() {
  const { tripId } = useParams<{ tripId: string }>()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const { state, reload } = useLoadedTrip(tripId, getToken)

  if (state.status === "loading") {
    return (
      <div className={pageClass()} role="status" aria-label="Loading trip">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="space-y-3 md:col-span-7">
            <div className={`${skeletonClass} h-4 w-36`} />
            <div className={`${skeletonClass} h-12 w-3/4 max-w-md`} />
            <div className={`${skeletonClass} h-4 w-1/2`} />
            <div className={`${skeletonClass} h-11 w-36`} />
          </div>
          <div className={`${skeletonClass} h-44 md:col-span-5`} />
        </div>
        <div className="mt-14 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={`${skeletonClass} h-40 md:col-span-2`} />
          <div className={`${skeletonClass} h-40`} />
          <div className={`${skeletonClass} h-40`} />
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className={pageClass()}>
        <div className={alertErrorClass} role="alert">
          <p className={`min-w-0 ${wrapAnywhereClass}`}>
            Could not open this trip. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" className={`mt-1 font-semibold ${inlineLinkClass}`} onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { trip, editable } = state
  const today = todayIsoIn(trip.timezone)
  const todayDay = trip.days.find((d) => d.date === today)
  const past = today > trip.endDate
  const statusLine = statusLineFor(trip, today)
  const leadIndex = leadDayIndex(trip, today)
  const groups = reservationGroups(trip)
  const blurb = trip.appearance?.headline ?? trip.description
  const tripPath = `/trips/${trip.slug ?? trip.id}`

  const meta: { label: string; value: string }[] = [
    { label: "Destinations", value: trip.destinations.join(", ") },
    {
      label: "Dates",
      value: `${formatTripDate(trip.startDate, trip.timezone)} - ${formatTripDate(trip.endDate, trip.timezone)}`,
    },
    { label: "Time zone", value: trip.timezone },
  ]
  if (trip.collaborators.length > 0) {
    meta.push({ label: "Sharing", value: collaboratorSummary(trip.collaborators) })
  } else if (trip.sharedWithAllUsers) {
    meta.push({ label: "Sharing", value: "Everyone signed in" })
  }

  return (
    <div data-trip-accent={resolveAccent(trip.appearance?.accent)}>
      <header className={pageClass()}>
        <div className="grid grid-cols-1 items-end gap-8 md:grid-cols-12 md:gap-10">
          <motion.div {...fadeUp(reduce, 0)} className="min-w-0 md:col-span-7">
            <p className={`text-sm font-medium ${ACCENT.text}`}>{statusLine}</p>
            <h1 className={`mt-3 ${displayTitleClass} ${wrapAnywhereClass}`} style={DISPLAY}>
              {trip.name}
            </h1>
            {trip.appearance?.subtitle ? (
              <p
                className={`mt-3 max-w-[30ch] pb-1 font-display text-[clamp(1.15rem,2.4vw,1.6rem)] font-light italic leading-[1.1] ${mutedInkClass} ${wrapAnywhereClass}`}
                style={DISPLAY}
              >
                {trip.appearance.subtitle}
              </p>
            ) : null}
            {blurb ? (
              <p className={`mt-4 line-clamp-2 max-w-[56ch] text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
                {blurb}
              </p>
            ) : null}
            {editable ? (
              <div className="mt-6">
                <Link to={`${tripPath}/edit`} className={primaryBtnClass}>
                  <Pencil className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  Edit itinerary
                </Link>
              </div>
            ) : null}
          </motion.div>

          <motion.div {...fadeUp(reduce, 1)} className="md:col-span-5">
            <div className={`trip-plate ${panelClass} p-5 sm:p-6`}>
              <dl className="relative grid grid-cols-1 gap-4 sm:grid-cols-2">
                {meta.map((entry) => (
                  <div key={entry.label} className="min-w-0">
                    <dt className={metaLabelClass}>{entry.label}</dt>
                    <dd className={`mt-1 text-sm leading-snug ${wrapAnywhereClass}`}>{entry.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        </div>
      </header>

      {todayDay ? (
        <motion.aside {...fadeUp(reduce, 2)} className={`border-y ${ACCENT.border} ${ACCENT.softBg}`}>
          <Link
            to={`${tripPath}/day/${todayDay.id}`}
            className={`group mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-6 ${overlayHoverClass} ${focusRingInsetClass}`}
          >
            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT.dot}`} aria-hidden />
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-5">
              <p className={`text-sm font-medium ${ACCENT.text}`}>
                Today
                <span className={`ml-3 font-normal ${mutedInkClass}`}>
                  {formatTripDate(todayDay.date, trip.timezone)}
                </span>
              </p>
              <p className={`${displayCardClass} ${wrapAnywhereClass}`} style={DISPLAY}>
                {todayDay.emoji ? (
                  <span aria-hidden className="mr-2">
                    {todayDay.emoji}
                  </span>
                ) : null}
                Day {trip.days.indexOf(todayDay) + 1}
                {todayDay.title ? `, ${todayDay.title}` : ""}
              </p>
            </div>
            <ArrowUpRight className={`ml-auto h-4 w-4 shrink-0 ${hoverArrowClass} ${ACCENT.text}`} strokeWidth={1.5} aria-hidden />
          </Link>
        </motion.aside>
      ) : null}

      <section className={`${SHELL} ${sectionSpaceClass}`}>
        <SectionHeader title="Days" animate />
        {trip.days.length === 0 ? (
          <div className={`${panelClass} mt-6 px-5 py-10`}>
            <p className={displayCardClass} style={DISPLAY}>
              No days yet
            </p>
            <p className={`mt-2 max-w-[48ch] text-sm leading-relaxed ${mutedInkClass}`}>
              {editable
                ? "This trip has no days. Use Edit itinerary to add the first one."
                : "This trip has no days yet."}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {trip.days.map((day, index) => (
              <DayCard
                key={day.id}
                trip={trip}
                day={day}
                index={index}
                isToday={day.date === today}
                isLead={index === leadIndex}
                elapsed={day.date < today && !past}
                reduce={!!reduce}
              />
            ))}
          </div>
        )}
      </section>

      {groups.length > 0 ? (
        <section className={`${SHELL} ${sectionSpaceClass}`}>
          <SectionHeader title="Reservations" animate />
          <div className="mt-6 space-y-8">
            {groups.map(({ day, dayIndex, items }) => (
              <div key={day.id}>
                <h3 className={`${displayCardClass} ${wrapAnywhereClass}`} style={DISPLAY}>
                  {day.title ?? `Day ${dayIndex + 1}`}
                </h3>
                <p className={`mt-1 text-sm ${mutedInkClass}`}>{formatTripDate(day.date, trip.timezone)}</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {items.map((item, itemIndex) => (
                    <ReservationCard
                      key={item.id}
                      trip={trip}
                      day={day}
                      item={item}
                      index={itemIndex}
                      reduce={!!reduce}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className={`${SHELL} mt-14 pb-10 sm:mt-20`}>
        <p className={`text-sm ${mutedInkClass}`}>
          Updated{" "}
          {new Date(trip.updatedAt).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </footer>
    </div>
  )
}

function DayCard({
  trip,
  day,
  index,
  isToday,
  isLead,
  elapsed,
  reduce,
}: {
  trip: Trip
  day: TripDay
  index: number
  isToday: boolean
  isLead: boolean
  elapsed: boolean
  reduce: boolean
}) {
  const booked = day.items.filter((item) => item.kind === "reservation" || item.status === "booked").length
  const hoods = day.neighborhoods?.slice(0, 3) ?? []
  const titleTone = elapsed ? mutedInkClass : ""

  return (
    <motion.div
      className={`${rowPerfClass} ${isLead ? "md:col-span-2" : ""}`}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}/day/${day.id}`}
        className={`${panelInteractiveClass} ${PRESS} ${focusRingClass} ${isToday ? accentBandClass : ""} block h-full p-5 ${
          isLead ? "md:flex md:items-start md:gap-8 md:p-6" : ""
        }`}
      >
        <div className={`flex items-baseline justify-between gap-3 ${isLead ? "md:w-24 md:shrink-0 md:flex-col md:items-start" : ""}`}>
          <span
            className={`font-mono-trips text-sm tabular-nums ${isToday ? ACCENT.text : mutedInkClass}`}
          >
            {index + 1}
          </span>
          {day.city ? (
            <span className={`max-w-[10rem] truncate text-xs ${mutedInkClass}`} title={day.city}>
              {day.city}
            </span>
          ) : null}
        </div>
        <div className={`min-w-0 ${isLead ? "md:flex-1" : ""}`}>
          <h3
            className={`mt-3 ${displayCardClass} ${wrapAnywhereClass} ${isLead ? "md:mt-0" : ""} ${titleTone}`}
            style={DISPLAY}
          >
            {day.emoji ? (
              <span aria-hidden className="mr-1.5">
                {day.emoji}
              </span>
            ) : null}
            {day.title ?? `Day ${index + 1}`}
            {isToday ? <span className={`ml-2 text-sm font-medium ${ACCENT.text}`}>Today</span> : null}
          </h3>
          {day.notes ? (
            <p className={`mt-2 line-clamp-2 text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
              {day.notes}
            </p>
          ) : null}
          <div className={`mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${mutedInkClass}`}>
            <span>{formatTripDate(day.date, trip.timezone)}</span>
            {booked > 0 ? <span>{booked} booked</span> : null}
            {hasForecast(day.weather) ? (
              <span className="font-mono-trips tabular-nums">
                {day.weather.highC}° / {day.weather.lowC}°
              </span>
            ) : null}
            {hoods.length > 0 ? (
              <span className={`truncate ${hoods.length === 1 && !hasForecast(day.weather) && booked === 0 ? "" : "col-span-2"}`}>
                {hoods.join(", ")}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

function ReservationCard({
  trip,
  day,
  item,
  index,
  reduce,
}: {
  trip: Trip
  day: TripDay
  item: ItineraryItem
  index: number
  reduce: boolean
}) {
  return (
    <motion.div
      className={rowPerfClass}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}/day/${day.id}#item-${item.id}`}
        className={`${panelInteractiveClass} ${PRESS} ${focusRingClass} flex items-start gap-3 p-4`}
      >
        <ItemIcon
          kind={item.kind}
          category={item.location?.category}
          reservationType={item.reservation?.type}
          className={`mt-0.5 h-4 w-4 shrink-0 ${mutedInkClass}`}
        />
        <div className="min-w-0 flex-1">
          <h4 className={`text-sm font-medium leading-snug ${wrapAnywhereClass}`}>{item.title}</h4>
          {item.time ? <p className={`mt-1 ${mutedInkClass} font-mono-trips text-[11px] tabular-nums`}>{item.time}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusChip status={item.status} />
            {item.reservation ? <ReservationChip status={item.reservation.status} /> : null}
          </div>
        </div>
        <ArrowUpRight className={`mt-0.5 h-4 w-4 shrink-0 ${mutedInkClass} ${hoverArrowClass}`} strokeWidth={1.5} aria-hidden />
      </Link>
    </motion.div>
  )
}
