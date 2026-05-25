import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Globe2, MapPin } from "lucide-react"
import { IgIcon } from "./IgIcon"
import type { LoadState } from "./useKoreaData"
import { useKoreaDay } from "./useKoreaData"
import type { Reservation, Snapshot } from "./types"
import { ReservationCard } from "./ReservationCard"
import { calloutTone, cityMeta, formatDate } from "./koreaTheme"
import { LinkifiedText } from "./LinkifiedText"
import { makeKstDate, slugify, todayKstIso } from "./koreaUtils"
import { SmartEntity } from "./SmartEntity"
import { useScrollReveal, REVEAL_CLASSES } from "./_motion/scrollReveal"
import { clerkEnabled, useGetToken } from "@/lib/safeAuth"
import type { IgSave } from "./mapModeTypes"

const MapModeOverlay = lazy(() =>
  import("./MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

/** Fetches IG saves for this day from the same /api/korea/day/:slug/places endpoint. */
function useDayIgSaves(slug: string | undefined): IgSave[] {
  const getToken = useGetToken()
  const [igSaves, setIgSaves] = useState<IgSave[]>([])

  useEffect(() => {
    if (!slug || !clerkEnabled) return
    let cancelled = false
    void (async () => {
      try {
        const token = await getToken()
        if (!token) return
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
        const r = await fetch(`/api/korea/day/${encodeURIComponent(slug)}/places`, { headers })
        if (!r.ok || cancelled) return
        const data = await r.json() as { igSaves?: IgSave[] }
        if (!cancelled) setIgSaves(data.igSaves ?? [])
      } catch {
        // Non-fatal — day page works without IG saves
      }
    })()
    return () => { cancelled = true }
  }, [slug, getToken])

  return igSaves
}

export function KoreaDay() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const snapshotState = useOutletContext<LoadState<Snapshot>>()
  const dayState = useKoreaDay(slug)
  const reduce = useReducedMotion()
  const [mapModeOpen, setMapModeOpen] = useState(false)
  // Place id Map Mode should auto-focus on when next opened. Set by
  // clicking an Instagram save card; cleared on close.
  const [mapModeFocusId, setMapModeFocusId] = useState<string | undefined>(undefined)
  const igSaves = useDayIgSaves(slug)

  // Derive prev/next early so the keyboard handler in useEffect has access to
  // them, regardless of whether dayState has loaded yet (early returns happen
  // after the effect declaration).
  const days = snapshotState.status === "success" ? snapshotState.data.days : []
  const idx = days.findIndex((d) => d.slug === slug)
  const prev = idx > 0 ? days[idx - 1] : null
  const next = idx >= 0 && idx < days.length - 1 ? days[idx + 1] : null

  // Reservations for the current day; computed here so the memo below
  // stays unconditional (called whether dayState has loaded or not).
  const dayData = dayState.status === "success" ? dayState.data : null
  const reservationsForDay: Reservation[] = useMemo(
    () => dayData?.reservations ?? [],
    [dayData],
  )
  const isTodayFlag = dayData ? dayData.day.date === todayKstIso() : false

  // Identify the next-upcoming reservation today. This drives the ambient
  // amber rim-glow on its card.
  const nextResId = useMemo(
    () => nextUpcomingReservationId(reservationsForDay, isTodayFlag),
    [reservationsForDay, isTodayFlag],
  )

  // Scroll to top whenever the viewed day changes so the new day's header is
  // immediately visible and doesn't inherit the previous day's scroll position.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [slug])

  // Keyboard arrow navigation between days. Suppressed when Map Mode is open
  // (handled by overlay) or when focus is inside an input/textarea.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mapModeOpen) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return
      if (e.key === "ArrowLeft" && prev) {
        navigate(`/korea/day/${prev.slug}`)
      } else if (e.key === "ArrowRight" && next) {
        navigate(`/korea/day/${next.slug}`)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [prev, next, navigate, mapModeOpen])

  if (dayState.status === "loading") return <DaySkeleton />
  if (dayState.status === "error") return <DayError message={dayState.error.message} />

  const { day, reservations } = dayState.data
  const cityTag = cityMeta[day.city]?.tag ?? day.city.slice(0, 2).toUpperCase()
  const isToday = day.date === todayKstIso()

  // Day progress (0–1) for the "today line" on the timeline. Computed
  // once per render; the UI doesn't re-tick the rail every second.
  const dayProgress = isToday ? kstDayProgress() : null

  return (
    <article>
      {/* Header — no city-tinted gradient. Plain warm canvas; the city
          shows up as a typographic tag in the eyebrow row. */}
      <header className="relative border-b border-stone-200/80 dark:border-stone-800/80">
        <div className="mx-auto max-w-4xl px-4 pb-10 pt-12 sm:px-6 sm:pb-12 sm:pt-16">
          {/* Eyebrow */}
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500"
          >
            <span className="text-stone-700 dark:text-stone-300">{cityTag}</span>
            <span aria-hidden className="h-px w-8 bg-stone-300 dark:bg-stone-700" />
            <span>Day {String(day.n).padStart(2, "0")} of 12</span>
            <span aria-hidden className="text-stone-300 dark:text-stone-700">·</span>
            <span>{formatDate(day.date, { weekday: "long", month: "long", day: "numeric" })}</span>
            {isToday && (
              <>
                <span aria-hidden className="text-stone-300 dark:text-stone-700">·</span>
                <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-rose-500 dark:bg-rose-400" />
                  Today
                </span>
              </>
            )}
          </motion.p>

          {/* Headline: oversized day numeral that strokes in on mount,
              followed by the emoji + Cormorant title. The numeral is the
              one vivid moment in the header — the day announces itself. */}
          <div className="mt-6 flex items-start gap-5 sm:gap-7">
            <DayNumeralMark n={day.n} reduce={!!reduce} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <span aria-hidden className="text-4xl leading-none sm:text-5xl">
                  {day.emoji}
                </span>
                <motion.h1
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                  className="min-w-0 break-words font-serif text-[clamp(2.25rem,6vw,4rem)] font-medium leading-[1.02] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {day.title}
                </motion.h1>
              </div>
            </div>
          </div>

          {/* Theme paragraph */}
          <motion.p
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-6 max-w-[60ch] text-base leading-relaxed text-stone-700 dark:text-stone-300"
          >
            <LinkifiedText>{day.theme}</LinkifiedText>
          </motion.p>

          {/* Meta strip — replaces the chip row. dl/dt/dd manifest. */}
          <motion.dl
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-8 grid grid-cols-1 gap-x-10 gap-y-5 border-t border-stone-200/80 pt-6 sm:grid-cols-2 lg:grid-cols-3 dark:border-stone-800/80"
          >
            <DayMetaRow label="City">
              <SmartEntity name={day.city} type="city" />
            </DayMetaRow>
            <DayMetaRow label="Hotel">
              <SmartEntity name={day.hotel} type="hotel" city={day.city} />
            </DayMetaRow>
            {day.weather && (
              <DayMetaRow label="Weather">
                <span className="font-mono tabular-nums">
                  {day.weather.highC}° / {day.weather.lowC}°
                </span>
                <span className="ml-1.5 text-stone-500 dark:text-stone-500">· {day.weather.condition}</span>
              </DayMetaRow>
            )}
            {day.neighborhoods.length > 0 && (
              <DayMetaRow label="Neighborhoods" wide>
                {day.neighborhoods.map((n, i) => (
                  <span key={n}>
                    {i > 0 && <span aria-hidden className="mx-1.5 text-stone-400 dark:text-stone-600">·</span>}
                    <SmartEntity name={n} type="neighborhood" city={day.city} />
                  </span>
                ))}
              </DayMetaRow>
            )}
          </motion.dl>

          {/* Map Mode CTA */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.32 }}
            className="mt-8"
          >
            <button
              type="button"
              onClick={() => setMapModeOpen(true)}
              className="group relative inline-flex items-center gap-2 overflow-visible rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-stone-50 transition hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-rose-200"
            >
              {/* Ink-stamp halo: a rose ring scales out from the button on
                  hover, like a wax seal being pressed. Hidden on touch
                  devices (no hover) and respects prefers-reduced-motion
                  via the no-op end state. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full border-2 border-rose-500/70 opacity-0 scale-100 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:scale-[1.18] motion-reduce:hidden"
              />
              <Globe2 className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-[14deg]" aria-hidden />
              Enter Map Mode
            </button>
          </motion.div>
        </div>
      </header>

      <AnimatePresence>
        {mapModeOpen && (
          <Suspense fallback={null}>
            <MapModeOverlay
              daySlug={day.slug}
              dayTitle={day.title}
              onClose={() => {
                setMapModeOpen(false)
                setMapModeFocusId(undefined)
              }}
              initialFocusPlaceId={mapModeFocusId}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 sm:pt-16">
        {reservations.length > 0 && (
          <DaySection number="01" eyebrow="Booked moments" title="Reservations" id="reservations">
            <TimelineRail dayProgress={dayProgress}>
              {reservations.map((r) => (
                <TimelineItem key={r.id} time={r.time} isActive={nextResId === r.id}>
                  <ReservationCard reservation={r} />
                </TimelineItem>
              ))}
            </TimelineRail>
          </DaySection>
        )}

        {igSaves.length > 0 && (
          <DaySection number={reservations.length > 0 ? "02" : "01"} eyebrow="From your Instagram saves" title="Instagram Saves" id="ig-saves">
            <div className="mt-6 space-y-3">
              {igSaves.map((save) => (
                <IgSaveCard
                  key={save.id}
                  save={save}
                  onOpenInMap={() => {
                    setMapModeFocusId(`ig-${save.id}`)
                    setMapModeOpen(true)
                  }}
                />
              ))}
            </div>
          </DaySection>
        )}

        {day.sections.length > 3 && (
          <nav
            aria-label="Day section jump"
            className="mt-10 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 text-xs [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {day.sections.map((sec) => (
              <a
                key={sec.heading}
                href={`#${slugify(sec.heading)}`}
                className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 font-medium text-stone-600 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-stone-300 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400 dark:hover:border-stone-700 dark:hover:text-stone-100"
              >
                {sec.heading}
              </a>
            ))}
          </nav>
        )}

        {day.callouts && day.callouts.length > 0 && (
          <div className="mt-10 space-y-3">
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

        {/* Sections — hairline-separated editorial ledger. No card
            wrapper, no backdrop-blur, no rose hover flood. Each section
            scroll-reveals individually as it crosses the viewport. */}
        <div className="mt-10 divide-y divide-stone-200/80 dark:divide-stone-800/80">
          {day.sections.map((sec) => (
            <DaySectionItem
              key={sec.heading}
              id={slugify(sec.heading)}
              className="scroll-mt-20 py-8 sm:py-10"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3
                  className="font-serif text-xl font-medium tracking-[-0.01em] text-stone-900 sm:text-2xl dark:text-stone-100"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {sec.heading}
                </h3>
                {sec.time && (
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
                    {sec.time}
                  </span>
                )}
              </div>
              <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                {sec.bullets.map((b, j) => (
                  <li key={j} className="flex gap-3 break-words">
                    <span
                      aria-hidden
                      className="mt-2.5 inline-block h-1 w-1 shrink-0 rounded-full bg-stone-400 dark:bg-stone-600"
                    />
                    <span className="min-w-0 flex-1 break-words">
                      <LinkifiedText>{b}</LinkifiedText>
                    </span>
                  </li>
                ))}
              </ul>
            </DaySectionItem>
          ))}
        </div>

        {/* Prev / Next nav — hairline rows, not cards. */}
        <nav className="mt-12 grid grid-cols-1 gap-2 border-t border-stone-200/80 pt-6 sm:grid-cols-2 sm:gap-6 dark:border-stone-800/80">
          {prev ? (
            <Link
              to={`/korea/day/${prev.slug}`}
              className="group -mx-2 flex items-center justify-between gap-4 rounded-2xl px-2 py-3 transition-colors hover:bg-stone-100/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:hover:bg-stone-900/40"
            >
              <ArrowUpRight
                aria-hidden
                className="h-4 w-4 shrink-0 -scale-x-100 text-stone-400 transition group-hover:-translate-x-0.5 group-hover:text-rose-600 dark:group-hover:text-rose-400"
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
                  Previous · Day {prev.n}
                </p>
                <p className="mt-1 truncate font-serif text-base font-medium text-stone-900 dark:text-stone-100"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {prev.title}
                </p>
              </div>
            </Link>
          ) : (
            <span aria-hidden />
          )}
          {next ? (
            <Link
              to={`/korea/day/${next.slug}`}
              className="group -mx-2 flex items-center justify-between gap-4 rounded-2xl px-2 py-3 text-right transition-colors hover:bg-stone-100/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 sm:justify-end dark:hover:bg-stone-900/40"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
                  Next · Day {next.n}
                </p>
                <p
                  className="mt-1 truncate font-serif text-base font-medium text-stone-900 dark:text-stone-100"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {next.title}
                </p>
              </div>
              <ArrowUpRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-rose-600 dark:group-hover:text-rose-400"
              />
            </Link>
          ) : (
            <span aria-hidden />
          )}
        </nav>
      </div>
    </article>
  )
}

