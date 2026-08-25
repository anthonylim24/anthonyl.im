import { sx } from '@/styles/merge'
import { places as placesPage } from './Places.stylex'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react'
import { useLatestCallback } from '@/hooks/useLatestCallback'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { clerkEnabled, useGetToken } from '@/lib/safeAuth'
import { LayoutGroup, motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ExternalLink, MapPin, Phone, Star, AlertTriangle, ArrowLeft, CalendarDays, Check, Loader2, X } from 'lucide-react'
import { IgIcon } from './IgIcon'
import { PlaceCardSkeleton } from './skeletons'
import { fetchExtractedPlaces, setExtractedPlaceDays } from './placesApi'
import type { ExtractedPlace, BusynessLevel } from './placesApi'
import { BusynessBadge } from './BusynessBadge'
import { useTweenNumber } from './useTweenNumber'
import { useFineHover } from '@/hooks/useFineHover'

// Spring curves reused by the chips and cards — match the shared
// cubic-bezier(0.16, 1, 0.3, 1) feel from the design system but tuned for
// small-displacement motion. `stiffness` is high enough to feel responsive,
// `damping` keeps it from oscillating on the second hop.
const FLIP_SPRING = { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.6 }
const CHIP_SPRING = { type: 'spring' as const, stiffness: 600, damping: 30, mass: 0.4 }

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['restaurant', 'cafe', 'bar', 'shopping', 'activity', 'hotel', 'landmark', 'other'] as const
type Category = typeof CATEGORIES[number]

const BANDS = ['high', 'medium', 'low'] as const
type Band = typeof BANDS[number]

const BUSYNESS_LEVELS = ['quiet', 'moderate', 'busy', 'very_busy'] as const

const BUSYNESS_LABELS: Record<BusynessLevel, string> = {
  quiet: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
  very_busy: 'Very Busy',
}

const CATEGORY_LABELS: Record<Category, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bar: 'Bar',
  shopping: 'Shopping',
  activity: 'Activity',
  hotel: 'Hotel',
  landmark: 'Landmark',
  other: 'Other',
}

const BAND_LABELS: Record<Band, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const PAGE_SIZE = 50

// Static day index for the Korea trip (May 26 – June 6, 2026).
// Embedded here to avoid an extra /api/korea fetch just for day labels.
export interface PlaceDayOption {
  n: number
  date: string
  label: string
  id?: string
}

const KOREA_DAYS: PlaceDayOption[] = [
  { n: 1,  date: '2026-05-26', label: 'Day 1 · May 26 · Tue' },
  { n: 2,  date: '2026-05-27', label: 'Day 2 · May 27 · Wed' },
  { n: 3,  date: '2026-05-28', label: 'Day 3 · May 28 · Thu' },
  { n: 4,  date: '2026-05-29', label: 'Day 4 · May 29 · Fri' },
  { n: 5,  date: '2026-05-30', label: 'Day 5 · May 30 · Sat' },
  { n: 6,  date: '2026-05-31', label: 'Day 6 · May 31 · Sun' },
  { n: 7,  date: '2026-06-01', label: 'Day 7 · Jun 1 · Mon' },
  { n: 8,  date: '2026-06-02', label: 'Day 8 · Jun 2 · Tue' },
  { n: 9,  date: '2026-06-03', label: 'Day 9 · Jun 3 · Wed' },
  { n: 10, date: '2026-06-04', label: 'Day 10 · Jun 4 · Thu' },
  { n: 11, date: '2026-06-05', label: 'Day 11 · Jun 5 · Fri' },
  { n: 12, date: '2026-06-06', label: 'Day 12 · Jun 6 · Sat' },
]

const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  caption: 'from caption',
  transcript: 'from transcript',
  ocr: 'from OCR',
  location_tag: 'from location tag',
  multiple: 'from multiple signals',
}

