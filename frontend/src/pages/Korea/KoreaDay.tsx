import { Link, useOutletContext, useParams } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { LoadState } from "./useKoreaData"
import { useKoreaDay } from "./useKoreaData"
import type { Snapshot } from "./types"
import { ReservationCard } from "./ReservationCard"
import { calloutTone, cityMeta, formatDate } from "./koreaTheme"

export function KoreaDay() {
  const { slug } = useParams<{ slug: string }>()
  const snapshotState = useOutletContext<LoadState<Snapshot>>()
  const dayState = useKoreaDay(slug)
  const reduce = useReducedMotion()

  if (dayState.status === "loading") return <DaySkeleton />
  if (dayState.status === "error") return <DayError message={dayState.error.message} />

  const { day, reservations } = dayState.data
  const tint = cityMeta[day.city] ?? cityMeta.Seoul

  // Prev/next nav from snapshot if available
  const days = snapshotState.status === "success" ? snapshotState.data.days : []
  const idx = days.findIndex((d) => d.slug === day.slug)
  const prev = idx > 0 ? days[idx - 1] : null
  const next = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null

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
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-stone-700 backdrop-blur dark:bg-stone-900/50 dark:text-stone-300">
              📍 {day.city}
            </span>
            {day.neighborhoods.map((n) => (
              <span
                key={n}
                className="rounded-full bg-white/60 px-3 py-1 text-xs text-stone-700 backdrop-blur dark:bg-stone-900/40 dark:text-stone-300"
              >
                {n}
              </span>
            ))}
            {day.weather && (
              <span className="rounded-full bg-white/70 px-3 py-1 font-mono text-xs text-stone-700 backdrop-blur dark:bg-stone-900/50 dark:text-stone-300">
                ☀️ {day.weather.highC}° / {day.weather.lowC}° · {day.weather.condition}
              </span>
            )}
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs text-stone-700 backdrop-blur dark:bg-stone-900/50 dark:text-stone-300">
              🏨 {day.hotel}
            </span>
          </motion.div>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-5 max-w-2xl text-base text-stone-700 dark:text-stone-300"
          >
            {day.theme}
          </motion.p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
        {reservations.length > 0 && (
          <section className="mb-10">
            <h2 className="font-serif text-xl text-stone-900 dark:text-stone-100" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              📌 Reservations
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {reservations.map((r, i) => (
                <ReservationCard key={r.id} reservation={r} index={i} />
              ))}
            </div>
          </section>
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
                <p className="flex-1">{c.body}</p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="space-y-8">
          {day.sections.map((sec, i) => (
            <motion.section
              key={sec.heading}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ type: "spring", stiffness: 280, damping: 26, delay: reduce ? 0 : i * 0.05 }}
              className="rounded-2xl border border-stone-200 bg-white/70 p-5 backdrop-blur dark:border-stone-800 dark:bg-stone-900/40 sm:p-6"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{sec.heading}</h3>
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
                    className="flex gap-2 leading-relaxed"
                  >
                    <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/70" />
                    <span>{b}</span>
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
