import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Pencil } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { getTrip } from "./tripsApi"
import {
  accentTheme,
  cityTag,
  daysUntilIn,
  formatTripDate,
  itemStatusMeta,
  reservationTypeIcon,
  todayIsoIn,
} from "./theme"
import type { ItineraryItem, Trip, TripDay } from "./types"
import { EASE, SERIF, alertErrorClass, inkBtnClass } from "./ui"

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; trip: Trip; editable: boolean }

export function TripOverview() {
  const { tripId } = useParams<{ tripId: string }>()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const [state, setState] = useState<LoadState>({ status: "loading" })

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
  }, [tripId, getToken])

  if (state.status === "loading") {
    return (
      <div role="status" aria-label="Loading trip">
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
      <div className={alertErrorClass} role="alert">
        Couldn’t load this trip ({state.message}).{" "}
        <button type="button" className="font-semibold underline underline-offset-2" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }

  const { trip, editable } = state
  const a = accentTheme(trip.appearance?.accent)
  const today = todayIsoIn(trip.timezone)
  const todayDay = trip.days.find((d) => d.date === today)
  const tMinus = daysUntilIn(trip.startDate, trip.timezone)
  const inTrip = today >= trip.startDate && today <= trip.endDate
  const past = today > trip.endDate
  const dayCount = trip.days.length

  const statusLine = inTrip
    ? `Day ${trip.days.findIndex((d) => d.date === today) + 1 || 1} of ${dayCount}`
    : past
      ? "Trip concluded"
      : tMinus === 0
        ? "Departing today"
        : tMinus === 1
          ? "1 day to go"
          : `${Math.max(tMinus, 0)} days to go`

  const reservations = trip.days.flatMap((day) =>
    day.items.filter((i) => i.kind === "reservation").map((item) => ({ day, item })),
  )

  const fadeUp = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.42, ease: EASE, delay },
  })

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 sm:-mt-10">
      <header className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className={`absolute inset-0 ${a.bloomA}`} />
          <div className={`absolute inset-0 ${a.bloomB}`} />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pb-12 sm:pt-14">
          <motion.p
            {...fadeUp(0)}
            className="font-mono-trips text-[11px] uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400"
          >
            {trip.appearance?.eyebrow ?? "Itinerary"} · {dayCount} day{dayCount === 1 ? "" : "s"} ·{" "}
            {formatTripDate(trip.startDate, trip.timezone, { weekday: undefined })} →{" "}
            {formatTripDate(trip.endDate, trip.timezone, { weekday: undefined })}
          </motion.p>

          <motion.div {...fadeUp(0.05)} className="mt-6 flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 text-sm font-medium ${a.text}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
              {statusLine}
            </span>
            <span className="capitalize text-sm text-stone-500 dark:text-stone-400">{trip.status}</span>
          </motion.div>

          <motion.h1 {...fadeUp(0.08)} className="mt-4 max-w-[18ch] text-stone-900 dark:text-stone-100" style={SERIF}>
            <span className="block font-display text-[clamp(2.5rem,7vw,4.5rem)] font-medium leading-[0.98] tracking-[-0.02em]">
              {trip.name}
            </span>
            {trip.appearance?.subtitle && (
              <span className="mt-3 block font-display text-[clamp(1.2rem,3vw,1.75rem)] font-light italic leading-snug text-stone-500 dark:text-stone-400">
                {trip.appearance.subtitle}
              </span>
            )}
          </motion.h1>

          {trip.appearance?.headline && (
            <motion.p
              {...fadeUp(0.14)}
              className="mt-6 max-w-[58ch] text-base leading-relaxed text-stone-700 sm:text-[1.05rem] dark:text-stone-300"
            >
              {trip.appearance.headline}
            </motion.p>
          )}
          {!trip.appearance?.headline && trip.description && (
            <motion.p
              {...fadeUp(0.14)}
              className="mt-6 max-w-[58ch] text-base leading-relaxed text-stone-700 dark:text-stone-300"
            >
              {trip.description}
            </motion.p>
          )}

          <motion.dl
            {...fadeUp(0.18)}
            className="mt-9 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-stone-800/80"
          >
            <MetaRow label="Destinations" value={trip.destinations.join(" · ")} />
            <MetaRow
              label="Dates"
              value={`${formatTripDate(trip.startDate, trip.timezone)} – ${formatTripDate(trip.endDate, trip.timezone)}`}
            />
            <MetaRow label="Time zone" value={trip.timezone} />
            <MetaRow
              label="Sharing"
              value={
                trip.sharedWithAllUsers
                  ? "All signed-in users"
                  : trip.collaborators.length
                    ? `${trip.collaborators.length} collaborator${trip.collaborators.length === 1 ? "" : "s"}`
                    : "Private"
              }
            />
          </motion.dl>

          {trip.tags.length > 0 && (
            <motion.ul {...fadeUp(0.22)} className="mt-5 flex flex-wrap gap-1.5" aria-label="Tags">
              {trip.tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-md border border-stone-200/80 px-2 py-0.5 text-xs text-stone-600 dark:border-stone-700 dark:text-stone-400"
                >
                  {tag}
                </li>
              ))}
            </motion.ul>
          )}

          {editable && (
            <motion.div {...fadeUp(0.26)} className="mt-8">
              <Link to={`/trips/${trip.slug ?? trip.id}/edit`} className={inkBtnClass}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit itinerary
              </Link>
            </motion.div>
          )}
        </div>
      </header>

      {todayDay && (
        <motion.aside {...fadeUp(0.08)} className="mx-auto max-w-6xl px-4 sm:px-6">
          <Link
            to={`/trips/${trip.slug ?? trip.id}/day/${todayDay.id}`}
            className={`group block border-y border-stone-200/80 py-4 transition-colors hover:bg-stone-100/40 focus-visible:outline-none focus-visible:ring-2 ${a.focusRing} dark:border-stone-800/80 dark:hover:bg-stone-900/40`}
          >
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <p className={`flex items-center gap-2 font-mono-trips text-[11px] uppercase tracking-[0.2em] ${a.text}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                Today · {formatTripDate(todayDay.date, trip.timezone)}
              </p>
              <p
                className={`break-words font-display text-lg font-medium text-stone-900 transition-colors sm:text-xl dark:text-stone-100 ${a.textHover}`}
                style={SERIF}
              >
                {todayDay.emoji && <span aria-hidden className="mr-2">{todayDay.emoji}</span>}
                Day {trip.days.indexOf(todayDay) + 1}
                {todayDay.title ? `, ${todayDay.title}` : ""}
              </p>
            </div>
          </Link>
        </motion.aside>
      )}

      <section className="mx-auto mt-14 max-w-6xl px-4 sm:mt-16 sm:px-6">
        <SectionHeader
          num="01"
          eyebrow={`${dayCount} day${dayCount === 1 ? "" : "s"}`}
          title="Daily itinerary"
          subtitle={dayCount === 0 ? "No days yet — open the editor to add structure." : "Open a day for reservations, places, and Map Mode."}
          accentNum={a.eyebrowNum}
          reduce={!!reduce}
        />
        {dayCount === 0 ? (
          <div className="mt-8 border border-dashed border-stone-300 px-5 py-10 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-400">
            This trip has no days yet.
            {editable && (
              <>
                {" "}
                <Link to={`/trips/${trip.slug ?? trip.id}/edit`} className="font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-400">
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
                reduce={!!reduce}
              />
            ))}
          </ol>
        )}
      </section>

      {reservations.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6">
          <SectionHeader
            num="02"
            eyebrow="Booked moments"
            title="Reservations"
            subtitle="Confirmed, pending, and tentative bookings across the trip."
            accentNum={a.eyebrowNum}
            reduce={!!reduce}
          />
          <ol className="divide-y divide-stone-200/80 dark:divide-stone-800/80">
            {reservations.map(({ day, item }, i) => (
              <ReservationRow key={item.id} trip={trip} day={day} item={item} index={i} reduce={!!reduce} />
            ))}
          </ol>
        </section>
      )}

      <footer className="mx-auto mt-16 max-w-6xl px-4 pb-10 sm:px-6">
        <div className="border-t border-stone-200/80 pt-5 dark:border-stone-800/80">
          <p className="font-mono-trips text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
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
      <dt className="font-mono-trips text-[10px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-snug text-stone-800 dark:text-stone-200">{value}</dd>
    </div>
  )
}

function SectionHeader({
  num,
  eyebrow,
  title,
  subtitle,
  accentNum,
  reduce,
}: {
  num: string
  eyebrow: string
  title: string
  subtitle?: string
  accentNum: string
  reduce: boolean
}) {
  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: EASE }}
      className="border-b border-stone-200/80 pb-5 dark:border-stone-800/80"
    >
      <p className="flex items-center gap-3 font-mono-trips text-[11px] uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">
        <span className={`tabular-nums ${accentNum}`}>{num}</span>
        <span aria-hidden className="h-px w-8 bg-stone-300 dark:bg-stone-700" />
        <span>{eyebrow}</span>
      </p>
      <h2
        className="mt-3 font-display text-[clamp(1.75rem,4vw,2.5rem)] font-medium leading-[1.08] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
        style={SERIF}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 max-w-[56ch] break-words text-sm leading-relaxed text-stone-600 dark:text-stone-400">{subtitle}</p>
      )}
    </motion.header>
  )
}

function DayRow({
  trip,
  day,
  index,
  isToday,
  isPast,
  reduce,
}: {
  trip: Trip
  day: TripDay
  index: number
  isToday: boolean
  isPast: boolean
  reduce: boolean
}) {
  const a = accentTheme(trip.appearance?.accent)
  const booked = day.items.filter((i) => i.kind === "reservation" || i.status === "booked").length
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.35, ease: EASE, delay: Math.min(index, 10) * 0.025 }}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}/day/${day.id}`}
        className={`group flex items-start gap-4 py-5 transition-colors focus-visible:outline-none focus-visible:ring-2 sm:gap-6 ${a.focusRing} ${
          isPast && !isToday ? "opacity-55 hover:opacity-100" : ""
        } ${isToday ? "bg-stone-100/40 dark:bg-stone-900/30" : "hover:bg-stone-100/30 dark:hover:bg-stone-900/25"}`}
      >
        <div className="w-14 shrink-0 sm:w-16">
          <p className={`font-display text-3xl font-light leading-none tabular-nums ${isToday ? a.countdown : "text-stone-900 dark:text-stone-100"}`} style={SERIF}>
            {String(index + 1).padStart(2, "0")}
          </p>
          <p className="mt-1 font-mono-trips text-[10px] uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
            {cityTag(day.city, trip.appearance?.cityTags)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="break-words font-display text-xl font-medium leading-snug text-stone-900 sm:text-2xl dark:text-stone-100" style={SERIF}>
              {day.emoji && <span aria-hidden className="mr-1.5 text-lg">{day.emoji}</span>}
              {day.title ?? `Day ${index + 1}`}
            </h3>
            {isToday && (
              <span className={`font-mono-trips text-[10px] uppercase tracking-[0.18em] ${a.text}`}>Today</span>
            )}
          </div>
          {day.notes && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{day.notes}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400">
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
          className="mt-1 h-4 w-4 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-600 motion-reduce:group-hover:translate-x-0 dark:text-stone-600 dark:group-hover:text-stone-300"
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
  const status = itemStatusMeta[item.status]
  const dayNum = new Date(`${day.date}T12:00:00Z`).getUTCDate()
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, ease: EASE, delay: Math.min(index, 8) * 0.02 }}
    >
      <Link
        to={`/trips/${trip.slug ?? trip.id}/day/${day.id}`}
        className="group flex items-start gap-5 py-5 transition-colors hover:bg-stone-100/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600/40 sm:gap-8 dark:hover:bg-stone-900/25"
      >
        <div className="w-[5.5rem] shrink-0 sm:w-[7rem]">
          <p className="font-display text-3xl font-light leading-none text-stone-900 dark:text-stone-100" style={SERIF}>
            {dayNum}
          </p>
          <p className="mt-1 font-mono-trips text-[10px] lowercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
            {formatTripDate(day.date, trip.timezone, { day: undefined })}
          </p>
          {item.time && (
            <p className="mt-0.5 font-mono-trips text-[11px] tabular-nums text-stone-600 dark:text-stone-400">{item.time}</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <span aria-hidden>{reservationTypeIcon[item.reservation?.type ?? ""] ?? "📌"}</span>
            <h3 className="break-words font-display text-xl font-medium leading-snug text-stone-900 dark:text-stone-100" style={SERIF}>
              {item.title}
            </h3>
          </div>
          {item.notes && (
            <p className="mt-1 break-words text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">{item.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1.5">
          {status && (
            <span className="flex items-center gap-2 font-mono-trips text-[10px] uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden />
              <span className="hidden sm:inline">{status.label}</span>
            </span>
          )}
          <ArrowUpRight className="h-4 w-4 text-stone-400 transition group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" aria-hidden />
        </div>
      </Link>
    </motion.li>
  )
}
