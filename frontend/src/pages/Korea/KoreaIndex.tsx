import { sx } from '@/styles/merge'
import { koreaIndex } from './KoreaIndex.stylex'
import { markerStyles } from './korea.stylex'
import { useOutletContext } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight } from "lucide-react"
import type { LoadState } from "./useKoreaData"
import type { Reservation, Snapshot } from "./types"
import { TripHero } from "./TripHero"
import { DayCard } from "./DayCard"
import { StatusPanel } from "./StatusPanel"
import { UpNextCard } from "./UpNextCard"
import { TodayBanner } from "./TodayBanner"
import { LinkifiedText } from "./LinkifiedText"
import { Time } from "./Time"
import { statusMeta, typeMeta } from "./koreaTheme"
import { todayDay } from "./koreaUtils"
import { mapsSearchUrl } from "./linkify"
import { SmartEntity } from "./SmartEntity"
import { reservationEntityType } from "./entityForReservation"

export function KoreaIndex() {
  const state = useOutletContext<LoadState<Snapshot>>()

  if (state.status === "loading") return <KoreaSkeleton />
  if (state.status === "error") return <KoreaError message={state.error.message} />

  const snap = state.data
  const today = todayDay(snap.days)
  const reservationsByDay = (n: number) => snap.reservations.filter((r) => r.dayNumber === n).length

  // Reservations sort chronologically. The snapshot is usually already in
  // order, but defensively sort on date+time so the ledger reads as a
  // schedule no matter how the data lands.
  const reservations = [...snap.reservations].sort((a, b) => {
    const ad = `${a.date} ${a.time ?? "00:00"}`
    const bd = `${b.date} ${b.time ?? "00:00"}`
    return ad.localeCompare(bd)
  })

  return (
    <>
      <TripHero snapshot={snap} />

      {today && <TodayBanner today={today} />}

      <UpNextCard snapshot={snap} />

      <StatusPanel status={snap.status} />

      <SectionShell number="01" eyebrow="The twelve days" title="Daily itinerary" subtitle="Tap a day for the full plan." id="days">
        <div {...sx(koreaIndex.s22079a25)}>
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
      </SectionShell>

      <Fleuron />

      <SectionShell number="02" eyebrow="Every booked moment" title="Reservations" subtitle="Sorted chronologically. Tap a row to open in Maps." id="reservations">
        <ReservationLedger reservations={reservations} />
      </SectionShell>

      <Fleuron />

      <SectionShell number="03" eyebrow="The map, by district" title="Neighborhoods" subtitle="Where you'll spend time, and why." id="neighborhoods">
        <NeighborhoodSpread neighborhoods={snap.neighborhoods} />
      </SectionShell>

      <Fleuron />

      <SectionShell number="04" eyebrow="Base camps" title="Hotels" subtitle="Tap a hotel to open it in Google Maps." id="hotels">
        <HotelLedger hotels={snap.trip.hotels} />
      </SectionShell>

      <Footer generatedAt={snap.generatedAt} />
    </>
  )
}

/**
 * Editorial asterism between section shells. Three Cormorant asterisks
 * centered on a thin hairline rule — the printed-program signal that
 * one chapter has closed and another is about to open. Quiet, but a
 * tactile flourish that hairlines alone don't give you.
 */
function Fleuron() {
  const reduce = useReducedMotion()
  return (
    <motion.div
      aria-hidden
      initial={reduce ? false : { opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      {...sx(koreaIndex.sbd5c649c)}
    >
      <span {...sx(koreaIndex.sfea59be)} />
      <span
        {...sx(koreaIndex.s6878332b)}
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        ·  ·  ·
      </span>
      <span {...sx(koreaIndex.sfea59be)} />
    </motion.div>
  )
}

/**
 * Editorial section shell — every long-form section of the index uses this
 * so the rhythm reads like chapters in a printed program. A small numeral
 * eyebrow + Cormorant title + hairline rule. Replaces the older emoji-
 * prefixed SectionHeading.
 */
function SectionShell({
  number,
  eyebrow,
  title,
  subtitle,
  id,
  children,
}: {
  number: string
  eyebrow: string
  title: string
  subtitle?: string
  id?: string
  children: React.ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <section id={id} {...sx(koreaIndex.s8c311f0a)}>
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        {...sx(koreaIndex.sfeda29b9)}
      >
        <p {...sx(koreaIndex.s6ebd97a0)}>
          <span {...sx(koreaIndex.s1ed0b4fd)}>{number}</span>
          <span aria-hidden {...sx(koreaIndex.sd1fcfbe6)} />
          <span>{eyebrow}</span>
        </p>
        <h2
          {...sx(koreaIndex.s5187ae33)}
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p {...sx(koreaIndex.s20ae058b)}>{subtitle}</p>
        )}
      </motion.header>
      <div {...sx(koreaIndex.s334592)}>{children}</div>
    </section>
  )
}

