import { sx } from '@/styles/merge'
import { tripHero } from './TripHero.stylex'
import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import type { Snapshot } from "./types"
import { daysUntil, formatDate } from "./koreaTheme"
import { SmartEntity } from "./SmartEntity"

interface TripHeroProps {
  snapshot: Snapshot
}

/**
 * Editorial hero — a printed-dossier opening spread rather than a SaaS card.
 *
 * Overdrive moment: on mount, the countdown numeral flips into place one
 * glyph at a time — weighted like a planner being thumbed through — and
 * the rose+amber bloom behind it pulses once and settles. The bloom drifts
 * at ~0.3x scroll speed (parallax, background only) as the user scrolls
 * the day list below.
 */
export function TripHero({ snapshot }: TripHeroProps) {
  const reduce = useReducedMotion()
  const [countdown, setCountdown] = useState(() => daysUntil(snapshot.trip.startDate))
  const heroRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const id = setInterval(() => setCountdown(daysUntil(snapshot.trip.startDate)), 60 * 60 * 1000)
    return () => clearInterval(id)
  }, [snapshot.trip.startDate])

  // Subtle parallax on the rose+amber bloom — background only, never content.
  // Always keep `bloomY` as a MotionValue (don't ternary-swap to a plain `0`
  // when reduce-motion fires) — type-flipping the style prop between renders
  // crashes motion@12 on iOS Safari 26 when the value swaps mid-paint.
  const { scrollY } = useScroll()
  const bloomY = useTransform(scrollY, [0, 600], reduce ? [0, 0] : [0, 180])

  // Intensity is amped when the trip is imminent or in-progress. The
  // bloom-pulse animation only runs once on mount and quickly settles.
  const imminence: "far" | "soon" | "now" =
    countdown > 3 ? "far" : countdown > 0 ? "soon" : "now"

  const numeral =
    countdown > 0 ? String(countdown) : countdown === 0 ? "0" : String(-countdown + 1)
  const numeralLabel =
    countdown > 1
      ? "days to go"
      : countdown === 1
        ? "day to go"
        : countdown === 0
          ? "departing today"
          : "day of twelve · in trip"
  const numeralAria =
    countdown >= 0
      ? `${numeral} ${numeralLabel}`
      : `Day ${numeral} of twelve, currently on the trip`

  const flightIdMatch = snapshot.trip.flights.out.match(/\b[A-Z]{2}\s?\d{1,5}\b/)
  const flightId = flightIdMatch?.[0]

  const bloomKeyframes = reduce
    ? undefined
    : imminence === "now"
      ? { opacity: [0.55, 1, 0.9], scale: [1, 1.06, 1.02] }
      : imminence === "soon"
        ? { opacity: [0.55, 0.95, 0.85], scale: [1, 1.04, 1] }
        : { opacity: [0.55, 0.85, 0.8], scale: [1, 1.02, 1] }

  return (
    <header ref={heroRef} {...sx(tripHero.s87ddcc81)}>
      {/* Rose+amber bloom — quiet glow behind the countdown numeral. Drifts
          at ~0.3x scroll speed (background only, never content). Pulses
          once on mount; intensifies subtly when the trip is imminent. */}
      <motion.div
        aria-hidden
        style={{ y: bloomY }}
        initial={reduce ? false : { opacity: 0.55, scale: 1 }}
        animate={bloomKeyframes}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], times: [0, 0.55, 1] }}
        {...sx(tripHero.s273f80a5)}
      >
        <div {...sx(tripHero.s93a93261)} />
        <div {...sx(tripHero.s780d708a)} />
      </motion.div>

      <DossierGrain />
      <DossierStamp count={countdown} />

      <div {...sx(tripHero.s21739532)}>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          {...sx(tripHero.sdbd983dd)}
        >
          The dossier
          <span aria-hidden {...sx(tripHero.s4c78f04e)}>·</span>
          12 days
          <span aria-hidden {...sx(tripHero.s4c78f04e)}>·</span>
          {formatDate(snapshot.trip.startDate)}
          <span aria-hidden {...sx(tripHero.s34f26488)}>→</span>
          {formatDate(snapshot.trip.endDate)}
        </motion.p>

        <div {...sx(tripHero.sccba503)}>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
          >
            <h1
              {...sx(tripHero.s88fbacff)}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              <span {...sx(tripHero.s18657201)}>
                South Korea
              </span>
              <span {...sx(tripHero.s862a277)}>
                a Seoul &amp; Busan dossier
              </span>
            </h1>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.16 }}
            {...sx(tripHero.s82c9f535)}
          >
            {/* Countdown numeral. Each glyph rotates + rises into place
                with a weighted stagger so the entry reads like flipping
                through a planner. */}
            <span
              aria-label={numeralAria}
              {...sx(tripHero.s87540805)}
              style={{ fontFamily: "'Cormorant Garamond', serif", fontFeatureSettings: '"tnum"' }}
            >
              {Array.from(numeral).map((ch, i) => (
                <motion.span
                  key={`${numeral}-${i}`}
                  aria-hidden
                  initial={reduce ? false : { opacity: 0, rotateX: -75, y: "0.35em" }}
                  animate={{ opacity: 1, rotateX: 0, y: 0 }}
                  transition={{
                    duration: 0.7,
                    ease: [0.16, 1, 0.3, 1],
                    delay: reduce ? 0 : 0.22 + i * 0.12,
                  }}
                  style={{ transformOrigin: "50% 100%", display: "inline-block" }}
                >
                  {ch}
                </motion.span>
              ))}
            </span>
            <span {...sx(tripHero.s4d5117f2)}>
              <span {...sx(tripHero.sf2eba53)} aria-hidden />
              <span {...sx(tripHero.s191ec1bf)}>
                {numeralLabel}
              </span>
            </span>
          </motion.div>
        </div>

        <motion.p
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.26 }}
          {...sx(tripHero.s65e0f2cf)}
        >
          {snapshot.status.headline}
        </motion.p>

        <motion.dl
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.32 }}
          {...sx(tripHero.s39379a3f)}
        >
          <MetaRow label="Flights">
            {flightId ? (
              <>
                <SmartEntity name={flightId} type="flight" />
                <span {...sx(tripHero.sa8c841be)}>
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
                  <span aria-hidden {...sx(tripHero.s7f23fa08)}>→</span>
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
    <div {...sx(tripHero.s3f58665f)}>
      <dt {...sx(tripHero.sa8fa1afe)}>
        {label}
      </dt>
      <dd {...sx(tripHero.metaValue, mono ? tripHero.metaValueMono : undefined)}>
        {children}
      </dd>
    </div>
  )
}

