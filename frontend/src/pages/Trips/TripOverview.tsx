import { Link, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Pencil } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { useLoadedTrip } from "./useLoadedTrip"
import {
  ACCENT,
  cityTag,
  collaboratorSummary,
  daysUntilIn,
  formatTripDate,
  resolveAccent,
  todayIsoIn,
  visibleTags,
} from "./theme"
import { DossierSectionHeader } from "./components/DossierSectionHeader"
import { ItemIcon } from "./components/ItemIcon"
import { StatusChip } from "./components/StatusChip"
import type { ItineraryItem, Trip, TripDay } from "./types"
import {
  EASE,
  REVEAL_DURATION,
  SERIF,
  alertErrorClass,
  focusRingClass,
  focusRingInsetClass,
  hoverArrowClass,
  inkBtnClass,
  inlineLinkClass,
  metaLabelClass,
  mutedInkClass,
  overlayHoverClass,
  pageClass,
  revealDelay,
  wrapAnywhereClass,
} from "./ui"

/** `<main>` is unconstrained so the hero bloom can be full-bleed. */
const gutterClass = pageClass()

export function TripOverview() {
  const { tripId } = useParams<{ tripId: string }>()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const { state, reload } = useLoadedTrip(tripId, getToken)

  if (state.status === "loading") {
    return (
      <div className={gutterClass} role="status" aria-label="Loading trip">
        <div className="h-4 w-48 animate-pulse rounded bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-8 h-16 w-3/4 max-w-xl animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-10 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-900" />
          ))}
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className={gutterClass}>
        <div className={alertErrorClass} role="alert">
          <p className={`min-w-0 ${wrapAnywhereClass}`}>
            Couldn’t open this trip. Check your connection, then try again. ({state.message})
          </p>
          <button type="button" className={`mt-1 font-semibold ${inlineLinkClass}`} onClick={reload}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const { trip, editable } = state
  const a = ACCENT
  const today = todayIsoIn(trip.timezone)
  const todayDay = trip.days.find((d) => d.date === today)
  const tMinus = daysUntilIn(trip.startDate, trip.timezone)
  const inTrip = today >= trip.startDate && today <= trip.endDate
  const past = today > trip.endDate
  const dayCount = trip.days.length

  const statusLine = inTrip
    ? `Day ${trip.days.findIndex((d) => d.date === today) + 1 || 1} of ${dayCount}`
    : past
      ? "Concluded"
      : tMinus === 0
        ? "Departing today"
        : tMinus === 1
          ? "1 day to go"
          : `${Math.max(tMinus, 0)} days to go`

  const reservations = trip.days.flatMap((day) =>
    day.items.filter((i) => i.kind === "reservation").map((item) => ({ day, item })),
  )

  const tags = visibleTags(trip.tags)
  const meta: { label: string; value: string }[] = [
    { label: "Destinations", value: trip.destinations.join(" · ") },
    {
      label: "Dates",
      value: `${formatTripDate(trip.startDate, trip.timezone)} – ${formatTripDate(trip.endDate, trip.timezone)}`,
    },
    { label: "Time zone", value: trip.timezone },
  ]
  if (trip.collaborators.length > 0) {
    meta.push({ label: "Sharing", value: collaboratorSummary(trip.collaborators) })
  }

  const fadeUp = (step: number) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(step) },
  })

  return (
    <div data-trip-accent={resolveAccent(trip.appearance?.accent)}>
      <header className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className={`absolute inset-0 ${a.bloomA}`} />
          <div className={`absolute inset-0 ${a.bloomB}`} />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6 sm:pb-10 sm:pt-10">
          <motion.p
            {...fadeUp(0)}
            className={`font-mono-trips text-[11px] uppercase tracking-[0.24em] ${mutedInkClass}`}
          >
            {trip.appearance?.eyebrow ?? "Itinerary"} · {dayCount} day{dayCount === 1 ? "" : "s"} ·{" "}
            {formatTripDate(trip.startDate, trip.timezone, { weekday: undefined })} →{" "}
            {formatTripDate(trip.endDate, trip.timezone, { weekday: undefined })}
          </motion.p>

          <motion.div {...fadeUp(1)} className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`inline-flex items-center gap-2 text-sm font-medium ${a.text}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
              {statusLine}
            </span>
          </motion.div>

          <motion.h1 {...fadeUp(2)} className="mt-4 text-stone-900 dark:text-stone-100" style={SERIF}>
            <span className={`block max-w-[16ch] font-display text-[clamp(2.5rem,7vw,4.25rem)] font-medium leading-[0.98] tracking-[-0.02em] ${wrapAnywhereClass}`}>
              {trip.name}
            </span>
            {trip.appearance?.subtitle && (
              <span className={`mt-3 block max-w-[30ch] font-display text-[clamp(1.2rem,3vw,1.75rem)] font-light italic leading-snug ${mutedInkClass} ${wrapAnywhereClass}`}>
                {trip.appearance.subtitle}
              </span>
            )}
          </motion.h1>

          {trip.appearance?.headline && (
            <motion.p
              {...fadeUp(3)}
              className="mt-5 max-w-[58ch] text-base leading-relaxed text-stone-700 sm:text-[1.05rem] dark:text-stone-300"
            >
              {trip.appearance.headline}
            </motion.p>
          )}
          {!trip.appearance?.headline && trip.description && (
            <motion.p
              {...fadeUp(3)}
              className="mt-5 max-w-[58ch] text-base leading-relaxed text-stone-700 dark:text-stone-300"
            >
              {trip.description}
            </motion.p>
          )}

          <motion.dl
            {...fadeUp(4)}
            className={`mt-8 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-5 sm:grid-cols-2 dark:border-stone-800/80 ${
              meta.length > 3 ? "lg:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {meta.map((entry) => (
              <MetaRow key={entry.label} label={entry.label} value={entry.value} />
            ))}
          </motion.dl>

          {tags.length > 0 && (
            <motion.ul {...fadeUp(5)} className="mt-5 flex flex-wrap gap-1.5" aria-label="Tags">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className={`rounded-md border border-stone-200/80 px-2 py-0.5 text-xs dark:border-stone-700 ${mutedInkClass} ${wrapAnywhereClass}`}
                >
                  {tag}
                </li>
              ))}
            </motion.ul>
          )}

          {editable && (
            <motion.div {...fadeUp(6)} className="mt-7">
              <Link to={`/trips/${trip.slug ?? trip.id}/edit`} className={inkBtnClass}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit itinerary
              </Link>
            </motion.div>
          )}
        </div>
      </header>

      {todayDay && (
        <motion.aside {...fadeUp(2)} className={`border-y ${a.border} ${a.softBg}`}>
          <Link
            to={`/trips/${trip.slug ?? trip.id}/day/${todayDay.id}`}
            className={`group mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 transition-colors sm:px-6 ${overlayHoverClass} ${focusRingInsetClass}`}
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1">
              <p className={`flex items-center gap-2 font-mono-trips text-[11px] uppercase tracking-[0.2em] ${a.text}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                Today · {formatTripDate(todayDay.date, trip.timezone)}
              </p>
              <p
                className={`font-display text-lg font-medium text-stone-900 transition-colors sm:text-xl dark:text-stone-100 ${a.textHover} ${wrapAnywhereClass}`}
                style={SERIF}
              >
                {todayDay.emoji && <span aria-hidden className="mr-2">{todayDay.emoji}</span>}
                Day {trip.days.indexOf(todayDay) + 1}
                {todayDay.title ? `, ${todayDay.title}` : ""}
              </p>
            </div>
            <ArrowUpRight
              className={`ml-auto h-4 w-4 shrink-0 ${hoverArrowClass} ${a.text}`}
              aria-hidden
            />
          </Link>
        </motion.aside>
      )}

      <section className="mx-auto mt-8 max-w-6xl px-4 sm:mt-14 sm:px-6">
        <DossierSectionHeader
          scale="page"
          animate
          num="01"
          eyebrow={`${dayCount} day${dayCount === 1 ? "" : "s"}`}
          title="Daily itinerary"
          subtitle={
            dayCount === 0
              ? "No days yet. Open the editor to add structure."
              : "Open a day for reservations, places, and Map Mode."
          }
        />
        {dayCount === 0 ? (
          <div className={`mt-8 border border-dashed border-stone-300 px-5 py-10 text-sm dark:border-stone-700 ${mutedInkClass}`}>
            This trip has no days yet.
            {editable && (
              <>
                {" "}
                <Link
                  to={`/trips/${trip.slug ?? trip.id}/edit`}
                  className={`font-semibold ${inlineLinkClass} ${a.text}`}
                >
                  Open the editor
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          <ol className="mt-2 divide-y divide-stone-200/80 dark:divide-stone-800/80">
            {trip.days.map((day, i) => (
              <DayRow
                key={day.id}
                trip={trip}
                day={day}
                index={i}
                isToday={day.date === today}
                isPast={day.date < today}
                concluded={past}
                reduce={!!reduce}
              />
            ))}
          </ol>
        )}
      </section>

      {reservations.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6">
          <DossierSectionHeader
            scale="page"
            animate
            num="02"
            eyebrow="Booked moments"
            title="Reservations"
            subtitle="Confirmed, pending, and tentative bookings across the trip."
          />
          <ol className="mt-2 divide-y divide-stone-200/80 dark:divide-stone-800/80">
            {reservations.map(({ day, item }, i) => (
              <ReservationRow key={item.id} trip={trip} day={day} item={item} index={i} reduce={!!reduce} />
            ))}
          </ol>
        </section>
      )}

      <footer className="mx-auto mt-16 max-w-6xl px-4 pb-10 sm:px-6">
        <div className="border-t border-stone-200/80 pt-5 dark:border-stone-800/80">
          <p className={`font-mono-trips text-[11px] uppercase tracking-[0.18em] ${mutedInkClass}`}>
            Updated ·{" "}
            {new Date(trip.updatedAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </footer>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className={metaLabelClass}>{label}</dt>
      <dd className={`mt-1 text-sm leading-snug text-stone-800 dark:text-stone-200 ${wrapAnywhereClass}`}>{value}</dd>
    </div>
  )
}

function DayRow({
  trip,
  day,
  index,
  isToday,
  isPast,
  concluded,
  reduce,
}: {
  trip: Trip
  day: TripDay
  index: number
  isToday: boolean
  isPast: boolean
  concluded: boolean
  reduce: boolean
}) {
  const a = ACCENT
  const booked = day.items.filter((i) => i.kind === "reservation" || i.status === "booked").length
  // Elapsed days recede by hue, not opacity: a translucent row composited on
  // the parchment canvas cannot hold 4.5:1 at any useful level of dimming.
  // Once the trip is over every day is elapsed, so receding them all would
  // just print the whole archive quietly — the treatment only earns its keep
  // while there are days still ahead to contrast against.
  const elapsed = isPast && !isToday && !concluded
  const numeralClass = isToday
    ? a.text
    : elapsed
      ? "text-stone-500 dark:text-stone-500"
      : "text-stone-900 dark:text-stone-100"
  const titleClass = elapsed ? mutedInkClass : "text-stone-900 dark:text-stone-100"
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}/day/${day.id}`}
        className={`group flex items-start gap-4 py-5 transition-colors focus-visible:outline-none focus-visible:ring-2 sm:gap-6 ${a.focusRing} ${
          isToday ? "bg-stone-100/40 dark:bg-stone-900/30" : "hover:bg-stone-100/30 dark:hover:bg-stone-900/25"
        }`}
      >
        <div className="w-16 shrink-0 sm:w-20">
          <p className={`font-display text-3xl font-light leading-none tabular-nums ${numeralClass}`} style={SERIF}>
            {String(index + 1).padStart(2, "0")}
          </p>
          <p className={`mt-1 font-mono-trips text-[10px] uppercase tracking-[0.14em] ${mutedInkClass}`}>
            {cityTag(day.city, trip.appearance?.cityTags)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3
              className={`font-display text-xl font-medium leading-snug sm:text-2xl ${titleClass} ${wrapAnywhereClass}`}
              style={SERIF}
            >
              {day.emoji && <span aria-hidden className="mr-1.5 text-lg">{day.emoji}</span>}
              {day.title ?? `Day ${index + 1}`}
            </h3>
            {isToday && (
              <span className={`font-mono-trips text-[10px] uppercase tracking-[0.18em] ${a.text}`}>Today</span>
            )}
          </div>
          {day.notes && (
            <p className={`mt-1 line-clamp-2 text-sm leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>
              {day.notes}
            </p>
          )}
          <div className={`mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] ${mutedInkClass}`}>
            <span className="font-mono-trips uppercase tracking-[0.14em]">{formatTripDate(day.date, trip.timezone)}</span>
            {booked > 0 && (
              <span className={`inline-flex items-center gap-1.5 ${a.text}`}>
                <span className={`inline-block h-1 w-1 rounded-full ${a.dot}`} aria-hidden />
                {booked} booked
              </span>
            )}
            {day.weather && (
              <span className="font-mono-trips tabular-nums">
                {day.weather.highC}° / {day.weather.lowC}°
              </span>
            )}
            {day.neighborhoods && day.neighborhoods.length > 0 && (
              <span className="truncate">{day.neighborhoods.slice(0, 3).join(" · ")}</span>
            )}
          </div>
        </div>
        <ArrowUpRight
          className={`mt-1 h-4 w-4 shrink-0 text-stone-300 group-hover:text-stone-600 dark:text-stone-600 dark:group-hover:text-stone-300 ${hoverArrowClass}`}
          aria-hidden
        />
      </Link>
    </motion.li>
  )
}

function ReservationRow({
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
  const dayNum = new Date(`${day.date}T12:00:00Z`).getUTCDate()
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: REVEAL_DURATION, ease: EASE, delay: revealDelay(index) }}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}/day/${day.id}#item-${item.id}`}
        className={`group flex items-start gap-5 py-5 transition-colors hover:bg-stone-100/30 sm:gap-8 dark:hover:bg-stone-900/25 ${focusRingClass}`}
      >
        <div className="w-[5.5rem] shrink-0 sm:w-[7rem]">
          <p className="font-display text-3xl font-light leading-none text-stone-900 dark:text-stone-100" style={SERIF}>
            {dayNum}
          </p>
          <p className={`mt-1 font-mono-trips text-[10px] lowercase tracking-[0.14em] ${mutedInkClass}`}>
            {formatTripDate(day.date, trip.timezone, { day: undefined })}
          </p>
          {item.time && (
            <p className={`mt-0.5 font-mono-trips text-[11px] tabular-nums ${mutedInkClass}`}>{item.time}</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <ItemIcon
              kind={item.kind}
              category={item.location?.category}
              reservationType={item.reservation?.type}
              className="h-4 w-4 shrink-0 translate-y-0.5 text-stone-500 dark:text-stone-400"
            />
            <h3
              className={`font-display text-xl font-medium leading-snug text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}
              style={SERIF}
            >
              {item.title}
            </h3>
          </div>
          {item.notes && (
            <p className={`mt-1 text-[13px] leading-relaxed ${mutedInkClass} ${wrapAnywhereClass}`}>{item.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1.5">
          <StatusChip status={item.status} />
          <ArrowUpRight className={`h-4 w-4 text-stone-500 dark:text-stone-400 ${hoverArrowClass}`} aria-hidden />
        </div>
      </Link>
    </motion.li>
  )
}