/**
 * Editorial section shell for the day page — mirrors the index's
 * SectionShell so navigating from index → day feels like turning the
 * page in the same printed program.
 */
function DaySection({
  number,
  eyebrow,
  title,
  id,
  children,
}: {
  number: string
  eyebrow: string
  title: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="mt-2 scroll-mt-20">
      <header className="border-b border-stone-200/80 pb-4 dark:border-stone-800/80">
        <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
          <span className="tabular-nums text-rose-600 dark:text-rose-400">{number}</span>
          <span aria-hidden className="h-px w-8 bg-stone-300 dark:bg-stone-700" />
          <span>{eyebrow}</span>
        </p>
        <h2
          className="mt-2.5 font-serif text-2xl font-medium leading-tight tracking-[-0.01em] text-stone-900 sm:text-3xl dark:text-stone-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {title}
        </h2>
      </header>
      {children}
    </section>
  )
}

function DayMetaRow({
  label,
  children,
  wide,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={"min-w-0 " + (wide ? "sm:col-span-2 lg:col-span-3" : "")}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-sm leading-snug text-stone-800 dark:text-stone-200">{children}</dd>
    </div>
  )
}

function IgSaveCard({ save, onOpenInMap }: { save: IgSave; onOpenInMap: () => void }) {
  const BAND_STYLES: Record<IgSave["confidence_band"], string> = {
    high: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    medium: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    low: "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400",
  }
  // Geocoded saves can be focused in Map Mode. Saves without coords
  // don't have a 3D bubble to fly to, so we render them as a static
  // article instead of a button.
  const hasCoords = save.lat != null && save.lng != null

  const inner = (
    <div className="min-w-0 flex-1 text-left">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <h3
          className="break-words text-[15px] font-medium leading-snug text-stone-900 dark:text-stone-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {save.name}
        </h3>
        <a
          href={save.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${save.name} on Instagram (opens in new tab)`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center rounded-full p-1 text-stone-400 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:text-stone-500 dark:hover:text-rose-400"
        >
          <IgIcon className="h-3.5 w-3.5" aria-hidden />
        </a>
        {hasCoords && (
          <span
            aria-hidden
            title="Opens in Map Mode"
            className="ml-auto inline-flex items-center text-stone-400 transition group-hover:translate-x-0.5 group-hover:text-rose-600 dark:text-stone-500 dark:group-hover:text-rose-400"
          >
            <Globe2 className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {save.name_romanized && save.name_romanized !== save.name && (
        <p className="mt-0.5 text-[12px] text-stone-500 dark:text-stone-400">{save.name_romanized}</p>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600 dark:bg-stone-800 dark:text-stone-400">
          {save.category}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BAND_STYLES[save.confidence_band]}`}>
          {save.confidence_band} confidence
        </span>
        {save.ownerUsername && (
          <span className="text-[11px] text-stone-400 dark:text-stone-500">@{save.ownerUsername}</span>
        )}
      </div>
      {save.address && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-stone-600 dark:text-stone-400">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-stone-400" aria-hidden />
          <span className="break-words">{save.address}</span>
        </p>
      )}
      {save.captionSnippet && (
        <p className="mt-2 line-clamp-2 text-[12px] italic leading-relaxed text-stone-500 dark:text-stone-400">
          "{save.captionSnippet}"
        </p>
      )}
    </div>
  )

  if (!hasCoords) {
    return (
      <article
        className="flex flex-wrap items-start gap-3 rounded-2xl border border-stone-200/80 bg-white/80 p-4 dark:border-stone-800/80 dark:bg-stone-900/60"
        aria-label={`Instagram save: ${save.name}`}
      >
        {inner}
      </article>
    )
  }

  // role="button" instead of <button> so the nested Instagram <a>
  // remains valid (anchors aren't allowed inside button elements).
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenInMap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpenInMap()
        }
      }}
      aria-label={`Open ${save.name} in Map Mode`}
      className="group flex w-full flex-wrap items-start gap-3 rounded-2xl border border-stone-200/80 bg-white/80 p-4 text-left transition hover:border-rose-300 hover:bg-rose-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-stone-800/80 dark:bg-stone-900/60 dark:hover:border-rose-800 dark:hover:bg-rose-950/20"
    >
      {inner}
    </div>
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
        className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
      >
        Back to overview
      </Link>
    </div>
  )
}