function DossierGrain() {
  return (
    <div
      aria-hidden
      {...sx(tripHero.sf531978b)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.65 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        backgroundSize: "180px 180px",
      }}
    />
  )
}

function DossierStamp({ count: _count }: { count: number }) {
  return (
    <div
      aria-hidden
      {...sx(tripHero.s8b43be86)}
    >
      <svg
        viewBox="0 0 200 200"
        {...sx(tripHero.sb6bfc238)}
        fill="none"
      >
        <defs>
          <path id="dossier-stamp-top" d="M 28,100 A 72,72 0 0 1 172,100" fill="none" />
          <path id="dossier-stamp-bottom" d="M 172,110 A 72,72 0 0 1 28,110" fill="none" />
        </defs>

        <circle cx="100" cy="100" r="88" stroke="currentColor" strokeWidth="2" />
        <circle cx="100" cy="100" r="76" stroke="currentColor" strokeWidth="1" opacity="0.7" />

        <text
          fontFamily="'Cormorant Garamond', serif"
          fontSize="15"
          letterSpacing="3"
          fill="currentColor"
          textAnchor="middle"
        >
          <textPath href="#dossier-stamp-top" startOffset="50%">PRIVATE  DOSSIER</textPath>
        </text>

        <text
          fontFamily="'Cormorant Garamond', serif"
          fontSize="11"
          letterSpacing="4"
          fill="currentColor"
          textAnchor="middle"
        >
          <textPath href="#dossier-stamp-bottom" startOffset="50%">SEOUL · BUSAN</textPath>
        </text>

        <g fill="currentColor" opacity="0.85">
          <circle cx="82" cy="78" r="1.6" />
          <circle cx="100" cy="76" r="2" />
          <circle cx="118" cy="78" r="1.6" />
        </g>

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
