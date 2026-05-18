import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import type { Snapshot } from "./types"
import { daysUntil, formatDate } from "./koreaTheme"
import { SmartEntity } from "./SmartEntity"

interface TripHeroProps {
  snapshot: Snapshot
}

/**
 * Editorial hero — a printed-dossier opening spread rather than a SaaS card.
 *
 * Type carries the hierarchy: Cormorant headline at its breath-it-in scale,
 * a tabular numeral countdown set big enough to be the day's one vivid
 * moment per viewport, and a thin meta strip that lists trip facts in prose
 * instead of a card grid. The background is a single quiet rose wash; a
 * subtle SVG paper grain overlays everything for tactile dossier feel; a
 * rotated rose wax-seal stamp sits at the corner like a real chop on a
 * private file.
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

  // First flight identifier in the "out" string ("UA 893" etc) — first
  // 2-letter + digits match wins. Used as the SmartEntity name so the
  // popover hits FlightAware with the right ID.
  const flightIdMatch = snapshot.trip.flights.out.match(/\b[A-Z]{2}\s?\d{1,5}\b/)
  const flightId = flightIdMatch?.[0]

  return (
    <header className="relative overflow-hidden">
      {/* Rose halo — quiet glow behind the countdown numeral */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(244,63,94,0.08),_transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top_right,_rgba(251,113,133,0.14),_transparent_60%)]"
      />
      {/* Paper grain — SVG fractalNoise rendered as a data-URI background.
          Sells the "printed dossier" feel without raster weight. Uses
          multiply blend on light, screen blend on dark. Very low alpha
          so it never dominates the type. */}
      <DossierGrain />

      {/* Wax seal — rotated SVG stamp in the top-right corner. The single
          deep-rose moment that signals this is a private file, not a
          travel-tool dashboard. Hidden on the smallest viewports so it
          doesn't crowd the headline. */}
      <DossierStamp count={countdown} />

      <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20 lg:pb-16 lg:pt-24">
        {/* Eyebrow — Inter all-caps, almost a printer's mark */}
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="font-mono text-[11px] uppercase tracking-[0.32em] text-stone-500 dark:text-stone-400"
        >
          The dossier
          <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">·</span>
          12 days
          <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">·</span>
          {formatDate(snapshot.trip.startDate)}
          <span aria-hidden className="mx-1.5 text-stone-300 dark:text-stone-700">→</span>
          {formatDate(snapshot.trip.endDate)}
        </motion.p>

        {/* Headline + countdown — paired in a magazine spread. On mobile they
            stack with the headline leading; on desktop the headline holds the
            left column and the numeral pulls the eye to the right. */}
        <div className="mt-10 grid grid-cols-1 items-end gap-10 sm:mt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
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
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.16 }}
            className="flex items-end justify-start gap-5 lg:justify-end"
          >
            {/* Countdown numeral. Designed, not labeled — the digit is
                the focal element. Bumped from 18vw to 22vw for more
                committed scale at desktop widths. */}
            <span
              aria-label={numeralAria}
              className="font-serif text-[clamp(5rem,22vw,14rem)] font-light leading-[0.82] tracking-[-0.05em] tabular-nums text-rose-600 dark:text-rose-400"
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
          transition={{ duration: 0.5, delay: 0.26 }}
          className="mt-12 max-w-[60ch] text-base leading-relaxed text-stone-700 sm:text-lg dark:text-stone-300"
        >
          {snapshot.status.headline}
        </motion.p>

        {/* Meta strip — replaces the 2x2 fact card grid with a single
            hairline-separated row that reads like a manifest. */}
        <motion.dl
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.32 }}
          className="mt-10 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-6 sm:grid-cols-2 lg:grid-cols-4 dark:border-stone-800/80"
        >
          <MetaRow label="Flights">
            {flightId ? (
              <>
                <SmartEntity name={flightId} type="flight" />
                <span className="text-stone-500 dark:text-stone-500">
                  {snapshot.trip.flights.out.replace(flightId, "").trim()}
                </span>
              </>
            ) : (
              snapshot.trip.flights.out
            )}
          </MetaRow>
          <MetaRow label="Anchor">{snapshot.trip.anchor}</MetaRow>
          <MetaRow label="Hotels">
            {snapshot.trip.hotels.map((h, i) => (
              <span key={h.name}>
                {i > 0 && (
                  <span aria-hidden className="mx-1.5 text-stone-400 dark:text-stone-600">→</span>
                )}
                <SmartEntity name={h.name} type="hotel" />
              </span>
            ))}
          </MetaRow>
          <MetaRow label="Confirmation" mono>
            {snapshot.trip.flights.confirmation}
          </MetaRow>
        </motion.dl>
      </div>
    </header>
  )
}