// ---------- Overdrive helpers ----------

/**
 * Vertical timeline rail used by the day's "Booked moments" section.
 * Draws a hairline rule down the left edge that the timeline items hang
 * off of. When the day is "today", a soft rose-to-amber progress line
 * fills the rail from the top down to the current time-of-day position.
 */
function TimelineRail({
  children,
  dayProgress,
}: {
  children: React.ReactNode
  dayProgress: number | null
}) {
  return (
    <div className="relative mt-6">
      {/* Static rail */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-[7px] top-0 w-px bg-stone-200/90 dark:bg-stone-800/90 sm:left-[11px]"
      />
      {/* Progress line — only when day === today. Soft rose-to-amber. */}
      {dayProgress !== null && (
        <motion.div
          aria-hidden
          initial={{ scaleY: 0 }}
          animate={{ scaleY: dayProgress }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          className="pointer-events-none absolute left-[7px] top-0 w-px origin-top bg-gradient-to-b from-rose-500 via-rose-400 to-amber-400 motion-reduce:transition-none motion-reduce:duration-0 sm:left-[11px]"
          style={{ height: "100%" }}
        />
      )}
      {/* "Now" indicator — small rose pip at the day-progress position. */}
      {dayProgress !== null && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 1.4 }}
          className="pointer-events-none absolute left-0 z-10 flex items-center motion-reduce:transition-none sm:left-1"
          style={{ top: `calc(${(dayProgress * 100).toFixed(2)}% - 6px)` }}
        >
          <span className="relative inline-block h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.18)] dark:bg-rose-400 dark:shadow-[0_0_0_3px_rgba(251,113,133,0.22)]">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-500/50 motion-reduce:hidden dark:bg-rose-400/50" />
          </span>
          <span className="ml-2 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300 sm:inline">
            now
          </span>
        </motion.div>
      )}

      <ol className="relative space-y-4 pl-7 sm:pl-10">{children}</ol>
    </div>
  )
}

