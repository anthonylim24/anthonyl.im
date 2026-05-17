import { useOutletContext } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { CalendarPlus, Sparkles } from "lucide-react"
import type { LoadState } from "./useKoreaData"
import type { Snapshot } from "./types"
import { TripHero } from "./TripHero"
import { DayCard } from "./DayCard"
import { ReservationCard } from "./ReservationCard"
import { StatusPanel } from "./StatusPanel"
import { UpNextCard } from "./UpNextCard"
import { TodayBanner } from "./TodayBanner"
import { LinkifiedText } from "./LinkifiedText"
import { buildIcs, downloadIcs, todayDay } from "./koreaUtils"
import { mapsSearchUrl } from "./linkify"

export function KoreaIndex() {
  const state = useOutletContext<LoadState<Snapshot>>()

  if (state.status === "loading") return <KoreaSkeleton />
  if (state.status === "error") return <KoreaError message={state.error.message} />

  const snap = state.data
  const today = todayDay(snap.days)
  const reservationsByDay = (n: number) => snap.reservations.filter((r) => r.dayNumber === n).length

  function exportFullTrip() {
    const ics = buildIcs(snap.reservations, "South Korea Trip")
    downloadIcs("korea-trip.ics", ics)
  }

  return (
    <>
      <TripHero snapshot={snap} />

      {today && <TodayBanner today={today} />}

      <UpNextCard snapshot={snap} />

      <StatusPanel status={snap.status} />

      <section id="days" className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <SectionHeading title="📒 Daily itinerary" subtitle="Tap a day for the full plan" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snap.days.map((day, i) => (
            <DayCard
              key={day.slug}
              day={day}
              index={i}
              reservationsCount={reservationsByDay(day.n)}
              isToday={today?.slug === day.slug}
            />
          ))}
        </div>
      </section>

      <section id="reservations" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading title="📌 Reservations" subtitle="Every time-fixed booking, sorted chronologically" />
          <button
            type="button"
            onClick={exportFullTrip}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
          >
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
            Download .ics
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snap.reservations.map((r, i) => (
            <ReservationCard key={r.id} reservation={r} index={i} />
          ))}
        </div>
      </section>

      <section id="neighborhoods" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <SectionHeading title="🗺️ Neighborhoods" subtitle="Where you'll spend time and why" />
        <NeighborhoodsTable neighborhoods={snap.neighborhoods} />
      </section>

      <section id="hotels" className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <SectionHeading title="🏨 Hotels" subtitle="Tap a hotel to open it in Google Maps" />
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {snap.trip.hotels.map((h, i) => (
            <motion.li
              key={h.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ type: "spring", stiffness: 380, damping: 28, delay: i * 0.05 }}
            >
              <a
                href={mapsSearchUrl(h.name + ", South Korea")}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 rounded-2xl border border-stone-200 bg-white/70 p-4 backdrop-blur transition hover:border-rose-300 hover:bg-rose-50 dark:border-stone-800 dark:bg-stone-900/40 dark:hover:border-rose-700 dark:hover:bg-rose-950/30"
              >
                <span aria-hidden className="text-2xl">🏨</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{h.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{h.nights}</p>
                </div>
                <Sparkles className="h-4 w-4 shrink-0 text-stone-400 transition group-hover:text-rose-500" aria-hidden />
              </a>
            </motion.li>
          ))}
        </ul>
      </section>

      <Footer generatedAt={snap.generatedAt} />
    </>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4 }}
    >
      <h2
        className="font-serif text-2xl text-stone-900 sm:text-3xl dark:text-stone-100"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{subtitle}</p>}
    </motion.div>
  )
}

function NeighborhoodsTable({ neighborhoods }: { neighborhoods: Snapshot["neighborhoods"] }) {
  const reduce = useReducedMotion()
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white/70 backdrop-blur dark:border-stone-800 dark:bg-stone-900/40">
      <ul className="divide-y divide-stone-200 dark:divide-stone-800">
        {neighborhoods.map((n, i) => (
          <motion.li
            key={n.name}
            initial={reduce ? false : { opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ type: "spring", stiffness: 360, damping: 28, delay: reduce ? 0 : i * 0.03 }}
            className="flex flex-col gap-1 px-4 py-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                <a
                  href={mapsSearchUrl(n.name + ", South Korea")}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {n.name}
                </a>
              </p>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Days {n.days}</p>
            </div>
            <p className="min-w-0 flex-[2] break-words text-sm text-stone-700 dark:text-stone-300">
              <LinkifiedText>{n.picks}</LinkifiedText>
            </p>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className="mx-auto mt-16 max-w-6xl px-4 pb-8 text-xs text-stone-500 sm:px-6 dark:text-stone-500">
      <p>
        Data snapshot generated {new Date(generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })} · pulls
        live from Notion when configured · made with React, Motion, Tailwind.
      </p>
    </footer>
  )
}

function KoreaSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="h-12 w-3/4 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
      <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-3xl bg-stone-200/60 dark:bg-stone-800/60" />
        ))}
      </div>
    </div>
  )
}

function KoreaError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="font-serif text-2xl text-stone-900 dark:text-stone-100">Couldn't load the itinerary</h2>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{message}</p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="mt-4 rounded-full bg-stone-900 px-4 py-2 text-sm text-white dark:bg-stone-100 dark:text-stone-900"
      >
        Retry
      </button>
    </div>
  )
}
