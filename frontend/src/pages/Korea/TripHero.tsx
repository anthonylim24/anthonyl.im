import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import type { Snapshot } from "./types"
import { daysUntil, formatDate } from "./koreaTheme"

interface TripHeroProps {
  snapshot: Snapshot
}

/**
 * Editorial hero — a printed-dossier opening spread rather than a SaaS card.
 *
 * Type carries the hierarchy: Cormorant headline at its breath-it-in scale,
 * a tabular numeral countdown set big enough to be the day's one vivid
 * moment per viewport, and a thin meta strip that lists trip facts in prose
 * instead of a card grid. The background is a single quiet wash; no
 * drifting blobs or glassmorphic chrome.
 */
export function TripHero({ snapshot }: TripHeroProps) {
  const reduce = useReducedMotion()
  const [countdown, setCountdown] = useState(() => daysUntil(snapshot.trip.startDate))

  useEffect(() => {
    const id = setInterval(() => setCountdown(daysUntil(snapshot.trip.startDate)), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [snapshot.trip.startDate])

  const numeral =
    countdown > 0 ? String(countdown) : countdown === 0 ? "0" : String(-countdown + 1)
  const numeralLabel =
    countdown > 1
      ? "days to go"
      : countdown === 1
        ? "day to go"
        : countdown === 0
          ? "departing today"
          : `of twelve · in trip`
  const numeralAria =
    countdown >= 0
      ? `${numeral} ${numeralLabel}`
      : `Day ${numeral} of twelve, currently on the trip`

  const hotelTrail = snapshot.trip.hotels.map((h) => h.name).join("  →  ")

  return (
    <header className="relative overflow-hidden">
      {/* Single rose wash — no amber, no second radial. The Cormorant
          countdown numeral IS the focal color event; the wash is the
          quiet halo behind it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(244,63,94,0.08),_transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(251,113,133,0.14),_transparent_60%)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20 lg:pb-16 lg:pt-24">
        {/* Eyebrow — Inter all-caps, almost a printer's mark */}
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="font-mono text-[11px] uppercase tracking-[0.32em] text-stone-500 dark:text-stone-400"
        >
          The dossier
          <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">
            ·
          </span>
          12 days
          <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">
            ·
          </span>
          {formatDate(snapshot.trip.startDate)}
          <span aria-hidden className="mx-1.5 text-stone-300 dark:text-stone-700">→</span>
          {formatDate(snapshot.trip.endDate)}
        </motion.p>

        {/* Headline + countdown — paired in a magazine spread. On mobile they
            stack with the numeral leading; on desktop the headline holds the
            left column and the numeral pulls the eye to the right. */}
        <div className="mt-10 grid grid-cols-1 items-end gap-10 sm:mt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
          >
            <h1
              className="font-serif text-stone-900 dark:text-stone-100"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              <span className="block text-[clamp(3.25rem,11vw,7.5rem)] font-medium leading-[0.95] tracking-[-0.02em]">
                South Korea
              </span>
              <span className="mt-2 block text-[clamp(1.5rem,4vw,2.5rem)] italic font-light leading-tight text-stone-500 dark:text-stone-400">
                a Seoul &amp; Busan dossier
              </span>
            </h1>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
            className="flex items-end justify-start gap-5 lg:justify-end"
          >
            {/* Countdown numeral. Designed, not labeled — the digit is
                the focal element. */}
            <span
              aria-label={numeralAria}
              className="font-serif text-[clamp(5rem,18vw,11rem)] font-light leading-[0.85] tracking-[-0.04em] tabular-nums text-rose-600 dark:text-rose-400"
              style={{ fontFamily: "'Cormorant Garamond', serif", fontFeatureSettings: '"tnum"' }}
            >
              {numeral}
            </span>
            <span className="mb-2 inline-flex flex-col gap-1 pb-2 text-left sm:mb-3 sm:pb-3">
              <span className="h-px w-10 bg-rose-400/60 dark:bg-rose-400/50" aria-hidden />
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-700 dark:text-stone-300">
                {numeralLabel}
              </span>
            </span>
          </motion.div>
        </div>

        {/* Status headline (editorial sentence, not a card) */}
        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.22 }}
          className="mt-12 max-w-[60ch] text-base leading-relaxed text-stone-700 sm:text-lg dark:text-stone-300"
        >
          {snapshot.status.headline}
        </motion.p>

        {/* Meta strip — replaces the 2x2 fact card grid with a single
            hairline-separated row that reads like a manifest. Wraps
            gracefully; no nested cards. */}
        <motion.dl
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-stone-800/80"
        >
          <MetaRow label="Flights" value={snapshot.trip.flights.out} />
          <MetaRow label="Anchor" value={snapshot.trip.anchor} />
          <MetaRow label="Hotels" value={hotelTrail} />
          <MetaRow label="Confirmation" value={snapshot.trip.flights.confirmation} mono />
        </motion.dl>
      </div>
    </header>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
        {label}
      </dt>
      <dd
        className={
          "mt-1.5 break-words text-sm leading-snug text-stone-800 dark:text-stone-200 " +
          (mono ? "font-mono text-xs tracking-wide" : "")
        }
      >
        {value}
      </dd>
    </div>
  )
}