/**
 * One row on the timeline rail. Renders a small node on the rail (active
 * rows get an amber breathing rim glow), the time label, and the slot
 * for the child card. The whole row eases into place on scroll via the
 * shared scroll-reveal helper.
 */
function TimelineItem({
  children,
  time,
  isActive,
}: {
  children: React.ReactNode
  time?: string
  isActive: boolean
}) {
  const reveal = useScrollReveal<HTMLLIElement>()
  return (
    <li ref={reveal} className={"relative " + REVEAL_CLASSES}>
      <span
        aria-hidden
        className={
          "absolute left-[3px] top-5 z-[1] inline-block h-2.5 w-2.5 rounded-full ring-2 sm:left-[7px] " +
          (isActive
            ? "bg-rose-500 ring-rose-200 dark:bg-rose-400 dark:ring-rose-900"
            : "bg-stone-300 ring-stone-100 dark:bg-stone-600 dark:ring-stone-900")
        }
      />
      {isActive && (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-1 top-3 h-7 w-7 animate-[timeline-breath_3s_ease-in-out_infinite] rounded-full bg-amber-400/30 blur-md motion-reduce:hidden sm:left-[1px]"
        />
      )}
      {time && (
        <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
          {time}
        </p>
      )}
      <div className={isActive ? "relative" : undefined}>
        {isActive && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-2xl ring-1 ring-amber-400/45 animate-[timeline-rim_3s_ease-in-out_infinite] motion-reduce:animate-none dark:ring-amber-300/45"
          />
        )}
        {children}
      </div>
    </li>
  )
}

