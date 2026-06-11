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
import type { ItineraryItem, Trip, TripAccent, TripDay } from "./types"

// Dossier-style trip overview — the generic equivalent of the /korea index:
// hero bloom + serif title + countdown, today banner, day card grid, and a
// reservations ledger. Fully driven by trip data + trip.appearance.

const SERIF = { fontFamily: "'Cormorant Garamond', serif" } as const
const EASE = [0.16, 1, 0.3, 1] as const

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
      <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6" role="status" aria-label="Loading trip">
        <div className="h-6 w-64 animate-pulse rounded bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-10 h-28 w-3/4 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-900" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-3xl bg-stone-200/60 dark:bg-stone-900" />
          ))}
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Couldn’t load this trip ({state.message}).
        </div>
      </div>
    )
  }

  const { trip, editable } = state
  const a = accentTheme(trip.appearance?.accent as TripAccent | undefined)
  const today = todayIsoIn(trip.timezone)
  const todayDay = trip.days.find((d) => d.date === today)
  const tMinus = daysUntilIn(trip.startDate, trip.timezone)
  const inTrip = today >= trip.startDate && today <= trip.endDate
  const past = today > trip.endDate
  const dayCount = trip.days.length
  const numeral = inTrip
    ? String(trip.days.findIndex((d) => d.date === today) + 1 || 1)
    : past
      ? String(dayCount)
      : String(Math.max(tMinus, 0))
  const numeralLabel = inTrip
    ? `day of ${dayCount} · in trip`
    : past
      ? "days · concluded"
      : tMinus === 0
        ? "departing today"
        : tMinus === 1
          ? "day to go"
          : "days to go"

  const reservations = trip.days.flatMap((day) =>
    day.items
      .filter((i) => i.kind === "reservation")
      .map((item) => ({ day, item })),
  )

  const fadeUp = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: EASE, delay },
  })

  return (
    <div className="-mx-4 -mt-6">
      {/* ── Hero ── */}
      <header className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className={`absolute inset-0 ${a.bloomA}`} />
          <div className={`absolute inset-0 ${a.bloomB}`} />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pt-16 lg:pb-16">
          <motion.p
            {...fadeUp(0)}
            className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500"
          >
            {trip.appearance?.eyebrow ?? "The itinerary"} · {dayCount} day{dayCount === 1 ? "" : "s"} ·{" "}
            {formatTripDate(trip.startDate, trip.timezone, { weekday: undefined })} →{" "}
            {formatTripDate(trip.endDate, trip.timezone, { weekday: undefined })}
          </motion.p>

          <div className="mt-8 grid grid-cols-1 items-end gap-8 sm:mt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <motion.h1 {...fadeUp(0.06)} className="font-serif text-stone-900 dark:text-stone-100" style={SERIF}>
              <span className="block text-[clamp(2.75rem,9vw,6rem)] font-medium leading-[0.95] tracking-[-0.02em]">
                {trip.name}
              </span>
              {trip.appearance?.subtitle && (
                <span className="mt-2 block text-[clamp(1.35rem,3.5vw,2.25rem)] font-light italic leading-tight text-stone-500 dark:text-stone-400">
                  {trip.appearance.subtitle}
                </span>
              )}
            </motion.h1>

            <motion.div {...fadeUp(0.14)} className="flex items-end justify-start gap-5 lg:justify-end">
              <span
                className={`inline-flex font-serif text-[clamp(4.5rem,18vw,11rem)] font-light leading-[0.82] tracking-[-0.05em] tabular-nums ${a.countdown}`}
                style={{ ...SERIF, fontFeatureSettings: '"tnum"' }}
              >
                {numeral}
              </span>
              <span className="mb-2 inline-flex flex-col gap-1 pb-2 text-left">
                <span className={`h-px w-10 ${a.hairline}`} aria-hidden />
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-700 dark:text-stone-300">
                  {numeralLabel}
                </span>
              </span>
            </motion.div>
          </div>

          {trip.appearance?.headline && (
            <motion.p
              {...fadeUp(0.2)}
              className="mt-10 max-w-[60ch] text-base leading-relaxed text-stone-700 sm:text-lg dark:text-stone-300"
            >
              {trip.appearance.headline}
            </motion.p>
          )}

          <motion.dl
            {...fadeUp(0.26)}
            className="mt-10 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-stone-800/80"
          >
            <MetaRow label="Destinations" value={trip.destinations.join(" · ")} />
            <MetaRow
              label="Dates"
              value={`${formatTripDate(trip.startDate, trip.timezone)} – ${formatTripDate(trip.endDate, trip.timezone)}`}
            />
            <MetaRow label="Time zone" value={trip.timezone} />
            <MetaRow label="Status" value={trip.status} className="capitalize" />
          </motion.dl>

          {editable && (
            <motion.div {...fadeUp(0.32)} className="mt-8">
              <Link
                to={`/trips/${trip.id}/edit`}
                className={`inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-stone-50 transition-colors hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 ${a.focusRing} dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300`}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                Edit itinerary
              </Link>
            </motion.div>
          )}
        </div>
      </header>

      {/* ── Today banner ── */}
      {todayDay && (
        <motion.aside {...fadeUp(0.1)} className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <Link
            to={`/trips/${trip.id}/day/${todayDay.id}`}
            className="group block border-y border-stone-200/80 py-4 transition-colors hover:bg-stone-100/50 dark:border-stone-800/80 dark:hover:bg-stone-900/40"
          >
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <p className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] ${a.text}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
                Today · {formatTripDate(todayDay.date, trip.timezone)}
              </p>
              <p
                className={`break-words font-serif text-lg font-medium text-stone-900 transition-colors sm:text-xl dark:text-stone-100 ${a.textHover}`}
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

      {/* ── Day cards ── */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6">
        <SectionHeader
          num="01"
          eyebrow={`The ${dayCount} day${dayCount === 1 ? "" : "s"}`}
          title="Daily itinerary"
          subtitle="Tap a day for the full plan."
          accentNum={a.eyebrowNum}
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trip.days.map((day, i) => (
            <OverviewDayCard
              key={day.id}
              trip={trip}
              day={day}
              index={i}
              isToday={day.date === today}
              isPast={day.date < today}
            />
          ))}
        </div>
      </section>

      {/* ── Reservations ledger ── */}
      {reservations.length > 0 && (
        <>
          <Fleuron />
          <section className="mx-auto mt-16 max-w-6xl px-4 sm:mt-20 sm:px-6">
            <SectionHeader
              num="02"
              eyebrow="Booked moments"
              title="Reservations"
              subtitle="Every confirmed, pending, and tentative booking across the trip."
              accentNum={a.eyebrowNum}
            />
            <ol className="divide-y divide-stone-200/80 dark:divide-stone-800/80">
              {reservations.map(({ day, item }, i) => (
                <ReservationRow key={item.id} trip={trip} day={day} item={item} index={i} />
              ))}
            </ol>
          </section>
        </>
      )}

      {/* ── Footer ── */}
      <footer className="mx-auto mt-20 max-w-6xl px-4 pb-12 sm:px-6">
        <div className="border-t border-stone-200/80 pt-6 dark:border-stone-800/80">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
            Updated · {new Date(trip.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
      </footer>
    </div>
  )
}

function MetaRow({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">{label}</dt>
      <dd className={`mt-1 break-words text-sm leading-snug text-stone-800 dark:text-stone-200 ${className}`}>{value}</dd>
    </div>
  )
}

function SectionHeader({
  num,
  eyebrow,
  title,
  subtitle,
  accentNum,
}: {
  num: string
  eyebrow: string
  title: string
  subtitle?: string
  accentNum: string
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, ease: EASE }}
      className="border-b border-stone-200/80 pb-5 dark:border-stone-800/80"
    >
      <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
        <span className={`tabular-nums ${accentNum}`}>{num}</span>
        <span aria-hidden className="h-px w-10 bg-stone-300 dark:bg-stone-700" />
        <span>{eyebrow}</span>
      </p>
      <h2
        className="mt-3 font-serif text-[clamp(2rem,5.4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
        style={SERIF}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 max-w-[60ch] break-words text-sm leading-relaxed text-stone-600 dark:text-stone-400">{subtitle}</p>
      )}
    </motion.header>
  )
}

