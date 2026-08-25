import type { StyleXStyles } from '@stylexjs/stylex'
import { sx } from '@/styles/merge'
import { koreaDay } from './KoreaDay.stylex'
import { lazy, Suspense, useEffect, useMemo, useState, useTransition } from "react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
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
import { fetchDayPlaces } from "./dayPlacesApi"
import type { IgSave } from "./mapModeTypes"

const MapModeOverlay = lazy(() =>
  import("./MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })),
)

/** Fetches IG saves for this day from the same /api/korea/day/:slug/places endpoint. */
function useDayIgSaves(slug: string | undefined): IgSave[] {
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const [igSaves, setIgSaves] = useState<IgSave[]>([])
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!slug || !clerkEnabled) return
    let cancelled = false
    void (async () => {
      try {
        const token = await readToken()
        if (!token) return
        const data = await fetchDayPlaces(readToken, `/api/korea/day/${encodeURIComponent(slug)}/places`)
        if (!cancelled) startTransition(() => setIgSaves(data.igSaves ?? []))
      } catch {
        // Non-fatal — day page works without IG saves
      }
    })()
    return () => { cancelled = true }
  }, [slug, startTransition])

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
  const reservationsForDay: Reservation[] = dayData?.reservations ?? []
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
      <header {...sx(koreaDay.sef9a1001)}>
        <div {...sx(koreaDay.s19815d3c)}>
          {/* Eyebrow */}
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            {...sx(koreaDay.s313963c7)}
          >
            <span {...sx(koreaDay.s3d2b6cbe)}>{cityTag}</span>
            <span aria-hidden {...sx(koreaDay.sa292799f)} />
            <span>Day {String(day.n).padStart(2, "0")} of 12</span>
            <span aria-hidden {...sx(koreaDay.s146516be)}>·</span>
            <span>{formatDate(day.date, { weekday: "long", month: "long", day: "numeric" })}</span>
            {isToday && (
              <>
                <span aria-hidden {...sx(koreaDay.s146516be)}>·</span>
                <span {...sx(koreaDay.s9dd51fa2)}>
                  <span aria-hidden {...sx(koreaDay.s421599fa)} />
                  Today
                </span>
              </>
            )}
          </motion.p>

          {/* Headline: oversized day numeral that strokes in on mount,
              followed by the emoji + Cormorant title. The numeral is the
              one vivid moment in the header — the day announces itself. */}
          <div {...sx(koreaDay.s461cc624)}>
            <DayNumeralMark n={day.n} reduce={!!reduce} />
            <div {...sx(koreaDay.se30fd43e)}>
              <div {...sx(koreaDay.sc2828cd5)}>
                <span aria-hidden {...sx(koreaDay.s96ca9900)}>
                  {day.emoji}
                </span>
                <motion.h1
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                  {...sx(koreaDay.s11e145a5)}
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
            {...sx(koreaDay.sd9e175d3)}
          >
            <LinkifiedText>{day.theme}</LinkifiedText>
          </motion.p>

          {/* Meta strip — replaces the chip row. dl/dt/dd manifest. */}
          <motion.dl
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            {...sx(koreaDay.s267fb973)}
          >
            <DayMetaRow label="City">
              <SmartEntity name={day.city} type="city" />
            </DayMetaRow>
            <DayMetaRow label="Hotel">
              <SmartEntity name={day.hotel} type="hotel" city={day.city} />
            </DayMetaRow>
            {day.weather && (
              <DayMetaRow label="Weather">
                <span {...sx(koreaDay.saa60077c)}>
                  {day.weather.highC}° / {day.weather.lowC}°
                </span>
                <span {...sx(koreaDay.sb3ee4514)}>· {day.weather.condition}</span>
              </DayMetaRow>
            )}
            {day.neighborhoods.length > 0 && (
              <DayMetaRow label="Neighborhoods" wide>
                {day.neighborhoods.map((n, i) => (
                  <span key={n}>
                    {i > 0 && <span aria-hidden {...sx(koreaDay.s7f23fa08)}>·</span>}
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
            {...sx(koreaDay.s334592)}
          >
            <button
              type="button"
              onClick={() => setMapModeOpen(true)}
              {...sx(koreaDay.s45e81fd2, 'group')}
            >
              {/* Ink-stamp halo: a rose ring scales out from the button on
                  hover, like a wax seal being pressed. Hidden on touch
                  devices (no hover) and respects prefers-reduced-motion
                  via the no-op end state. */}
              <span
                aria-hidden
                {...sx(koreaDay.s6011f953)}
              />
              <Globe2 {...sx(koreaDay.sf7988188)} aria-hidden />
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

      <div {...sx(koreaDay.s968fb47e)}>
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
            <div {...sx(koreaDay.s5186f408)}>
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
            {...sx(koreaDay.s76d0f672)}
          >
            {day.sections.map((sec) => (
              <a
                key={sec.heading}
                href={`#${slugify(sec.heading)}`}
                {...sx(koreaDay.s34740812)}
              >
                {sec.heading}
              </a>
            ))}
          </nav>
        )}

        {day.callouts && day.callouts.length > 0 && (
          <div {...sx(koreaDay.s3c174c3d)}>
            {day.callouts.map((c, i) => (
              <motion.div
                key={i}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: reduce ? 0 : i * 0.05 }}
                {...sx(koreaDay.calloutBase, calloutTone(c.tone))}
              >
                <span aria-hidden {...sx(koreaDay.s8b2f6784)}>
                  {c.icon}
                </span>
                <p {...sx(koreaDay.s133a9f79)}>
                  <LinkifiedText>{c.body}</LinkifiedText>
                </p>
              </motion.div>
            ))}
          </div>
        )}

        {/* Sections — hairline-separated editorial ledger. No card
            wrapper, no backdrop-blur, no rose hover flood. Each section
            scroll-reveals individually as it crosses the viewport. */}
        <div {...sx(koreaDay.sc1732136, 'korea-hairline-stack')}>
          {day.sections.map((sec) => (
            <DaySectionItem
              key={sec.heading}
              id={slugify(sec.heading)}
              style={koreaDay.scf683a73}
            >
              <div {...sx(koreaDay.sc4049d36)}>
                <h3
                  {...sx(koreaDay.s7624a73c)}
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {sec.heading}
                </h3>
                {sec.time && (
                  <span {...sx(koreaDay.s9ef46f9a)}>
                    {sec.time}
                  </span>
                )}
              </div>
              <ul {...sx(koreaDay.s7561d894)}>
                {sec.bullets.map((b, j) => (
                  <li key={j} {...sx(koreaDay.sc5036cd0)}>
                    <span
                      aria-hidden
                      {...sx(koreaDay.sbad4db5e)}
                    />
                    <span {...sx(koreaDay.s133a9f79)}>
                      <LinkifiedText>{b}</LinkifiedText>
                    </span>
                  </li>
                ))}
              </ul>
            </DaySectionItem>
          ))}
        </div>

        {/* Prev / Next nav — hairline rows, not cards. */}
        <nav {...sx(koreaDay.sdf023620)}>
          {prev ? (
            <Link
              to={`/korea/day/${prev.slug}`}
              {...sx(koreaDay.sdf9073d0, 'group')}
            >
              <ArrowUpRight
                aria-hidden
                {...sx(koreaDay.s771fcc4e)}
              />
              <div {...sx(koreaDay.se30fd43e)}>
                <p {...sx(koreaDay.sa8fa1afe)}>
                  Previous · Day {prev.n}
                </p>
                <p {...sx(koreaDay.sccefa16)}
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
              {...sx(koreaDay.sf471ffe4, 'group')}
            >
              <div {...sx(koreaDay.se30fd43e)}>
                <p {...sx(koreaDay.sa8fa1afe)}>
                  Next · Day {next.n}
                </p>
                <p
                  {...sx(koreaDay.sccefa16)}
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  {next.title}
                </p>
              </div>
              <ArrowUpRight
                aria-hidden
                {...sx(koreaDay.s7017711b)}
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
    <section id={id} {...sx(koreaDay.sda6e4738)}>
      <header {...sx(koreaDay.sfd00d69a)}>
        <p {...sx(koreaDay.s6ebd97a0)}>
          <span {...sx(koreaDay.s1ed0b4fd)}>{number}</span>
          <span aria-hidden {...sx(koreaDay.sa292799f)} />
          <span>{eyebrow}</span>
        </p>
        <h2
          {...sx(koreaDay.s3fbe0b7b)}
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
    <div {...sx(koreaDay.metaRow, wide && koreaDay.metaRowWide)}>
      <dt {...sx(koreaDay.sa8fa1afe)}>
        {label}
      </dt>
      <dd {...sx(koreaDay.s7c716ed1)}>{children}</dd>
    </div>
  )
}

function IgSaveCard({ save, onOpenInMap }: { save: IgSave; onOpenInMap: () => void }) {
  const BAND_STYLES: Record<IgSave["confidence_band"], (typeof koreaDay)[keyof typeof koreaDay]> = {
    high: koreaDay.bandHigh,
    medium: koreaDay.bandMedium,
    low: koreaDay.bandLow,
  }
  // Geocoded saves can be focused in Map Mode. Saves without coords
  // don't have a 3D bubble to fly to, so we render them as a static
  // article instead of a button.
  const hasCoords = save.lat != null && save.lng != null

  const inner = (
    <div {...sx(koreaDay.s584bf345)}>
      <div {...sx(koreaDay.s66c6574d)}>
        <h3
          {...sx(koreaDay.s1e854b4e)}
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
          {...sx(koreaDay.se59d4259)}
        >
          <IgIcon style={koreaDay.sd2d12d59} aria-hidden />
        </a>
        {hasCoords && (
          <span
            aria-hidden
            title="Opens in Map Mode"
            {...sx(koreaDay.sb6ea70b1)}
          >
            <Globe2 {...sx(koreaDay.sd2d12d59)} />
          </span>
        )}
      </div>
      {save.name_romanized && save.name_romanized !== save.name && (
        <p {...sx(koreaDay.sb6b5bbf3)}>{save.name_romanized}</p>
      )}
      <div {...sx(koreaDay.s80ebf8de)}>
        <span {...sx(koreaDay.s943c8b76)}>
          {save.category}
        </span>
        <span {...sx(koreaDay.confidenceBand, BAND_STYLES[save.confidence_band])}>
          {save.confidence_band} confidence
        </span>
        {save.ownerUsername && (
          <span {...sx(koreaDay.sfb2a5003)}>@{save.ownerUsername}</span>
        )}
      </div>
      {save.address && (
        <p {...sx(koreaDay.sd5267d22)}>
          <MapPin {...sx(koreaDay.s87eb3d3c)} aria-hidden />
          <span {...sx(koreaDay.s13588c5b)}>{save.address}</span>
        </p>
      )}
      {save.captionSnippet && (
        <p {...sx(koreaDay.sbefbaf79)}>
          "{save.captionSnippet}"
        </p>
      )}
    </div>
  )

  if (!hasCoords) {
    return (
      <article
        {...sx(koreaDay.s811e8d01)}
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
      {...sx(koreaDay.s34c7637e, 'group')}
    >
      {inner}
    </div>
  )
}

function DaySkeleton() {
  return (
    <div {...sx(koreaDay.s21863def)}>
      <div {...sx(koreaDay.s66206804, 'animate-pulse')} />
      <div {...sx(koreaDay.s65e0b1c2)}>
        {[1, 2, 3].map((i) => (
          <div key={i} {...sx(koreaDay.s7125465f, 'animate-pulse')} />
        ))}
      </div>
    </div>
  )
}

function DayError({ message }: { message: string }) {
  return (
    <div {...sx(koreaDay.s21863def)}>
      <h1 {...sx(koreaDay.sd6a53ff7)}>Day not found</h1>
      <p {...sx(koreaDay.sf4376938)}>{message}</p>
      <Link
        to="/korea"
        {...sx(koreaDay.s70fee869)}
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
    <div {...sx(koreaDay.s7a8b1a64)}>
      {/* Static rail */}
      <div
        aria-hidden
        {...sx(koreaDay.s334c2470)}
      />
      {/* Progress line — only when day === today. Soft rose-to-amber. */}
      {dayProgress !== null && (
        <motion.div
          aria-hidden
          initial={{ scaleY: 0 }}
          animate={{ scaleY: dayProgress }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          {...sx(koreaDay.s25b57421)}
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
          {...sx(koreaDay.s49b257ea)}
          style={{ top: `calc(${(dayProgress * 100).toFixed(2)}% - 6px)` }}
        >
          <span {...sx(koreaDay.s2f0c41bb)}>
            <span {...sx(koreaDay.sc5d6e7b4, 'animate-ping')} />
          </span>
          <span {...sx(koreaDay.s82c8ce12)}>
            now
          </span>
        </motion.div>
      )}

      <ol {...sx(koreaDay.sd790620f)}>{children}</ol>
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
    <li ref={reveal} {...sx(koreaDay.timelineReveal, REVEAL_CLASSES)}>
      <span
        aria-hidden
        {...sx(
          koreaDay.timelineDot,
          isActive ? koreaDay.timelineDotActive : koreaDay.timelineDotInactive,
        )}
      />
      {isActive && (
        <span
          aria-hidden
          {...sx(koreaDay.s92b3001d, 'animate-timeline-breath')}
        />
      )}
      {time && (
        <p {...sx(koreaDay.s81fa8d2d)}>
          {time}
        </p>
      )}
      <div {...sx(isActive && koreaDay.timelineActiveWrap)}>
        {isActive && (
          <span
            aria-hidden
            {...sx(koreaDay.s70432184, 'animate-timeline-rim')}
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
  style,
  children,
}: {
  id?: string
  style?: StyleXStyles
  children: React.ReactNode
}) {
  const reveal = useScrollReveal<HTMLElement>()
  return (
    <section ref={reveal} id={id} {...sx(REVEAL_CLASSES, style)}>
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
      {...sx(koreaDay.s86a2dd89)}
      style={{ width: `clamp(2.5rem, ${widthCh * 12}vw, ${widthCh * 5}rem)` }}
    >
      <svg
        viewBox="0 0 100 100"
        {...sx(koreaDay.sd2ef6efc)}
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
