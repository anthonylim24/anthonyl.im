import { lazy, Suspense, useState } from "react"
import { Link, useOutletContext, useParams } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, MapPin, CalendarPlus, Sparkles, Globe2 } from "lucide-react"
import type { LoadState } from "./useKoreaData"
import { useKoreaDay } from "./useKoreaData"
import type { Snapshot } from "./types"
import { ReservationCard } from "./ReservationCard"
import { calloutTone, cityMeta, formatDate } from "./koreaTheme"
import { LinkifiedText } from "./LinkifiedText"
import { mapsSearchUrl, smartPlaceUrl } from "./linkify"
import { buildIcs, downloadIcs, slugify, todayKstIso } from "./koreaUtils"

const MapModeOverlay = lazy(() =>
  import("./MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

export function KoreaDay() {
  const { slug } = useParams<{ slug: string }>()
  const snapshotState = useOutletContext<LoadState<Snapshot>>()
  const dayState = useKoreaDay(slug)
  const reduce = useReducedMotion()
  const [mapModeOpen, setMapModeOpen] = useState(false)

  if (dayState.status === "loading") return <DaySkeleton />
  if (dayState.status === "error") return <DayError message={dayState.error.message} />

  const { day, reservations } = dayState.data
  const tint = cityMeta[day.city] ?? cityMeta.Seoul
  const isToday = day.date === todayKstIso()

  // Prev/next nav from snapshot if available
  const days = snapshotState.status === "success" ? snapshotState.data.days : []
  const idx = days.findIndex((d) => d.slug === day.slug)
  const prev = idx > 0 ? days[idx - 1] : null
  const next = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null

  function exportDayIcs() {
    const ics = buildIcs(reservations, `Day ${day.n} · ${day.title}`)
    downloadIcs(`korea-day-${day.n}-${slugify(day.title)}.ics`, ics)
  }

  return (
    <article>
      <header className={"relative overflow-hidden border-b border-stone-200/60 bg-gradient-to-br dark:border-stone-800/60 " + tint.tint}>
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-stone-600 dark:text-stone-400"
          >
            <span>Day {day.n} of 12</span>
            <span>·</span>
            <span>{formatDate(day.date, { weekday: "long", month: "long", day: "numeric" })}</span>
          </motion.div>

          <div className="mt-3 flex items-start gap-4">
            <motion.span
              aria-hidden
              className="text-5xl sm:text-6xl"
              initial={reduce ? false : { scale: 0.6, rotate: -10, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 14, delay: 0.05 }}
            >
              {day.emoji}
            </motion.span>
            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 26, delay: 0.1 }}
              className="font-serif text-3xl font-medium leading-tight text-stone-900 sm:text-4xl lg:text-5xl dark:text-stone-100"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {day.title}
            </motion.h1>
          </div>

          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="mt-5 flex flex-wrap items-center gap-2"
          >
            {isToday && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
                <Sparkles className="h-3 w-3" aria-hidden /> Today
              </span>
            )}
            <a
              href={mapsSearchUrl(day.city + ", South Korea")}
              target="_blank"
              rel="noreferrer"
              className="max-w-full break-words rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-stone-700 backdrop-blur transition hover:bg-white dark:bg-stone-900/50 dark:text-stone-300 dark:hover:bg-stone-900 [overflow-wrap:anywhere]"
            >
              📍 {day.city}
            </a>
            {day.neighborhoods.map((n) => (
              <a
                key={n}
                href={smartPlaceUrl(n, day.city)}
                target="_blank"
                rel="noreferrer"
                className="max-w-full break-words rounded-full bg-white/60 px-3 py-1 text-xs text-stone-700 backdrop-blur transition hover:bg-white dark:bg-stone-900/40 dark:text-stone-300 dark:hover:bg-stone-900 [overflow-wrap:anywhere]"
              >
                {n}
              </a>
            ))}
            {day.weather && (
              <span className="rounded-full bg-white/70 px-3 py-1 font-mono text-xs text-stone-700 backdrop-blur dark:bg-stone-900/50 dark:text-stone-300">
                ☀️ {day.weather.highC}° / {day.weather.lowC}° · {day.weather.condition}
              </span>
            )}
            <a
              href={mapsSearchUrl(day.hotel + ", South Korea")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 break-words rounded-full bg-white/70 px-3 py-1 text-xs text-stone-700 backdrop-blur transition hover:bg-white dark:bg-stone-900/50 dark:text-stone-300 dark:hover:bg-stone-900 [overflow-wrap:anywhere]"
            >
              <span aria-hidden>🏨</span>
              <span className="min-w-0 break-words">{day.hotel}</span>
              <MapPin className="h-3 w-3 opacity-60" aria-hidden />
            </a>
          </motion.div>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-5 max-w-2xl text-base text-stone-700 dark:text-stone-300"
          >
            <LinkifiedText>{day.theme}</LinkifiedText>
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.32 }}
            className="mt-5"
          >
            <button
              type="button"
              onClick={() => setMapModeOpen(true)}
              className="group inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-rose-200"
            >
              <Globe2 className="h-4 w-4 transition group-hover:rotate-12" aria-hidden />
              Enter Map Mode
            </button>
            <span className="ml-2 align-middle text-[11px] text-stone-500 dark:text-stone-500">
              3D bubble graph of nearby places · SF test mode available
            </span>
          </motion.div>
        </div>
      </header>

      <AnimatePresence>
        {mapModeOpen && (
          <Suspense fallback={null}>
            <MapModeOverlay
              daySlug={day.slug}
              dayTitle={day.title}
              onClose={() => setMapModeOpen(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        {reservations.length > 0 && (
          <section id="reservations" className="mb-10 scroll-mt-20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-xl text-stone-900 dark:text-stone-100" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                📌 Reservations
              </h2>
              <button
                type="button"
                onClick={exportDayIcs}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
              >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                .ics
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {reservations.map((r, i) => (
                <ReservationCard key={r.id} reservation={r} index={i} />
              ))}
            </div>
          </section>
        )}

        {day.sections.length > 3 && (
          <nav
            aria-label="Day section jump"
            className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1 text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {day.sections.map((sec) => (
              <a
                key={sec.heading}
                href={`#${slugify(sec.heading)}`}
                className="shrink-0 rounded-full border border-stone-200 bg-white/70 px-3 py-1 font-medium text-stone-600 backdrop-blur transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400 dark:hover:border-rose-700 dark:hover:text-rose-200"
              >
                {sec.heading}
              </a>
            ))}
          </nav>
        )}

        {day.callouts && day.callouts.length > 0 && (
          <div className="mb-8 space-y-3">
            {day.callouts.map((c, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: reduce ? 0 : i * 0.05 }}
                className={"flex items-start gap-3 rounded-2xl border p-4 text-sm text-stone-800 dark:text-stone-200 " + calloutTone(c.tone)}
              >
                <span aria-hidden className="text-lg leading-none">
                  {c.icon}
                </span>
                <p className="min-w-0 flex-1 break-words">
                  <LinkifiedText>{c.body}</LinkifiedText>
                </p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="space-y-8">
          {day.sections.map((sec, i) => (
            <motion.section
              key={sec.heading}
              id={slugify(sec.heading)}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ type: "spring", stiffness: 280, damping: 26, delay: reduce ? 0 : i * 0.05 }}
              className="scroll-mt-20 rounded-2xl border border-stone-200 bg-white/70 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-900/40 sm:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-base font-semibold text-stone-900 sm:text-lg dark:text-stone-100">{sec.heading}</h3>
                {sec.time && (
                  <span className="shrink-0 font-mono text-xs text-stone-500 dark:text-stone-400">{sec.time}</span>
                )}
              </div>
              <ul className="mt-3 space-y-2 text-sm text-stone-700 dark:text-stone-300">
                {sec.bullets.map((b, j) => (
                  <motion.li
                    key={j}
                    initial={reduce ? false : { opacity: 0, x: -6 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ type: "spring", stiffness: 380, damping: 30, delay: reduce ? 0 : j * 0.025 }}
                    className="flex gap-2 break-words leading-relaxed"
                  >
                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/70" />
                    <span className="min-w-0 flex-1 break-words">
                      <LinkifiedText>{b}</LinkifiedText>
                    </span>
                  </motion.li>
                ))}
              </ul>
            </motion.section>
          ))}
        </div>

        {/* Prev / Next nav: stack vertically on mobile, side-by-side from sm+ */}
        <nav className="mt-10 flex flex-col gap-2 text-sm sm:mt-12 sm:flex-row sm:items-stretch sm:gap-3">
          {prev ? (
            <Link
              to={`/korea/day/${prev.slug}`}
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-stone-200 bg-white/60 p-4 transition hover:border-rose-300 hover:bg-rose-50 dark:border-stone-800 dark:bg-stone-900/40 dark:hover:border-rose-700 dark:hover:bg-rose-950/30"
            >
              <ChevronLeft className="h-5 w-5 shrink-0 text-stone-500 transition group-hover:-translate-x-0.5 group-hover:text-rose-700 dark:group-hover:text-rose-300" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400">
                  Day {prev.n} · {prev.dayOfWeek}
                </p>
                <p className="truncate font-medium text-stone-900 dark:text-stone-100">
                  {prev.emoji} {prev.title}
                </p>
              </div>
            </Link>
          ) : (
            <span className="hidden flex-1 sm:block" />
          )}
          {next ? (
            <Link
              to={`/korea/day/${next.slug}`}
              className="group flex min-w-0 flex-1 items-center justify-end gap-3 rounded-2xl border border-stone-200 bg-white/60 p-4 text-right transition hover:border-rose-300 hover:bg-rose-50 dark:border-stone-800 dark:bg-stone-900/40 dark:hover:border-rose-700 dark:hover:bg-rose-950/30"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400">
                  Day {next.n} · {next.dayOfWeek}
                </p>
                <p className="truncate font-medium text-stone-900 dark:text-stone-100">
                  {next.emoji} {next.title}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-rose-700 dark:group-hover:text-rose-300" />
            </Link>
          ) : (
            <span className="hidden flex-1 sm:block" />
          )}
        </nav>
      </div>
    </article>
  )
}

function DaySkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="h-10 w-2/3 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
      <div className="mt-12 space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-stone-200/60 dark:bg-stone-800/60" />
        ))}
      </div>
    </div>
  )
}

function DayError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h2 className="font-serif text-2xl text-stone-900 dark:text-stone-100">Day not found</h2>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{message}</p>
      <Link
        to="/korea"
        className="mt-4 inline-flex rounded-full bg-stone-900 px-4 py-2 text-sm text-white dark:bg-stone-100 dark:text-stone-900"
      >
        Back to overview
      </Link>
    </div>
  )
}