/**
 * Reservations ledger — replaces the 3-col identical card grid. A single
 * column, hairline-separated, with the time set in tabular numerals on the
 * left and meta on the right. Status reads as a leading colored sigil
 * (●), not a pill, so the eye traces straight down the column.
 */
function ReservationLedger({ reservations }: { reservations: Reservation[] }) {
  const reduce = useReducedMotion()
  if (reservations.length === 0) {
    return (
      <p {...sx(koreaIndex.s8ed8231b)}>
        No reservations booked yet.
      </p>
    )
  }
  return (
    <ol {...sx(koreaIndex.s73622d6a, 'korea-hairline-stack')}>
      {reservations.map((r, i) => (
        <motion.li
          key={r.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : Math.min(i, 8) * 0.025 }}
        >
          <ReservationRow reservation={r} />
        </motion.li>
      ))}
    </ol>
  )
}

function ReservationRow({ reservation: r }: { reservation: Reservation }) {
  const s = statusMeta[r.status]
  const t = typeMeta[r.type]
  const mapHref = r.address ? mapsSearchUrl(r.address) : null
  const dateLabel = formatLedgerDate(r.date)

  const body = (
    <div {...sx(koreaIndex.sa7850081, 'group')}>
      {/* Time column. Day-of-month numeral + month set so the column reads
          like a schedule. Time below in tabular numerals. */}
      <div {...sx(koreaIndex.s40e99da0)}>
        <span
          {...sx(koreaIndex.scde2ca6d)}
          style={{ fontFamily: "'Cormorant Garamond', serif", fontFeatureSettings: '"tnum"' }}
        >
          {dateLabel.day}
        </span>
        <span {...sx(koreaIndex.s90a0ad1a)}>
          {[dateLabel.month, dateLabel.dow].filter(Boolean).join(" · ")}
        </span>
        {r.time && (
          <span {...sx(koreaIndex.se1d59e8f)}>
            <Time value={r.time} />
          </span>
        )}
      </div>

      {/* Title + subtitle + meta. Title in Inter at medium weight so it
          doesn't compete with the day-of-month numeral. Notes/contact
          rendered as a single linkified prose line. */}
      <div {...sx(koreaIndex.s3f58665f)}>
        <div {...sx(koreaIndex.se28e8787)}>
          <span aria-hidden {...sx(koreaIndex.s63da71ee)} title={t.label}>
            {t.icon}
          </span>
          <h3 {...sx(koreaIndex.se4820fdf)}>
            <SmartEntity name={r.title} type={reservationEntityType(r.type)} />
          </h3>
        </div>
        {r.subtitle && (
          <p {...sx(koreaIndex.sde691568)}>
            <LinkifiedText>{r.subtitle}</LinkifiedText>
          </p>
        )}
        {(r.address || r.notes || r.contact) && (
          <p {...sx(koreaIndex.sd9c15ef0)}>
            <LinkifiedText>{[r.address, r.notes, r.contact].filter(Boolean).join(" · ")}</LinkifiedText>
          </p>
        )}
      </div>

      {/* Status + chevron. Sigil at the right edge, status label revealed
          on hover so the schedule scans clean by default. */}
      <div {...sx(koreaIndex.s30efa1a2)}>
        <span aria-label={s.label} title={s.label} {...sx(markerStyles.dotLg, s.dot)} />
        <ArrowUpRight
          aria-hidden
          {...sx(
            koreaIndex.chevron,
            mapHref ? koreaIndex.chevronInteractive : koreaIndex.chevronHidden,
          )}
        />
      </div>
    </div>
  )

  if (mapHref) {
    return (
      <a
        href={mapHref}
        target="_blank"
        rel="noreferrer"
        {...sx(koreaIndex.s350ffaa6)}
        aria-label={`${r.title}: open in Google Maps`}
      >
        {body}
      </a>
    )
  }
  return body
}

