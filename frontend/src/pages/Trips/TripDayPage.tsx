import { lazy, Suspense, useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Globe2, Pencil } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { getTrip } from "./tripsApi"
import { accentTheme, calloutTone, cityTag, formatTripDate, itemIcon, itemStatusMeta, todayIsoIn } from "./theme"
import type { ItineraryItem, Trip, TripAccent } from "./types"

const MapModeOverlay = lazy(() =>
  import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

const SERIF = { fontFamily: "'Cormorant Garamond', serif" } as const
const EASE = [0.16, 1, 0.3, 1] as const

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; trip: Trip; editable: boolean }

/** Group a day's items into narrative blocks: each section item starts a
 *  block; reservation items are pulled out separately into the timeline. */
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

export function TripDayPage() {
  const { tripId, dayId } = useParams<{ tripId: string; dayId: string }>()
  const getToken = useGetToken()
  const reduce = useReducedMotion()
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [mapOpen, setMapOpen] = useState(false)

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
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6" role="status" aria-label="Loading day">
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
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Couldn’t load this day ({state.message}).
        </div>
      </div>
    )
  }

  const { trip, editable } = state
  const dayIndex = trip.days.findIndex((d) => d.id === dayId)
  const day = trip.days[dayIndex]
  if (!day) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 text-sm text-stone-500">
        Day not found.{" "}
        <Link to={`/trips/${trip.id}`} className="font-semibold underline">Back to the trip</Link>.
      </div>
    )
  }

  const a = accentTheme(trip.appearance?.accent as TripAccent | undefined)
  const isToday = day.date === todayIsoIn(trip.timezone)
  const reservations = day.items.filter((i) => i.kind === "reservation")
  const blocks = narrativeBlocks(day.items)
  const hasMappable = day.items.some((i) => i.location?.lat != null && i.location?.lng != null)
  const prev = trip.days[dayIndex - 1]
  const next = trip.days[dayIndex + 1]

  const fadeUp = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: EASE, delay },
  })

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Header ── */}
      <motion.p
        {...fadeUp(0)}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500"
      >
        <Link to={`/trips/${trip.id}`} className="text-stone-700 transition-colors hover:underline dark:text-stone-300">
          {cityTag(day.city, trip.appearance?.cityTags)}
        </Link>
        <span aria-hidden className="h-px w-8 bg-stone-300 dark:bg-stone-700" />
        <span className="tabular-nums">
          Day {String(dayIndex + 1).padStart(2, "0")} of {String(trip.days.length).padStart(2, "0")}
        </span>
        <span aria-hidden>·</span>
        <span>{formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })}</span>
        {isToday && (
          <span className={`flex items-center gap-1.5 ${a.text}`}>
            <span aria-hidden>·</span>
            <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none ${a.dot}`} aria-hidden />
            live
          </span>
        )}
      </motion.p>

      <motion.div {...fadeUp(0.08)} className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={`font-serif text-[clamp(3.5rem,9vw,5.5rem)] font-light leading-[0.85] tabular-nums ${a.countdown}`}
          style={SERIF}
          aria-hidden
        >
          {dayIndex + 1}
        </span>
        {day.emoji && <span aria-hidden className="text-4xl leading-none sm:text-5xl">{day.emoji}</span>}
        <h1
          className="min-w-0 flex-1 break-words font-serif text-[clamp(2rem,5.5vw,3.5rem)] font-medium leading-[1.02] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
          style={SERIF}
        >
          {day.title ?? `Day ${dayIndex + 1}`}
        </h1>
      </motion.div>

      {day.notes && (
        <motion.p {...fadeUp(0.16)} className="mt-5 max-w-[60ch] text-base leading-relaxed text-stone-700 dark:text-stone-300">
          {day.notes}
        </motion.p>
      )}

      <motion.dl
        {...fadeUp(0.22)}
        className="mt-7 grid grid-cols-2 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-5 sm:grid-cols-3 dark:border-stone-800/80"
      >
        {day.city && <Meta label="City" value={day.city} />}
        {day.weather && (
          <Meta label="Weather" value={`${day.weather.highC}°C / ${day.weather.lowC}°C · ${day.weather.condition}`} />
        )}
        {day.neighborhoods && day.neighborhoods.length > 0 && (
          <Meta label="Neighborhoods" value={day.neighborhoods.join(" · ")} />
        )}
        {reservations.length > 0 && <Meta label="Booked" value={`${reservations.length} reservation${reservations.length === 1 ? "" : "s"}`} />}
      </motion.dl>

      <motion.div {...fadeUp(0.3)} className="mt-7 flex flex-wrap items-center gap-3">
        {hasMappable && (
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className={`group inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-stone-50 transition-colors hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 ${a.focusRing} dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300`}
          >
            <Globe2 className="h-4 w-4 transition-transform duration-300 group-hover:rotate-[14deg] motion-reduce:group-hover:rotate-0" aria-hidden />
            Map Mode
          </button>
        )}
        {editable && (
          <Link
            to={`/trips/${trip.id}/edit#${day.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900 dark:border-stone-700 dark:text-stone-300 dark:hover:text-stone-100"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit this day
          </Link>
        )}
      </motion.div>

      {/* ── Callouts ── */}
      {day.callouts && day.callouts.length > 0 && (
        <div className="mt-9 space-y-3">
          {day.callouts.map((c, i) => (
            <motion.div
              key={i}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
              className={`flex items-start gap-3 rounded-2xl border p-4 text-sm text-stone-800 dark:text-stone-200 ${calloutTone(c.tone)}`}
            >
              <span aria-hidden className="text-lg leading-none">{c.icon}</span>
              <p className="min-w-0 flex-1 break-words">{c.body}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Booked moments (timeline) ── */}
      {reservations.length > 0 && (
        <section className="mt-12">
          <DaySectionHeader num="01" eyebrow="Booked moments" title="Reservations" accentNum={a.eyebrowNum} />
          <div className="relative mt-6 space-y-6 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-stone-200/90 sm:pl-8 sm:before:left-[11px] dark:before:bg-stone-800/90">
            {reservations.map((item, i) => (
              <ReservationTimelineItem key={item.id} item={item} index={i} accentDot={a.dot} />
            ))}
          </div>
        </section>
      )}

      {/* ── Narrative blocks ── */}
      {blocks.length > 0 && (
        <section className="mt-12 divide-y divide-stone-200/80 dark:divide-stone-800/80">
          {blocks.map((block, bi) => (
            <motion.div
              key={block.section?.id ?? `block-${bi}`}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ duration: 0.5, ease: EASE }}
              className="py-8 first:pt-0 sm:py-10"
            >
              {block.section && (
                <div className="flex items-baseline justify-between gap-x-6">
                  <h3
                    className="font-serif text-xl font-medium tracking-[-0.01em] text-stone-900 sm:text-2xl dark:text-stone-100"
                    style={SERIF}
                  >
                    {block.section.title}
                  </h3>
                  {block.section.time && (
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
                      {block.section.time}
                      {block.section.endTime ? ` – ${block.section.endTime}` : ""}
                    </span>
                  )}
                </div>
              )}
              {block.section?.notes && (
                <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                  {block.section.notes.split("\n").map((line, li) => (
                    <li key={li} className="flex gap-3 break-words">
                      <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-stone-400 dark:bg-stone-600" />
                      <span className="min-w-0 flex-1 break-words">{line.replace(/^-\s*/, "")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {block.items.length > 0 && (
                <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                  {block.items.map((item) => (
                    <NarrativeItem key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </motion.div>
          ))}
        </section>
      )}

      {/* ── Prev / next ── */}
      <nav className="mt-12 grid grid-cols-1 gap-2 border-t border-stone-200/80 pt-6 sm:grid-cols-2 sm:gap-6 dark:border-stone-800/80" aria-label="Adjacent days">
        {prev ? (
          <Link
            to={`/trips/${trip.id}/day/${prev.id}`}
            className="group -mx-2 flex items-center gap-4 rounded-2xl px-2 py-3 transition-colors hover:bg-stone-100/60 dark:hover:bg-stone-900/40"
          >
            <ArrowUpRight className="h-4 w-4 shrink-0 -rotate-[135deg] text-stone-400 transition group-hover:-translate-x-0.5 motion-reduce:group-hover:translate-x-0" aria-hidden />
            <span className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">Previous · Day {dayIndex}</span>
              <span className="block truncate font-serif text-base font-medium text-stone-900 dark:text-stone-100" style={SERIF}>
                {prev.title ?? `Day ${dayIndex}`}
              </span>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            to={`/trips/${trip.id}/day/${next.id}`}
            className="group -mx-2 flex items-center justify-end gap-4 rounded-2xl px-2 py-3 text-right transition-colors hover:bg-stone-100/60 dark:hover:bg-stone-900/40"
          >
            <span className="min-w-0">
              <span className="block font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">Next · Day {dayIndex + 2}</span>
              <span className="block truncate font-serif text-base font-medium text-stone-900 dark:text-stone-100" style={SERIF}>
                {next.title ?? `Day ${dayIndex + 2}`}
              </span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 rotate-45 text-stone-400 transition group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" aria-hidden />
          </Link>
        )}
      </nav>

      {/* ── Map Mode ── */}
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
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-snug text-stone-800 dark:text-stone-200">{value}</dd>
    </div>
  )
}

function DaySectionHeader({ num, eyebrow, title, accentNum }: { num: string; eyebrow: string; title: string; accentNum: string }) {
  return (
    <header className="border-b border-stone-200/80 pb-4 dark:border-stone-800/80">
      <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
        <span className={`tabular-nums ${accentNum}`}>{num}</span>
        <span aria-hidden className="h-px w-10 bg-stone-300 dark:bg-stone-700" />
        <span>{eyebrow}</span>
      </p>
      <h2 className="mt-2 font-serif text-2xl font-medium leading-tight tracking-[-0.01em] text-stone-900 sm:text-3xl dark:text-stone-100" style={SERIF}>
        {title}
      </h2>
    </header>
  )
}

function ReservationTimelineItem({ item, index, accentDot }: { item: ItineraryItem; index: number; accentDot: string }) {
  const reduce = useReducedMotion()
  const status = itemStatusMeta[item.status]
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ type: "spring", stiffness: 380, damping: 28, delay: reduce ? 0 : index * 0.04 }}
      className="relative"
    >
      <span className={`absolute -left-[23px] top-5 h-2.5 w-2.5 rounded-full ring-2 ring-stone-100 sm:-left-[29px] dark:ring-stone-900 ${accentDot}`} aria-hidden />
      {item.time && (
        <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
          {item.time}
          {item.endTime ? ` – ${item.endTime}` : ""}
        </p>
      )}
      <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white/80 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-900/60">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xl shadow-inner dark:bg-stone-800" aria-hidden>
          {itemIcon(item.kind, item.location?.category, item.reservation?.type)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{item.title}</h3>
            {status && (
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${status.chip}`}>
                {status.label}
              </span>
            )}
          </div>
          {item.notes && <p className="mt-1 text-sm text-stone-700 dark:text-stone-300">{item.notes}</p>}
          {item.location?.address && (
            <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">📍 {item.location.address}</p>
          )}
          {item.reservation?.contact && (
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">☎️ {item.reservation.contact}</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function NarrativeItem({ item }: { item: ItineraryItem }) {
  return (
    <li className="flex gap-3 break-words">
      <span aria-hidden className="mt-1.5 shrink-0 text-sm leading-none">
        {itemIcon(item.kind, item.location?.category)}
      </span>
      <span className="min-w-0 flex-1 break-words">
        {item.time && (
          <span className="mr-2 font-mono text-[11px] uppercase tracking-[0.14em] text-stone-500 dark:text-stone-500">
            {item.time}
          </span>
        )}
        <span className="font-medium text-stone-900 dark:text-stone-100">{item.title}</span>
        {item.notes && <span className="text-stone-600 dark:text-stone-400"> — {item.notes}</span>}
        {item.location?.address && (
          <span className="block text-xs text-stone-500 dark:text-stone-500">{item.location.address}</span>
        )}
      </span>
    </li>
  )
}
