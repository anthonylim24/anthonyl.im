import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import type { Snapshot } from "./types"
import { daysUntil, formatDate } from "./koreaTheme"

interface TripHeroProps {
  snapshot: Snapshot
}

export function TripHero({ snapshot }: TripHeroProps) {
  const reduce = useReducedMotion()
  const [countdown, setCountdown] = useState(() => daysUntil(snapshot.trip.startDate))

  useEffect(() => {
    const id = setInterval(() => setCountdown(daysUntil(snapshot.trip.startDate)), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [snapshot.trip.startDate])

  const countdownLabel =
    countdown > 1 ? `${countdown} days to go` : countdown === 1 ? "Tomorrow!" : countdown === 0 ? "Today!" : `Day ${-countdown + 1} of the trip`

  return (
    <header className="relative overflow-hidden border-b border-stone-200/60 dark:border-stone-800/60">
      {/* Decorative animated blobs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-rose-300/30 blur-3xl dark:bg-rose-900/20"
        animate={reduce ? undefined : { x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-900/15"
        animate={reduce ? undefined : { x: [0, -25, 0], y: [0, -15, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
            12-day trip · {formatDate(snapshot.trip.startDate)} → {formatDate(snapshot.trip.endDate)}
          </p>
        </motion.div>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 24, delay: reduce ? 0 : 0.08 }}
          className="mt-3 font-serif text-4xl font-medium leading-tight text-stone-900 sm:text-5xl lg:text-6xl dark:text-stone-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          <span className="block">South Korea</span>
          <span className="block text-stone-500 dark:text-stone-400">Seoul · Busan</span>
        </motion.h1>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16 }}
          className="mt-6 flex flex-wrap items-center gap-3"
        >
          <motion.span
            animate={
              reduce
                ? undefined
                : {
                    scale: [1, 1.04, 1],
                  }
            }
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex items-center gap-2 rounded-full border border-rose-300/60 bg-rose-100/70 px-4 py-1.5 text-sm font-medium text-rose-900 shadow-sm dark:border-rose-700/40 dark:bg-rose-950/40 dark:text-rose-100"
          >
            <span aria-hidden>⏳</span>
            {countdownLabel}
          </motion.span>
          <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300">
            T-{snapshot.status.tMinus} status · {snapshot.status.asOf}
          </span>
        </motion.div>

        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.24 }}
          className="mt-6 max-w-2xl text-base text-stone-700 dark:text-stone-300"
        >
          {snapshot.status.headline}
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.32 }}
          className="mt-6 grid gap-2 text-sm sm:mt-8 sm:grid-cols-2 sm:gap-2.5"
        >
          <FactRow icon="✈️" label="Flights" value={snapshot.trip.flights.out} />
          <FactRow icon="💒" label="Anchor" value={snapshot.trip.anchor} />
          <FactRow icon="🏨" label="Hotels" value={snapshot.trip.hotels.map((h) => h.name).join(" → ")} />
          <FactRow icon="🪪" label="Conf" value={snapshot.trip.flights.confirmation} mono />
        </motion.div>
      </div>
    </header>
  )
}

function FactRow({ icon, label, value, mono }: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-white/60 px-3 py-2 backdrop-blur dark:bg-stone-900/40">
      <span aria-hidden className="text-base leading-snug">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</p>
        <p
          className={
            "break-words leading-snug text-stone-800 dark:text-stone-200 " +
            (mono ? "font-mono text-xs" : "text-xs")
          }
        >
          {value}
        </p>
      </div>
    </div>
  )
}