function MetaRow({
  label,
  children,
  mono,
}: {
  label: string
  children: React.ReactNode
  mono?: boolean
}) {
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
        {children}
      </dd>
    </div>
  )
}

/**
 * SVG fractal-noise paper grain. Subtle texture overlay that sells the
 * "printed dossier" feel without raster weight. The pattern is encoded
 * as a data URI so we ship zero extra requests; opacity is intentionally
 * low so the grain never overpowers the type.
 */
function DossierGrain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 mix-blend-multiply opacity-[0.05] dark:mix-blend-screen dark:opacity-[0.07]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.65 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        backgroundSize: "180px 180px",
      }}
    />
  )
}

/**
 * Rotated SVG wax-seal stamp. The single deep-rose color moment in the
 * hero — a chop mark on a private file. Double-ring border, curved
 * label text on the top arc, "MMXXVI" on the bottom arc, and a
 * decorative ampersand at center as the focal glyph.
 *
 * Slightly rotated for a hand-stamped feel. Hidden on the smallest
 * viewports so it doesn't crowd the headline.
 */
function DossierStamp({ count: _count }: { count: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-6 top-8 hidden -rotate-[8deg] sm:right-10 sm:top-12 sm:block lg:right-16 lg:top-16"
    >
      <svg
        viewBox="0 0 200 200"
        className="h-24 w-24 text-rose-700/70 sm:h-28 sm:w-28 lg:h-32 lg:w-32 dark:text-rose-400/65"
        fill="none"
      >
        <defs>
          {/* Top arc — text rides above the center, reading L→R */}
          <path id="dossier-stamp-top" d="M 28,100 A 72,72 0 0 1 172,100" fill="none" />
          {/* Bottom arc — drawn so the text below reads L→R upright */}
          <path id="dossier-stamp-bottom" d="M 172,110 A 72,72 0 0 1 28,110" fill="none" />
        </defs>

        {/* Double-ring stamp border */}
        <circle cx="100" cy="100" r="88" stroke="currentColor" strokeWidth="2" />
        <circle cx="100" cy="100" r="76" stroke="currentColor" strokeWidth="1" opacity="0.7" />

        {/* Top label */}
        <text
          fontFamily="'Cormorant Garamond', serif"
          fontSize="15"
          letterSpacing="3"
          fill="currentColor"
          textAnchor="middle"
        >
          <textPath href="#dossier-stamp-top" startOffset="50%">PRIVATE  DOSSIER</textPath>
        </text>

        {/* Bottom label */}
        <text
          fontFamily="'Cormorant Garamond', serif"
          fontSize="11"
          letterSpacing="4"
          fill="currentColor"
          textAnchor="middle"
        >
          <textPath href="#dossier-stamp-bottom" startOffset="50%">SEOUL · BUSAN</textPath>
        </text>

        {/* Inner ornaments — three tiny stars in a row sit above the
            centerpiece, like a wax-seal motif */}
        <g fill="currentColor" opacity="0.85">
          <circle cx="82" cy="78" r="1.6" />
          <circle cx="100" cy="76" r="2" />
          <circle cx="118" cy="78" r="1.6" />
        </g>

        {/* Centerpiece — italic Cormorant ampersand, the most editorial
            character in the type's repertoire */}
        <text
          x="100"
          y="118"
          textAnchor="middle"
          fontFamily="'Cormorant Garamond', serif"
          fontSize="52"
          fontStyle="italic"
          fontWeight="500"
          fill="currentColor"
        >
          &amp;
        </text>

        {/* Lower mark — date in roman numerals */}
        <text
          x="100"
          y="138"
          textAnchor="middle"
          fontFamily="'Cormorant Garamond', serif"
          fontSize="11"
          letterSpacing="3"
          fill="currentColor"
        >
          MMXXVI
        </text>
      </svg>
    </div>
  )
}
