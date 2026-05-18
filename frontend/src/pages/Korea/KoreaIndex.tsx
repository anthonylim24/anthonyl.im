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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      <SectionShell number="02" eyebrow="Every booked moment" title="Reservations" subtitle="Sorted chronologically. Tap a row to open in Maps." id="reservations">
        <ReservationLedger reservations={reservations} />
      </SectionShell>

      <SectionShell number="03" eyebrow="The map, by district" title="Neighborhoods" subtitle="Where you'll spend time, and why." id="neighborhoods">
        <NeighborhoodSpread neighborhoods={snap.neighborhoods} />
      </SectionShell>

      <SectionShell number="04" eyebrow="Base camps" title="Hotels" subtitle="Tap a hotel to open it in Google Maps." id="hotels">
        <HotelLedger hotels={snap.trip.hotels} />
      </SectionShell>

      <Footer generatedAt={snap.generatedAt} />
    </>
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
    <section id={id} className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="border-b border-stone-200/80 pb-5 dark:border-stone-800/80"
      >
        <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
          <span className="tabular-nums text-rose-600 dark:text-rose-400">{number}</span>
          <span aria-hidden className="h-px w-10 bg-stone-300 dark:bg-stone-700" />
          <span>{eyebrow}</span>
        </p>
        <h2
          className="mt-3 font-serif text-[clamp(2rem,5.4vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 max-w-[58ch] text-sm text-stone-600 dark:text-stone-400">{subtitle}</p>
        )}
      </motion.header>
      <div className="mt-8">{children}</div>
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
  return (
    <ol className="-mt-2 divide-y divide-stone-200/80 dark:divide-stone-800/80">
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
    <div className="group grid grid-cols-[max-content_1fr_max-content] items-baseline gap-x-5 gap-y-2 py-5 sm:gap-x-7 sm:py-6">
      {/* Time column. Day-of-month numeral + month set so the column reads
          like a schedule. Time below in tabular numerals. */}
      <div className="flex w-[5.5rem] flex-col sm:w-[7rem]">
        <span
          className="font-serif text-2xl font-medium leading-none tabular-nums text-stone-900 sm:text-3xl dark:text-stone-100"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontFeatureSettings: '"tnum"' }}
        >
          {dateLabel.day}
        </span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
          {dateLabel.month} · {dateLabel.dow}
        </span>
        {r.time && (
          <span className="mt-2.5 font-mono text-[11px] tabular-nums text-stone-700 dark:text-stone-300">
            <Time value={r.time} />
          </span>
        )}
      </div>

      {/* Title + subtitle + meta. Title in Inter at medium weight so it
          doesn't compete with the day-of-month numeral. Notes/contact
          rendered as a single linkified prose line. */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span aria-hidden className="text-base leading-none" title={t.label}>
            {t.icon}
          </span>
          <h3 className="break-words text-[15px] font-semibold leading-snug text-stone-900 sm:text-base dark:text-stone-100">
            {r.title}
          </h3>
        </div>
        {r.subtitle && (
          <p className="mt-1 break-words text-[13px] leading-snug text-stone-600 dark:text-stone-400">
            <LinkifiedText>{r.subtitle}</LinkifiedText>
          </p>
        )}
        {(r.address || r.notes || r.contact) && (
          <p className="mt-1.5 break-words text-[12px] leading-relaxed text-stone-500 dark:text-stone-500">
            <LinkifiedText>{[r.address, r.notes, r.contact].filter(Boolean).join(" · ")}</LinkifiedText>
          </p>
        )}
      </div>

      {/* Status + chevron. Sigil at the right edge, status label revealed
          on hover so the schedule scans clean by default. */}
      <div className="flex items-center gap-2 self-center text-right">
        <span aria-label={s.label} title={s.label} className={"inline-block h-2 w-2 rounded-full " + s.dot} />
        <ArrowUpRight
          aria-hidden
          className={
            "h-4 w-4 shrink-0 text-stone-300 transition-all duration-200 dark:text-stone-700 " +
            (mapHref ? "group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-rose-500 dark:group-hover:text-rose-400" : "opacity-0")
          }
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
        className="-mx-2 block rounded-2xl px-2 outline-none transition-colors hover:bg-stone-100/60 focus-visible:ring-2 focus-visible:ring-rose-500/40 dark:hover:bg-stone-900/40"
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
  return (
    <ul className="-mt-2 divide-y divide-stone-200/80 dark:divide-stone-800/80">
      {neighborhoods.map((n, i) => (
        <motion.li
          key={n.name}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : Math.min(i, 6) * 0.04 }}
          className="grid gap-x-10 gap-y-3 py-7 sm:py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]"
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
              Days {n.days}
            </p>
            <h3
              className="mt-1.5 font-serif text-2xl font-medium leading-tight tracking-[-0.01em] text-stone-900 sm:text-3xl dark:text-stone-100"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              <a
                href={mapsSearchUrl(n.name + ", South Korea")}
                target="_blank"
                rel="noreferrer"
                className="transition-colors duration-200 hover:text-rose-700 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-500/50 dark:hover:text-rose-300"
              >
                {n.name}
              </a>
            </h3>
          </div>
          <p className="min-w-0 max-w-[65ch] break-words text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
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
  return (
    <ul className="-mt-2 divide-y divide-stone-200/80 dark:divide-stone-800/80">
      {hotels.map((h, i) => (
        <motion.li
          key={h.name}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-30px" }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : i * 0.04 }}
        >
          <a
            href={mapsSearchUrl(h.name + ", South Korea")}
            target="_blank"
            rel="noreferrer"
            className="group -mx-2 flex items-center justify-between gap-6 rounded-2xl px-2 py-5 outline-none transition-colors hover:bg-stone-100/60 focus-visible:ring-2 focus-visible:ring-rose-500/40 sm:py-6 dark:hover:bg-stone-900/40"
          >
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
                {h.nights}
              </p>
              <p
                className="mt-1.5 break-words font-serif text-xl font-medium leading-snug tracking-[-0.01em] text-stone-900 sm:text-2xl dark:text-stone-100"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {h.name}
              </p>
            </div>
            <ArrowUpRight
              aria-hidden
              className="h-5 w-5 shrink-0 text-stone-300 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-rose-500 dark:text-stone-700 dark:group-hover:text-rose-400"
            />
          </a>
        </motion.li>
      ))}
    </ul>
  )
}

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className="mx-auto mt-24 max-w-6xl px-4 pb-12 sm:px-6">
      <div className="border-t border-stone-200/80 pt-6 dark:border-stone-800/80">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
          Snapshot
          <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">·</span>
          {new Date(generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
        </p>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-500">
          Live from Notion when configured. Built with React, Motion, and Tailwind.
        </p>
      </div>
    </footer>
  )
}

function KoreaSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="h-3 w-32 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      <div className="mt-8 h-24 w-3/4 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
      <div className="mt-3 h-8 w-1/2 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
      <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-3xl bg-stone-200/60 dark:bg-stone-800/60" />
        ))}
      </div>
    </div>
  )
}

function KoreaError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-rose-600 dark:text-rose-400">
        Couldn't load the itinerary
      </p>
      <h2
        className="mt-3 font-serif text-3xl font-medium leading-tight text-stone-900 dark:text-stone-100"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        Something went sideways.
      </h2>
      <p className="mt-2 max-w-prose text-sm text-stone-600 dark:text-stone-400">{message}</p>
      <button
        type="button"
        onClick={() => location.reload()}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        Retry
      </button>
    </div>
  )
}
