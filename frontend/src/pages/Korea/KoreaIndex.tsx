import { useOutletContext } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import type { LoadState } from "./useKoreaData"
import type { Snapshot } from "./types"
import { TripHero } from "./TripHero"
import { DayCard } from "./DayCard"
import { ReservationCard } from "./ReservationCard"
import { StatusPanel } from "./StatusPanel"

export function KoreaIndex() {
  const state = useOutletContext<LoadState<Snapshot>>()

  if (state.status === "loading") return <KoreaSkeleton />
  if (state.status === "error") return <KoreaError message={state.error.message} />

  const snap = state.data
  const reservationsByDay = (n: number) => snap.reservations.filter((r) => r.dayNumber === n).length

  return (
    <>
      <TripHero snapshot={snap} />

      <StatusPanel status={snap.status} />

      <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <SectionHeading title="📒 Daily itinerary" subtitle="Tap a day for the full plan" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snap.days.map((day, i) => (
            <DayCard key={day.slug} day={day} index={i} reservationsCount={reservationsByDay(day.n)} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <SectionHeading title="📌 Reservations" subtitle="Every time-fixed booking, sorted chronologically" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snap.reservations.map((r, i) => (
            <ReservationCard key={r.id} reservation={r} index={i} />
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <SectionHeading title="🗺️ Neighborhoods" subtitle="Where you'll spend time and why" />
        <NeighborhoodsTable neighborhoods={snap.neighborhoods} />
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
            className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{n.name}</p>
              <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Days {n.days}</p>
            </div>
            <p className="flex-[2] text-sm text-stone-700 dark:text-stone-300">{n.picks}</p>
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
