import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

// Spring curves reused by the chips and cards — match the shared
// cubic-bezier(0.16, 1, 0.3, 1) feel from the design system but tuned for
// small-displacement motion. `stiffness` is high enough to feel responsive,
// `damping` keeps it from oscillating on the second hop.
const FLIP_SPRING = { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.6 }
const CHIP_SPRING = { type: 'spring' as const, stiffness: 600, damping: 30, mass: 0.4 }

// ── Hooks ─────────────────────────────────────────────────────────────────────

// True only on desktops with a real pointer at >=md (Tailwind's 768 px). Mobile
// is touch-first; we don't want a hover-lift firing under a finger.
function useDesktopHoverCapable(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)')
    const update = () => setOk(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return ok
}

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
const KOREA_DAYS: Array<{ n: number; date: string; label: string }> = [
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
  const styles: Record<Category, string> = {
    restaurant: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
    cafe: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    bar: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
    shopping: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
    activity: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    hotel: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400',
    landmark: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    other: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-500',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  )
}

function BandBadge({ band, votes }: { band: Band; votes?: number }) {
  const styles: Record<Band, string> = {
    high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    low: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[band]}`}>
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
}

// Approximate dialog height for placement decisions — kept conservative so a
// nearly-full dropdown still gets flipped above the trigger if the viewport
// would clip it. Refined after first paint via the dialog's measured rect.
const DAY_DIALOG_ESTIMATED_HEIGHT = 360

function DayAssignButton({ place, getToken, onUpdated }: DayAssignButtonProps) {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // (each card creates one via willChange:transform + motion's layout
  // transforms), so it must be positioned manually relative to the viewport.
  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    window.addEventListener('scroll', update, true)
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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setPendingDays(new Set(place.days ?? [])); setOpen((v) => !v) }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={hasAssignment ? `Assigned to ${assignedDays.map(n => `Day ${n}`).join(', ')}. Change days` : 'Add to days'}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-stone-900 ${
          hasAssignment
            ? 'border-rose-300 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60'
            : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800'
        }`}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
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
              className="z-[100] w-64 max-w-[calc(100vw-1rem)] rounded-2xl border border-stone-200 bg-white p-3 shadow-xl ring-1 ring-stone-200/60 dark:border-stone-800 dark:bg-stone-950 dark:ring-stone-800"
            >
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
                Assign to days
              </p>
              <fieldset>
                <legend className="sr-only">Select days for {place.name}</legend>
                <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                  {KOREA_DAYS.map((day) => {
                    const checked = pendingDays.has(day.n)
                    return (
                      <label
                        key={day.n}
                        className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-stone-50 focus-within:ring-2 focus-within:ring-rose-400/40 dark:hover:bg-stone-900"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDay(day.n)}
                          className="h-4 w-4 shrink-0 accent-rose-600 focus:outline-none"
                          aria-label={day.label}
                        />
                        <span className="text-[12px] text-stone-800 dark:text-stone-200">{day.label}</span>
                        {checked && <Check className="ml-auto h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              {error && (
                <p role="alert" className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-400">{error}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  aria-busy={saving}
                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-500 dark:hover:bg-rose-400"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] font-medium text-stone-600 transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-900"
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
}: {
  place: ExtractedPlace
  getToken: () => Promise<string | null>
  onUpdated: (placeId: number, days: number[]) => void
}) {
  const reduce = useReducedMotion()
  const gmUrl = googleMapsUrl(place)
  const kakaoUrl = kakaoMapsUrl(place)

  // Hover lift on ≥md with a real pointer only — touch devices skip it.
  const isDesktopHoverCapable = useDesktopHoverCapable()

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
      style={{ willChange: 'transform' }}
      className="relative rounded-2xl border border-stone-200/80 bg-white p-5 transition-colors dark:border-stone-800/80 dark:bg-stone-900/60"
      aria-label={`Place: ${place.name}`}
    >
      {/* Geocode-disagree warning banner */}
      {place.geocode_disagree && (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-950/30 dark:text-red-400"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Coordinates disagree between Google + Kakao — review
        </div>
      )}

      {/* Header: Korean name + badges. Stack the badges below the title
          on narrow viewports — at mobile widths, the four badges plus a
          long Latin/Hangul name compete for the same row and the title
          column collapses to a single-character ribbon. sm: and up,
          badges sit to the right as before. */}
      <div className="flex flex-col gap-y-2 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
        <div className="min-w-0 sm:flex-1">
          <h2
            className="inline-flex flex-wrap items-baseline gap-x-1.5 text-[1.125rem] font-medium leading-snug text-stone-900 break-words dark:text-stone-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            <span>{place.name}</span>
            {place.post && (
              <a
                href={place.post.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${place.name} on Instagram (opens in new tab)`}
                className="-mx-1 inline-flex h-6 w-6 items-center justify-center rounded text-stone-400 transition hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:text-stone-500 dark:hover:text-rose-400"
              >
                <IgIcon className="h-4 w-4" aria-hidden />
              </a>
            )}
          </h2>
          {place.name_romanized && place.name_romanized !== place.name && (
            <p className="mt-0.5 text-[13px] leading-snug text-stone-500 break-words dark:text-stone-400">
              {place.name_romanized}
              {place.city && (
                <span className="text-stone-400 dark:text-stone-500"> · {place.city}</span>
              )}
            </p>
          )}
          {!place.name_romanized && place.city && (
            <p className="mt-0.5 text-[13px] text-stone-400 dark:text-stone-500">{place.city}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
          <CategoryBadge category={place.category} />
          <BandBadge band={place.confidence_band} votes={place.vote_count} />
          {place.busyness && <BusynessBadge busyness={place.busyness} />}
          {place.is_subject && (
            <span
              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/40"
              title="Primary subject of the post"
            >
              Subject
            </span>
          )}
          {place.signal_source && (
            <span
              className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400"
              title={`Signal source: ${SIGNAL_SOURCE_LABELS[place.signal_source] ?? place.signal_source}`}
            >
              {SIGNAL_SOURCE_LABELS[place.signal_source] ?? place.signal_source}
            </span>
          )}
        </div>
      </div>

      {/* Address / contact / rating */}
      {(place.address || place.phone || place.rating != null) && (
        <div className="mt-3 space-y-1 text-[13px] text-stone-600 dark:text-stone-400">
          {place.address && (
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{place.address}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
            {place.phone && (
              <a
                href={`tel:${place.phone}`}
                className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-stone-600 transition hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:text-stone-400 dark:hover:text-rose-400"
              >
                <Phone className="h-3 w-3 shrink-0" aria-hidden />
                {place.phone}
              </a>
            )}
            {place.rating != null && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" aria-label={`Rating ${place.rating.toFixed(1)} out of 5`}>
                <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Supporting quote */}
      {place.supporting_quote && (
        <blockquote className="mt-3 border-l-2 border-rose-200 pl-3 text-[13px] italic leading-relaxed text-stone-600 [overflow-wrap:anywhere] dark:border-rose-900/40 dark:text-stone-400">
          &ldquo;{place.supporting_quote}&rdquo;
        </blockquote>
      )}

      {/* Post attribution */}
      {place.post && (
        <p className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
          {place.post.owner_username && (
            <span>
              &mdash;{' '}
              <a
                href={`https://instagram.com/${place.post.owner_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="-mx-0.5 rounded px-0.5 font-medium text-stone-500 transition hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:text-stone-400 dark:hover:text-rose-400"
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
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DayAssignButton place={place} getToken={getToken} onUpdated={onUpdated} />
        {place.post && (
          <a
            href={place.post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition active:scale-[0.98] hover:border-stone-300 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label="View source post on Instagram (opens in new tab)"
          >
            <IgIcon className="h-3.5 w-3.5" aria-hidden />
            View on Instagram
          </a>
        )}
        {gmUrl && (
          <a
            href={gmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition active:scale-[0.98] hover:border-stone-300 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label={`View ${place.name} on Google Maps (opens in new tab)`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Google Maps
          </a>
        )}
        {kakaoUrl && (
          <a
            href={kakaoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition active:scale-[0.98] hover:border-stone-300 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label={`View ${place.name} on Kakao Maps (opens in new tab)`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
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
      className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 text-[12px] font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 ${
        active
          ? 'border-rose-300 bg-rose-50 text-rose-700 shadow-[0_0_0_1px_rgba(244,63,94,0.08)_inset] hover:border-rose-400 hover:bg-rose-100 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60'
          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800'
      }`}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Places() {
  // Short-circuit if Clerk wasn't baked into this build — no token, no API.
  if (!clerkEnabled) {
    return (
      <div className="korea mx-auto max-w-2xl px-5 py-16">
        <h1
          className="font-serif text-3xl text-stone-900 dark:text-stone-100"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Places
        </h1>
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-[13px] leading-relaxed text-stone-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-stone-200">
          <p className="font-semibold text-red-800 dark:text-red-300">
            Frontend build is missing Clerk configuration
          </p>
          <p className="mt-2">
            This build was produced without <code className="font-mono text-[12px]">VITE_CLERK_PUBLISHABLE_KEY</code>,
            so the page can&apos;t sign requests against the API.
          </p>
          <p className="mt-3">
            Set <code className="font-mono text-[12px]">VITE_CLERK_PUBLISHABLE_KEY=pk_live_…</code> in
            the build environment and rebuild the frontend
            (<code className="font-mono text-[12px]">cd frontend &amp;&amp; bun run build</code>).
          </p>
        </div>
      </div>
    )
  }
  return <PlacesImpl />
}

function PlacesImpl() {
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

  // Latest-value refs — the long-lived load() callback reads these without
  // re-binding identity on every render.
  /* eslint-disable react-hooks/refs */
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  const searchRef = useRef(search)
  searchRef.current = search
  /* eslint-enable react-hooks/refs */

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
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const data = await fetchExtractedPlaces(getTokenRef.current, {
        limit: PAGE_SIZE,
        offset: queryOpts.offset,
        category: queryOpts.category ?? undefined,
        band: queryOpts.band ?? undefined,
        busyness: queryOpts.busyness ?? undefined,
        q: queryOpts.q || undefined,
      })
      if (append) {
        setPlaces((prev) => [...prev, ...data.places])
      } else {
        setPlaces(data.places)
        setOffset(0)
      }
      setTotal(data.total)
      setHasMore(data.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load places')
    } finally {
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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Page header — see Ingest.tsx note on initial={false}. */}
      <motion.header
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
              <Link
                to="/korea/ingest"
                className="-mx-0.5 inline-flex items-center gap-1 rounded px-0.5 text-stone-400 transition hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:text-stone-500 dark:hover:text-rose-400"
                aria-label="Back to Ingest"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden />
                Ingest
              </Link>
              <span aria-hidden className="mx-2 inline-block h-px w-6 align-middle bg-stone-300 dark:bg-stone-700" />
              <span className="text-rose-600 dark:text-rose-400">IG</span>
              <span aria-hidden className="mx-2 inline-block h-px w-6 align-middle bg-stone-300 dark:bg-stone-700" />
              Place browser
            </p>
            <h1
              className="mt-2 font-serif text-[clamp(1.75rem,4.5vw,2.75rem)] font-medium leading-[1.08] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Extracted Places
            </h1>
            <p className="mt-1.5 text-[13px] text-stone-500 dark:text-stone-400" aria-live="polite">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Loading…
                </span>
              ) : total === 0 ? (
                'No places yet'
              ) : (
                <>
                  <span className="font-medium text-stone-700 dark:text-stone-300 tabular-nums">{animatedTotal}</span> place{total !== 1 ? 's' : ''}
                  {flaggedCount > 0 && (
                    <>
                      <span aria-hidden className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                      <span className="text-amber-600 dark:text-amber-400">{flaggedCount} flagged for review</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <label htmlFor="places-search" className="sr-only">Search places</label>
            <input
              id="places-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search places…"
              className="min-h-[44px] w-full rounded-xl border border-stone-300 bg-white px-4 py-2 pr-10 text-[13px] text-stone-900 placeholder-stone-400 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-600 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
              aria-label="Search extracted places by name or quote"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </motion.header>

      {/* Hairline */}
      <div className="mt-6 border-b border-stone-200/80 dark:border-stone-800/80" aria-hidden />

      {/* Filter chips */}
      <motion.section
        aria-label="Filter by category and confidence"
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.05 }}
        className="mt-5 space-y-2.5"
      >
        {/* Category row */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
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
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by confidence band">
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
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by busyness">
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
      <section aria-label="Extracted places" aria-live="polite" className="mt-8">
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400"
          >
            <span className="break-words">{error}</span>
            <button
              type="button"
              onClick={() =>
                void load({ category: activeCategory, band: activeBand, busyness: activeBusyness, q: debouncedSearch, offset: 0, append: false })
              }
              className="inline-flex min-h-[36px] items-center rounded-lg border border-red-300/70 bg-white/60 px-3 py-1 text-[12px] font-medium text-red-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
            >
              Retry
            </button>
          </div>
        )}

        {loading && !error && (
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            {Array.from({ length: 4 }).map((_, i) => (
              <PlaceCardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && !error && places.length === 0 && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-6 py-10 text-center dark:border-stone-800 dark:bg-stone-900/30">
            {hasActiveFilters ? (
              <>
                <p className="text-[14px] text-stone-500 dark:text-stone-400">
                  No places match the current filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p className="text-[14px] text-stone-500 dark:text-stone-400">
                No extracted places yet. Submit a link in{' '}
                <Link
                  to="/korea/ingest"
                  className="rounded text-rose-600 underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 dark:text-rose-400"
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
            <motion.div layout={reduce ? false : 'position'} className="space-y-4">
              <AnimatePresence initial={false} mode="popLayout">
                {places.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    getToken={getToken}
                    onUpdated={(placeId, days) => {
                      setPlaces((prev) =>
                        prev.map((p) => p.id === placeId ? { ...p, days } : p)
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
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-[13px] font-medium text-stone-700 transition active:scale-[0.98] hover:border-stone-400 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
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