// ── Badge components ──────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: Category }) {
  const styles = {
    restaurant: placesPage.catRestaurant,
    cafe: placesPage.catCafe,
    bar: placesPage.catBar,
    shopping: placesPage.catShopping,
    activity: placesPage.catActivity,
    hotel: placesPage.catHotel,
    landmark: placesPage.catLandmark,
    other: placesPage.catOther,
  } as const
  return (
    <span {...sx(placesPage.badgeBase, styles[category])}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

function BandBadge({ band, votes }: { band: Band; votes?: number }) {
  const styles = {
    high: placesPage.bandHigh,
    medium: placesPage.bandMedium,
    low: placesPage.bandLow,
  } as const
  return (
    <span {...sx(placesPage.badgeBase, placesPage.bandGap, styles[band])}>
      {BAND_LABELS[band]}
      {votes != null && votes > 0 && (
        <span aria-label={`${votes} votes`}>· {votes}v</span>
      )}
    </span>
  )
}

// ── Map links ─────────────────────────────────────────────────────────────────

function googleMapsUrl(place: ExtractedPlace): string | null {
  if (place.google_place_id) {
    return `https://www.google.com/maps/place/?q=place_id:${place.google_place_id}`
  }
  if (place.lat != null && place.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
  }
  return null
}

function kakaoMapsUrl(place: ExtractedPlace): string | null {
  if (place.lat == null || place.lng == null) return null
  const usesKakao =
    place.geocode_kakao_id ||
    place.geocode_source === 'kakao' ||
    place.geocode_source === 'google+kakao'
  if (!usesKakao) return null
  return `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.lat},${place.lng}`
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

// ── Day assignment button ─────────────────────────────────────────────────────

interface DayAssignButtonProps {
  place: ExtractedPlace
  getToken: () => Promise<string | null>
  onUpdated: (placeId: number, days: number[]) => void
  days: PlaceDayOption[]
}

// Approximate dialog height for placement decisions — kept conservative so a
// nearly-full dropdown still gets flipped above the trigger if the viewport
// would clip it. Refined after first paint via the dialog's measured rect.
const DAY_DIALOG_ESTIMATED_HEIGHT = 360

function DayAssignButton({ place, getToken, onUpdated, days }: DayAssignButtonProps) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [pendingDays, setPendingDays] = useState<Set<number>>(new Set(place.days ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Fixed-position coordinates for the portaled dialog. `placement` flips the
  // dropdown above the trigger when there isn't room below — common on phones
  // when the card sits near the bottom of the viewport.
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' } | null>(null)

  // Sync external changes (e.g. re-fetch)
  useEffect(() => {
    if (!open) setPendingDays(new Set(place.days ?? []))
  }, [place.days, open])

  // Close on Escape — return focus to the trigger for keyboard users
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Close on outside click — must also exclude the trigger so its click
  // doesn't fire after mousedown-driven close and reopen the dialog.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const dialog = dialogRef.current
      const trigger = triggerRef.current
      const target = e.target as Node
      if (dialog && dialog.contains(target)) return
      if (trigger && trigger.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  // Compute + keep dialog position in sync with the trigger. We portal the
  // dialog to document.body to escape every PlaceCard's stacking context
  // (motion `layout` transforms create one), so it must be positioned
  // manually relative to the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const update = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const measured = dialogRef.current?.offsetHeight ?? 0
      const dialogH = measured > 0 ? measured : DAY_DIALOG_ESTIMATED_HEIGHT
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const placement: 'below' | 'above' =
        spaceBelow < dialogH + 12 && spaceAbove > spaceBelow ? 'above' : 'below'
      const top = placement === 'below' ? rect.bottom + 6 : rect.top - 6 - dialogH
      // Clamp to viewport — 8 px gutter on each side, never wider than the
      // dialog's max-width (256 px = w-64).
      const dialogW = 256
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - dialogW - 8))
      setPos({ top, left, placement })
    }
    update()
    // Re-measure after the dialog mounts so the placement decision can use
    // the real height instead of the estimate.
    const raf = requestAnimationFrame(update)
    window.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const days = [...pendingDays].sort((a, b) => a - b)
      await setExtractedPlaceDays(getToken, place.id, days)
      onUpdated(place.id, days)
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(n: number) {
    setPendingDays((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const assignedDays = [...(place.days ?? [])].sort((a, b) => a - b)
  const hasAssignment = assignedDays.length > 0

  // Detect unsaved changes so the Save button can disable when there's
  // nothing to commit (also makes the dialog feel less like a no-op trap).
  const initial = new Set(place.days ?? [])
  const dirty =
    pendingDays.size !== initial.size ||
    [...pendingDays].some((n) => !initial.has(n))

  return (
    <div {...sx(placesPage.sdef3facc)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setPendingDays(new Set(place.days ?? [])); setOpen((v) => !v) }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={hasAssignment ? `Assigned to ${assignedDays.map(n => `Day ${n}`).join(', ')}. Change days` : 'Add to days'}
        {...sx(
          placesPage.dayBtnBase,
          hasAssignment ? placesPage.dayBtnAssigned : placesPage.dayBtnDefault,
        )}
      >
        <CalendarDays {...sx(placesPage.s177a9453)} aria-hidden />
        {hasAssignment ? `Day ${assignedDays.join(', ')}` : 'Add to days'}
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-label={`Assign ${place.name} to itinerary days`}
              aria-modal="true"
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: pos?.placement === 'above' ? 4 : -4 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: pos?.placement === 'above' ? 4 : -4 }}
              transition={{ duration: reduce ? 0.08 : 0.14, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: 'fixed',
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                visibility: pos ? 'visible' : 'hidden',
                transformOrigin: pos?.placement === 'above' ? 'bottom left' : 'top left',
              }}
              {...sx(placesPage.s850a9bdc)}
            >
              <p {...sx(placesPage.s8cf27964)}>
                Assign to days
              </p>
              <fieldset>
                <legend {...sx(placesPage.s88a3565a)}>Select days for {place.name}</legend>
                <div {...sx(placesPage.sb8f84d6a)}>
                  {days.map((day) => {
                    const checked = pendingDays.has(day.n)
                    return (
                      <label
                        key={day.n}
                        {...sx(placesPage.s44c27f6a)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDay(day.n)}
                          {...sx(placesPage.s68e9c50b)}
                          aria-label={day.label}
                        />
                        <span {...sx(placesPage.secf1a105)}>{day.label}</span>
                        {checked && <Check {...sx(placesPage.s9f2373f6)} aria-hidden />}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              {error && (
                <p role="alert" {...sx(placesPage.s847a05d)}>{error}</p>
              )}
              <div {...sx(placesPage.s9346b487)}>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  aria-busy={saving}
                  {...sx(placesPage.s1c7a5493)}
                >
                  {saving ? <Loader2 {...sx(placesPage.s97416715, 'animate-spin')} aria-hidden /> : null}
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  {...sx(placesPage.sbadbc294)}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

// ── PlaceCard ─────────────────────────────────────────────────────────────────

function PlaceCard({
  place,
  getToken,
  onUpdated,
  days,
}: {
  place: ExtractedPlace
  getToken: () => Promise<string | null>
  onUpdated: (placeId: number, days: number[]) => void
  days: PlaceDayOption[]
}) {
  const reduce = useReducedMotion()
  const gmUrl = googleMapsUrl(place)
  const kakaoUrl = kakaoMapsUrl(place)

  // Hover lift on ≥md with a real pointer only — touch devices skip it.
  const isDesktopHoverCapable = useFineHover()

  return (
    <motion.article
      // FLIP: `layout` rearranges existing cards with spring physics when
      // the filter result set changes. Cards entering/exiting are handled
      // by AnimatePresence (popLayout) in the parent so neighbors immediately
      // animate up to fill gaps rather than waiting on exit.
      layout={reduce ? false : true}
      initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
      animate={reduce ? undefined : { opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, scale: 0.94, y: -4 }}
      transition={reduce ? { duration: 0 } : FLIP_SPRING}
      whileHover={reduce || !isDesktopHoverCapable ? undefined : {
        scale: 1.005,
        y: -2,
        boxShadow: '0 12px 28px -16px rgba(28, 25, 23, 0.18), 0 4px 10px -6px rgba(28, 25, 23, 0.12)',
        transition: { type: 'spring', stiffness: 320, damping: 26 },
      }}
      {...sx(placesPage.s29685e07)}
      aria-label={`Place: ${place.name}`}
    >
      {/* Geocode-disagree warning banner */}
      {place.geocode_disagree && (
        <div
          role="alert"
          {...sx(placesPage.s274cec2d)}
        >
          <AlertTriangle {...sx(placesPage.s177a9453)} aria-hidden />
          Coordinates disagree between Google + Kakao — review
        </div>
      )}

      {/* Header: Korean name + badges. Stack the badges below the title
          on narrow viewports — at mobile widths, the four badges plus a
          long Latin/Hangul name compete for the same row and the title
          column collapses to a single-character ribbon. sm: and up,
          badges sit to the right as before. */}
      <div {...sx(placesPage.see6c9312)}>
        <div {...sx(placesPage.s6094affc)}>
          <h2
            {...sx(placesPage.sd2b6fe48)}
          >
            <span>{place.name}</span>
            {place.post && (
              <a
                href={place.post.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${place.name} on Instagram (opens in new tab)`}
                {...sx(placesPage.s26d3e39b)}
              >
                <IgIcon style={placesPage.scd3f3ccd} aria-hidden />
              </a>
            )}
          </h2>
          {place.name_romanized && place.name_romanized !== place.name && (
            <p {...sx(placesPage.s437416ed)}>
              {place.name_romanized}
              {place.city && (
                <span {...sx(placesPage.s5e96a87d)}> · {place.city}</span>
              )}
            </p>
          )}
          {!place.name_romanized && place.city && (
            <p {...sx(placesPage.s35851db4)}>{place.city}</p>
          )}
        </div>
        <div {...sx(placesPage.sf9f3add8)}>
          <CategoryBadge category={place.category} />
          <BandBadge band={place.confidence_band} votes={place.vote_count} />
          {place.busyness && <BusynessBadge busyness={place.busyness} />}
          {place.is_subject && (
            <span
              {...sx(placesPage.s59e27272)}
              title="Primary subject of the post"
            >
              Subject
            </span>
          )}
          {place.signal_source && (
            <span
              {...sx(placesPage.s1a56b4a3)}
              title={`Signal source: ${SIGNAL_SOURCE_LABELS[place.signal_source] ?? place.signal_source}`}
            >
              {SIGNAL_SOURCE_LABELS[place.signal_source] ?? place.signal_source}
            </span>
          )}
        </div>
      </div>

      {/* Address / contact / rating */}
      {(place.address || place.phone || place.rating != null) && (
        <div {...sx(placesPage.sf0cf4743)}>
          {place.address && (
            <p {...sx(placesPage.sf52c228f)}>
              <MapPin {...sx(placesPage.s40d1baca)} aria-hidden />
              <span {...sx(placesPage.sf99a5dc8)}>{place.address}</span>
            </p>
          )}
          <div {...sx(placesPage.s69a3f0df)}>
            {place.phone && (
              <a
                href={`tel:${place.phone}`}
                {...sx(placesPage.sd730516b)}
              >
                <Phone {...sx(placesPage.s218d6ca1)} aria-hidden />
                {place.phone}
              </a>
            )}
            {place.rating != null && (
              <span {...sx(placesPage.s8ae36097)} aria-label={`Rating ${place.rating.toFixed(1)} out of 5`}>
                <Star {...sx(placesPage.s3daf144e)} aria-hidden />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Supporting quote */}
      {place.supporting_quote && (
        <blockquote {...sx(placesPage.s402d4c91)}>
          &ldquo;{place.supporting_quote}&rdquo;
        </blockquote>
      )}

      {/* Post attribution */}
      {place.post && (
        <p {...sx(placesPage.s224db917)}>
          {place.post.owner_username && (
            <span>
              <a
                href={`https://instagram.com/${place.post.owner_username}`}
                target="_blank"
                rel="noopener noreferrer"
                {...sx(placesPage.sfd83f352)}
              >
                @{place.post.owner_username}
              </a>
              {' '}
            </span>
          )}
          from a reel on {formatDate(place.post.fetched_at)}
        </p>
      )}

      {/* Action links */}
      <div {...sx(placesPage.s6ef7bed4)}>
        <DayAssignButton place={place} getToken={getToken} onUpdated={onUpdated} days={days} />
        {place.post && (
          <a
            href={place.post.url}
            target="_blank"
            rel="noopener noreferrer"
            {...sx(placesPage.sf168e15a)}
            aria-label="View source post on Instagram (opens in new tab)"
          >
            <IgIcon style={placesPage.sd2d12d59} aria-hidden />
            View on Instagram
          </a>
        )}
        {gmUrl && (
          <a
            href={gmUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...sx(placesPage.sf168e15a)}
            aria-label={`View ${place.name} on Google Maps (opens in new tab)`}
          >
            <ExternalLink {...sx(placesPage.sd2d12d59)} aria-hidden />
            Google Maps
          </a>
        )}
        {kakaoUrl && (
          <a
            href={kakaoUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...sx(placesPage.sf168e15a)}
            aria-label={`View ${place.name} on Kakao Maps (opens in new tab)`}
          >
            <ExternalLink {...sx(placesPage.sd2d12d59)} aria-hidden />
            Kakao
          </a>
        )}
      </div>
    </motion.article>
  )
}

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  const reduce = useReducedMotion()
  // Color states stay in Tailwind classes (transition-colors handles the
  // crossfade with dark-mode tokens preserved). The spring is purely for
  // the confidence-inspiring scale nudge when toggled.
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={false}
      animate={reduce ? undefined : { scale: active ? 1.04 : 1 }}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      transition={reduce ? { duration: 0 } : CHIP_SPRING}
      style={{ transformOrigin: 'center' }}
      {...sx(
        placesPage.filterChipBase,
        active ? placesPage.filterChipActive : placesPage.filterChipInactive,
      )}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Places({
  days = KOREA_DAYS,
  ingestTo = "/trips/korea-2026?ingest=1#trip-ingest",
}: {
  days?: PlaceDayOption[]
  ingestTo?: string
} = {}) {
  // Short-circuit if Clerk wasn't baked into this build — no token, no API.
  if (!clerkEnabled) {
    return (
      <div {...sx(placesPage.s102510f7)}>
        <h1 {...sx(placesPage.s48778e8d)}>
          Places
        </h1>
        <div {...sx(placesPage.sad760a96)}>
          <p {...sx(placesPage.sb09a9ba6)}>
            Frontend build is missing Clerk configuration
          </p>
          <p {...sx(placesPage.s33458c)}>
            This build was produced without <code {...sx(placesPage.sd81d42ba)}>VITE_CLERK_PUBLISHABLE_KEY</code>,
            so the page can&apos;t sign requests against the API.
          </p>
          <p {...sx(placesPage.s33458d)}>
            Set <code {...sx(placesPage.sd81d42ba)}>VITE_CLERK_PUBLISHABLE_KEY=pk_live_…</code> in
            the build environment and rebuild the frontend
            (<code {...sx(placesPage.sd81d42ba)}>cd frontend &amp;&amp; bun run build</code>).
          </p>
        </div>
      </div>
    )
  }
  return <PlacesImpl days={days} ingestTo={ingestTo} />
}

function PlacesImpl({ days, ingestTo }: { days: PlaceDayOption[]; ingestTo: string }) {
  const getToken = useGetToken()
  const reduce = useReducedMotion()

  const [places, setPlaces] = useState<ExtractedPlace[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [activeBand, setActiveBand] = useState<Band | null>(null)
  const [activeBusyness, setActiveBusyness] = useState<BusynessLevel | null>(null)
  const [offset, setOffset] = useState(0)

  const readToken = useLatestCallback(getToken)
  const [isRefreshing, startTransition] = useTransition()
  const loadSeq = useRef(0)

  const searchRef = useRef(search)
  searchRef.current = search

  // Debounced search — 80 ms is tight enough that the FLIP feels like a
  // direct response to keystrokes, but long enough to coalesce a burst
  // of keypresses into one fetch.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 80)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(async (opts: {
    category: Category | null
    band: Band | null
    busyness: BusynessLevel | null
    q: string
    offset: number
    append: boolean
  }) => {
    const { append, ...queryOpts } = opts
    const seq = ++loadSeq.current
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchExtractedPlaces(readToken, {
        limit: PAGE_SIZE,
        offset: queryOpts.offset,
        category: queryOpts.category ?? undefined,
        band: queryOpts.band ?? undefined,
        busyness: queryOpts.busyness ?? undefined,
        q: queryOpts.q || undefined,
      })
      if (seq !== loadSeq.current) return
      startTransition(() => {
        if (append) {
          setPlaces((prev) => [...prev, ...data.places])
        } else {
          setPlaces(data.places)
          setOffset(0)
        }
        setTotal(data.total)
        setHasMore(data.hasMore)
        setLoading(false)
        setLoadingMore(false)
      })
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(err instanceof Error ? err.message : 'Failed to load places')
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Reload when filters change (not on initial mount — handled separately)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      void load({ category: null, band: null, busyness: null, q: '', offset: 0, append: false })
      return
    }
    setOffset(0)
    void load({ category: activeCategory, band: activeBand, busyness: activeBusyness, q: debouncedSearch, offset: 0, append: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeBand, activeBusyness, debouncedSearch, load])

  // Refresh when the tab regains focus — covers the common case of
  // submitting a URL on /korea/ingest, switching back to /korea/places, and
  // expecting newly-extracted places to appear without a manual reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void load({ category: activeCategory, band: activeBand, busyness: activeBusyness, q: debouncedSearch, offset: 0, append: false })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeBand, activeBusyness, debouncedSearch, load])

  function handleLoadMore() {
    const nextOffset = offset + places.length
    setOffset(nextOffset)
    void load({ category: activeCategory, band: activeBand, busyness: activeBusyness, q: debouncedSearch, offset: nextOffset, append: true })
  }

  function clearFilters() {
    setActiveCategory(null)
    setActiveBand(null)
    setActiveBusyness(null)
    setSearch('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = activeCategory != null || activeBand != null || activeBusyness != null || search !== ''
  const flaggedCount = places.filter((p) => p.geocode_disagree).length

  // Smoothly tween the displayed counter rather than swapping the number
  // outright — keeps the count visually in sync with the FLIP rearrangement.
  // Reduced motion snaps.
  const animatedTotal = useTweenNumber(total, 320, { reducedMotion: !!reduce })

  return (
    <div {...sx(placesPage.sc0a5fd9d)} aria-busy={loading || isRefreshing}>
      {/* Page header — see Ingest.tsx note on initial={false}. */}
      <motion.header
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div {...sx(placesPage.s9a3eba29)}>
          <div>
            <p {...sx(placesPage.s94efdd3)}>
              <Link
                to={ingestTo}
                {...sx(placesPage.s1cf029cf)}
                aria-label="Add Instagram places to this trip"
              >
                <ArrowLeft {...sx(placesPage.scd31254b)} aria-hidden />
                Ingest
              </Link>
              <span aria-hidden {...sx(placesPage.s371c7b55)} />
              <span {...sx(placesPage.sc7db521f)}>IG</span>
              <span aria-hidden {...sx(placesPage.s371c7b55)} />
              Place browser
            </p>
            <h1 {...sx(placesPage.sb40f06a1)}>
              Places
            </h1>
            <p {...sx(placesPage.s71605953)} aria-live="polite">
              {loading ? (
                <span {...sx(placesPage.s28b04eb6)}>
                  <Loader2 {...sx(placesPage.s30736863, 'animate-spin')} aria-hidden />
                  Loading…
                </span>
              ) : total === 0 ? (
                'No places yet'
              ) : (
                <>
                  <span {...sx(placesPage.s3c022c12)}>{animatedTotal}</span> place{total !== 1 ? 's' : ''}
                  {flaggedCount > 0 && (
                    <>
                      <span aria-hidden {...sx(placesPage.s34f26488)}>·</span>
                      <span {...sx(placesPage.s30093f3a)}>{flaggedCount} flagged for review</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          {/* Search */}
          <div {...sx(placesPage.s8c466dcd)}>
            <label htmlFor="places-search" {...sx(placesPage.s88a3565a)}>Search places</label>
            <input
              id="places-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search places…"
              {...sx(placesPage.s73fe5241)}
              aria-label="Search extracted places by name or quote"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                {...sx(placesPage.s151ef8ff)}
              >
                <X {...sx(placesPage.sd2d12d59)} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </motion.header>

      {/* Hairline */}
      <div {...sx(placesPage.s50cf1fc5)} aria-hidden />

      {/* Filter chips */}
      <motion.section
        aria-label="Filter by category and confidence"
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.05 }}
        {...sx(placesPage.s1d170d8d)}
      >
        {/* Category row */}
        <div {...sx(placesPage.s14482158)} role="group" aria-label="Filter by category">
          <FilterChip
            label="All categories"
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          />
          {CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              label={CATEGORY_LABELS[cat]}
              active={activeCategory === cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            />
          ))}
        </div>

        {/* Band row */}
        <div {...sx(placesPage.s14482158)} role="group" aria-label="Filter by confidence band">
          <FilterChip
            label="All confidence"
            active={activeBand === null}
            onClick={() => setActiveBand(null)}
          />
          {BANDS.map((band) => (
            <FilterChip
              key={band}
              label={BAND_LABELS[band]}
              active={activeBand === band}
              onClick={() => setActiveBand(activeBand === band ? null : band)}
            />
          ))}
        </div>

        {/* Busyness row */}
        <div {...sx(placesPage.s14482158)} role="group" aria-label="Filter by busyness">
          <FilterChip
            label="Any busyness"
            active={activeBusyness === null}
            onClick={() => setActiveBusyness(null)}
          />
          {BUSYNESS_LEVELS.map((level) => (
            <FilterChip
              key={level}
              label={BUSYNESS_LABELS[level]}
              active={activeBusyness === level}
              onClick={() => setActiveBusyness(activeBusyness === level ? null : level)}
            />
          ))}
        </div>
      </motion.section>

      {/* Places list */}
      <section aria-label="Extracted places" aria-live="polite" {...sx(placesPage.s334592)}>
        {error && (
          <div
            role="alert"
            {...sx(placesPage.s531851e2)}
          >
            <span {...sx(placesPage.s13588c5b)}>{error}</span>
            <button
              type="button"
              onClick={() =>
                void load({ category: activeCategory, band: activeBand, busyness: activeBusyness, q: debouncedSearch, offset: 0, append: false })
              }
              {...sx(placesPage.se2aea60b)}
            >
              Retry
            </button>
          </div>
        )}

        {loading && !error && (
          <div {...sx(placesPage.sc7133e98)} aria-busy="true" aria-live="polite">
            {Array.from({ length: 4 }).map((_, i) => (
              <PlaceCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && !error && places.length === 0 && (
          <div {...sx(placesPage.s405de234)}>
            {hasActiveFilters ? (
              <>
                <p {...sx(placesPage.sa05ecb46)}>
                  No places match the current filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  {...sx(placesPage.sc4e2d838)}
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p {...sx(placesPage.sa05ecb46)}>
                No extracted places yet. Submit a link in{' '}
                <Link
                  to={ingestTo}
                  {...sx(placesPage.sc0508a9f)}
                >
                  Ingest
                </Link>{' '}
                to get started.
              </p>
            )}
          </div>
        )}

        {!loading && places.length > 0 && (
          // FLIP engine: LayoutGroup + AnimatePresence(popLayout) drives
          // the "feel of filtering".
          //   • cards that stay → `layout` interpolates First→Last with
          //     FLIP_SPRING when their grid position changes.
          //   • cards that exit → fade + scale via `exit` props on the
          //     card; popLayout removes them from flow so neighbors
          //     animate up immediately rather than waiting on exit.
          //   • cards that enter → fade + scale via the card's `initial`.
          // Keyed by `place.id` so motion matches cards across renders.
          <LayoutGroup>
            <motion.div layout={reduce ? false : 'position'} {...sx(placesPage.sc7133e99)}>
              <AnimatePresence initial={false} mode="popLayout">
                {places.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    getToken={readToken}
                    days={days}
                    onUpdated={(placeId, assigned) => {
                      setPlaces((prev) =>
                        prev.map((p) => p.id === placeId ? { ...p, days: assigned } : p)
                      )
                    }}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <div {...sx(placesPage.sbeb895ab)}>
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
              {...sx(placesPage.s82ccd023)}
            >
              {loadingMore ? (
                <>
                  <Loader2 {...sx(placesPage.s97416715, 'animate-spin')} aria-hidden />
                  Loading…
                </>
              ) : (
                <>Load {Math.min(PAGE_SIZE, total - places.length)} more</>
              )}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