function formatLedgerDate(iso: string): { day: string; month: string; dow: string } {
  // Date strings come through as YYYY-MM-DD or full ISO. Parse defensively.
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return { day: "··", month: "", dow: "" }
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    dow: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
  }
}

/**
 * Neighborhoods two-column magazine spread. Name and days range on the left
 * column, picks rendered as inline prose on the right. Replaces the previous
 * narrow-table treatment with something that breathes.
 */
function NeighborhoodSpread({ neighborhoods }: { neighborhoods: Snapshot["neighborhoods"] }) {
  const reduce = useReducedMotion()
  if (neighborhoods.length === 0) {
    return (
      <p {...sx(koreaIndex.s8ed8231b)}>
        Neighborhoods haven't been mapped yet.
      </p>
    )
  }
  return (
    <ul {...sx(koreaIndex.s73622d6a, 'korea-hairline-stack')}>
      {neighborhoods.map((n, i) => (
        <motion.li
          key={n.name}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : Math.min(i, 6) * 0.04 }}
          {...sx(koreaIndex.s764d5095)}
        >
          <div {...sx(koreaIndex.s3f58665f)}>
            <p {...sx(koreaIndex.sa8fa1afe)}>
              Days {n.days}
            </p>
            <h3
              {...sx(koreaIndex.s864175ba)}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              <SmartEntity name={n.name} type="neighborhood" />
            </h3>
          </div>
          <p {...sx(koreaIndex.s33c85447)}>
            <LinkifiedText>{n.picks}</LinkifiedText>
          </p>
        </motion.li>
      ))}
    </ul>
  )
}

/**
 * Hotels — replaces the glass-card grid with a hairline-separated listing.
 * Hover affordance is the chevron, not a flooded background tint.
 */
function HotelLedger({ hotels }: { hotels: Snapshot["trip"]["hotels"] }) {
  const reduce = useReducedMotion()
  if (hotels.length === 0) {
    return (
      <p {...sx(koreaIndex.s8ed8231b)}>
        No hotels booked yet.
      </p>
    )
  }
  return (
    <ul {...sx(koreaIndex.s73622d6a, 'korea-hairline-stack')}>
      {hotels.map((h, i) => (
        <motion.li
          key={h.name}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-30px" }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : i * 0.04 }}
          {...sx(koreaIndex.s9c63c690)}
        >
          <div {...sx(koreaIndex.se30fd43e)}>
            <p {...sx(koreaIndex.sa8fa1afe)}>
              {h.nights}
            </p>
            <p
              {...sx(koreaIndex.s9c578891)}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              <SmartEntity name={h.name} type="hotel" />
            </p>
          </div>
        </motion.li>
      ))}
    </ul>
  )
}

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <footer {...sx(koreaIndex.s6db3b158)}>
      <div {...sx(koreaIndex.saf2e1918)}>
        <p {...sx(koreaIndex.s84bb96bf)}>
          Snapshot
          <span aria-hidden {...sx(koreaIndex.s4c78f04e)}>·</span>
          {new Date(generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
        </p>
        <p {...sx(koreaIndex.sc5c84777)}>
          Live from Notion when configured. Built with React, Motion, and Tailwind.
        </p>
      </div>
    </footer>
  )
}

function KoreaSkeleton() {
  return (
    <div {...sx(koreaIndex.sa9408a46)}>
      <div {...sx(koreaIndex.s84492ccd, 'animate-pulse')} />
      <div {...sx(koreaIndex.s83e553f7, 'animate-pulse')} />
      <div {...sx(koreaIndex.s295e0f16, 'animate-pulse')} />
      <div {...sx(koreaIndex.s733a569a)}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} {...sx(koreaIndex.s12c4b6fd, 'animate-pulse')} />
        ))}
      </div>
    </div>
  )
}

function KoreaError({ message }: { message: string }) {
  return (
    <div {...sx(koreaIndex.sa9408a46)}>
      <p {...sx(koreaIndex.sd3c7a9db)}>
        Couldn't load the itinerary
      </p>
      <h1
        {...sx(koreaIndex.s617533bf)}
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        The itinerary did not load.
      </h1>
      <p {...sx(koreaIndex.s3ff785d8)}>{message}</p>
      <button
        type="button"
        onClick={() => location.reload()}
        {...sx(koreaIndex.s64227cd)}
      >
        Retry
      </button>
    </div>
  )
}