/**
 * Wrapper used to scroll-reveal each long-form day section. Uses the
 * shared IntersectionObserver so dozens of items don't each set up
 * their own.
 */
function DaySectionItem({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: React.ReactNode
}) {
  const reveal = useScrollReveal<HTMLElement>()
  return (
    <section ref={reveal} id={id} className={REVEAL_CLASSES + " " + (className ?? "")}>
      {children}
    </section>
  )
}

/**
 * Oversized day numeral that strokes in on mount. The Cormorant glyph
 * is rendered as an SVG <text> and we animate stroke-dashoffset from
 * full to zero, then fade the fill in so the digit settles into its
 * solid form. Honors prefers-reduced-motion by skipping animation.
 */
function DayNumeralMark({ n, reduce }: { n: number; reduce: boolean }) {
  const label = String(n).padStart(2, "0")
  const widthCh = label.length * 0.6
  return (
    <div
      aria-hidden
      className="relative shrink-0 select-none"
      style={{ width: `clamp(2.5rem, ${widthCh * 12}vw, ${widthCh * 5}rem)` }}
    >
      <svg
        viewBox="0 0 100 100"
        className="block h-auto w-full text-rose-600 dark:text-rose-400"
        preserveAspectRatio="xMidYMid meet"
      >
        <text
          x="50"
          y="78"
          textAnchor="middle"
          fontFamily="'Cormorant Garamond', serif"
          fontSize="96"
          fontWeight="500"
          fill="currentColor"
          fillOpacity={reduce ? 1 : 0}
          stroke="currentColor"
          strokeWidth={reduce ? 0 : 0.6}
          style={{
            strokeDasharray: reduce ? "none" : "260",
            strokeDashoffset: reduce ? "0" : "260",
            animation: reduce
              ? "none"
              : "korea-stroke-in 1.1s cubic-bezier(0.16,1,0.3,1) 0.05s forwards, korea-stroke-fill 0.6s ease-out 0.85s forwards",
          }}
        >
          {label}
        </text>
      </svg>
    </div>
  )
}

/**
 * Returns the ID of the next-upcoming (or active) reservation today,
 * or null if the day isn't today or no future reservations remain.
 */
function nextUpcomingReservationId(reservations: Reservation[], isToday: boolean): string | null {
  if (!isToday || reservations.length === 0) return null
  const now = Date.now()
  let best: { id: string; ts: number } | null = null
  for (const r of reservations) {
    const ts = makeKstDate(r.date, r.time ?? "00:00").getTime()
    if (ts >= now) {
      if (!best || ts < best.ts) best = { id: r.id, ts }
    }
  }
  return best?.id ?? null
}

/** Fraction of the current day elapsed in Asia/Seoul time, 0–1. */
function kstDayProgress(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0)
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  return Math.max(0, Math.min(1, (h * 60 + m) / (24 * 60)))
}