function OverviewDayCard({
  trip,
  day,
  index,
  isToday,
  isPast,
}: {
  trip: Trip
  day: TripDay
  index: number
  isToday: boolean
  isPast: boolean
}) {
  const a = accentTheme(trip.appearance?.accent as TripAccent | undefined)
  const booked = day.items.filter((i) => i.kind === "reservation" || i.status === "booked").length
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, ease: EASE, delay: Math.min(index % 3, 2) * 0.06 }}
      whileHover={{ y: -2 }}
      className="h-full"
    >
      <Link
        to={`/trips/${trip.id}/day/${day.id}`}
        className={`group relative block h-full overflow-hidden rounded-3xl border bg-stone-50 transition-[border-color,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus-visible:ring-2 ${a.focusRing} focus-visible:ring-offset-2 hover:shadow-[0_18px_40px_-24px_rgba(28,25,23,0.18)] dark:bg-stone-900/40 dark:hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)] ${
          isToday
            ? a.todayBorder
            : "border-stone-200/80 hover:border-stone-300 hover:bg-stone-100/60 dark:border-stone-800/80 dark:hover:border-stone-700 dark:hover:bg-stone-900/60"
        }${isPast ? " opacity-60" : ""}`}
      >
        {isToday && (
          <span className={`absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] ${a.text}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} aria-hidden />
            Today
          </span>
        )}
        <div className="relative flex h-full flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-stone-500 dark:text-stone-400">
                {cityTag(day.city, trip.appearance?.cityTags)}
              </span>
              <span aria-hidden className="text-stone-300 dark:text-stone-700">·</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                Day {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            {!isToday && day.emoji && (
              <span aria-hidden className="text-2xl leading-none opacity-90">{day.emoji}</span>
            )}
          </div>
          <h3
            className="break-words font-serif text-2xl font-medium leading-tight tracking-[-0.01em] text-stone-900 sm:text-[1.7rem] dark:text-stone-100"
            style={SERIF}
          >
            {day.title ?? `Day ${index + 1}`}
          </h3>
          {day.notes && <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{day.notes}</p>}
          {day.neighborhoods && day.neighborhoods.length > 0 && (
            <p className="text-xs text-stone-500 dark:text-stone-500">{day.neighborhoods.slice(0, 3).join("  ·  ")}</p>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-stone-200/80 pt-3 text-[11px] text-stone-500 dark:border-stone-800/80 dark:text-stone-500">
            <span className="font-mono uppercase tracking-[0.16em]">{formatTripDate(day.date, trip.timezone)}</span>
            <span className="flex items-center gap-3">
              {booked > 0 && (
                <span className={`inline-flex items-center gap-1.5 ${a.text}`}>
                  <span className={`inline-block h-1 w-1 rounded-full ${a.dot}`} aria-hidden />
                  {booked} booked
                </span>
              )}
              {day.weather && (
                <span className="font-mono tabular-nums text-stone-500 dark:text-stone-500">
                  {day.weather.highC}° / {day.weather.lowC}°
                </span>
              )}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

function ReservationRow({
  trip,
  day,
  item,
  index,
}: {
  trip: Trip
  day: TripDay
  item: ItineraryItem
  index: number
}) {
  const status = itemStatusMeta[item.status]
  const dayNum = new Date(`${day.date}T12:00:00Z`).getUTCDate()
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, ease: EASE, delay: Math.min(index, 8) * 0.025 }}
    >
      <Link
        to={`/trips/${trip.id}/day/${day.id}`}
        className="group flex items-start gap-5 py-5 transition-colors hover:bg-stone-100/40 sm:gap-8 dark:hover:bg-stone-900/30"
      >
        <div className="w-[5.5rem] shrink-0 sm:w-[7rem]">
          <p className="font-serif text-3xl font-light leading-none text-stone-900 dark:text-stone-100" style={SERIF}>
            {dayNum}
          </p>
          <p className="mt-1 font-mono text-[10px] lowercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
            {formatTripDate(day.date, trip.timezone, { day: undefined })}
          </p>
          {item.time && (
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-stone-600 dark:text-stone-400">{item.time}</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2.5">
            <span aria-hidden>{reservationTypeIcon[item.reservation?.type ?? ""] ?? "📌"}</span>
            <h3 className="break-words font-serif text-xl font-medium leading-snug text-stone-900 dark:text-stone-100" style={SERIF}>
              {item.title}
            </h3>
          </div>
          {item.notes && (
            <p className="mt-1 break-words text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">{item.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-1.5">
          {status && (
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
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

function Fleuron() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: EASE }}
      className="mx-auto mt-16 flex max-w-6xl items-center gap-6 px-4 sm:mt-20 sm:px-6"
      aria-hidden
    >
      <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
      <span className="select-none font-serif text-2xl leading-none tracking-[0.6em] text-stone-400 dark:text-stone-600" style={SERIF}>
        ···
      </span>
      <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
    </motion.div>
  )
}
