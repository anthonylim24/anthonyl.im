import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@clerk/clerk-react'
import { motion, useReducedMotion } from 'motion/react'
import { ExternalLink, MapPin, Phone, Star, AlertTriangle, ArrowLeft } from 'lucide-react'
import { fetchExtractedPlaces } from './placesApi'
import type { ExtractedPlace } from './placesApi'

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ['restaurant', 'cafe', 'bar', 'shopping', 'activity', 'hotel', 'landmark', 'other'] as const
type Category = typeof CATEGORIES[number]

const BANDS = ['high', 'medium', 'low'] as const
type Band = typeof BANDS[number]

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

// ── PlaceCard ─────────────────────────────────────────────────────────────────

function PlaceCard({ place, reduce }: { place: ExtractedPlace; reduce: boolean | null }) {
  const gmUrl = googleMapsUrl(place)
  const kakaoUrl = kakaoMapsUrl(place)

  return (
    <motion.article
      layout
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl border border-stone-200/80 bg-white p-5 dark:border-stone-800/80 dark:bg-stone-900/60"
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

      {/* Header: Korean name + badges */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            className="break-words text-[1.125rem] font-medium leading-snug text-stone-900 dark:text-stone-100"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {place.name}
          </h2>
          {place.name_romanized && place.name_romanized !== place.name && (
            <p className="mt-0.5 text-[13px] text-stone-500 dark:text-stone-400">
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
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <CategoryBadge category={place.category} />
          <BandBadge band={place.confidence_band} votes={place.vote_count} />
          {place.is_subject && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
              Subject
            </span>
          )}
          {place.signal_source && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
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
              <span className="break-words">{place.address}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
            {place.phone && (
              <a
                href={`tel:${place.phone}`}
                className="flex items-center gap-1 text-stone-600 hover:text-rose-700 dark:text-stone-400 dark:hover:text-rose-400"
              >
                <Phone className="h-3 w-3 shrink-0" aria-hidden />
                {place.phone}
              </a>
            )}
            {place.rating != null && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden />
                {place.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Supporting quote */}
      {place.supporting_quote && (
        <blockquote className="mt-3 border-l-2 border-rose-200 pl-3 text-[13px] italic leading-relaxed text-stone-600 dark:border-rose-900/40 dark:text-stone-400">
          "{place.supporting_quote}"
        </blockquote>
      )}

      {/* Post attribution */}
      {place.post && (
        <p className="mt-2 text-[11px] text-stone-400 dark:text-stone-500">
          {place.post.owner_username && (
            <span>
              — <span className="font-medium text-stone-500 dark:text-stone-400">@{place.post.owner_username}</span>
              {' '}
            </span>
          )}
          from a reel on {formatDate(place.post.fetched_at)}
        </p>
      )}

      {/* Action links */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {place.post && (
          <a
            href={place.post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800"
            aria-label={`View source post on Instagram (opens in new tab)`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            View on Instagram
          </a>
        )}
        {gmUrl && (
          <a
            href={gmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800"
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
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-[12px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800"
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 text-[12px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 ${
        active
          ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-400'
          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800'
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Places() {
  const { getToken } = useAuth()
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
  const [offset, setOffset] = useState(0)

  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  const searchRef = useRef(search)
  searchRef.current = search

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(async (opts: {
    category: Category | null
    band: Band | null
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
      void load({ category: null, band: null, q: '', offset: 0, append: false })
      return
    }
    setOffset(0)
    void load({ category: activeCategory, band: activeBand, q: debouncedSearch, offset: 0, append: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, activeBand, debouncedSearch, load])

  function handleLoadMore() {
    const nextOffset = offset + places.length
    setOffset(nextOffset)
    void load({ category: activeCategory, band: activeBand, q: debouncedSearch, offset: nextOffset, append: true })
  }

  function clearFilters() {
    setActiveCategory(null)
    setActiveBand(null)
    setSearch('')
    setDebouncedSearch('')
  }

  const hasActiveFilters = activeCategory != null || activeBand != null || search !== ''
  const flaggedCount = places.filter((p) => p.geocode_disagree).length

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Page header */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
              <Link
                to="/korea/ingest"
                className="inline-flex items-center gap-1 text-stone-400 transition hover:text-rose-600 dark:text-stone-500 dark:hover:text-rose-400"
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
            <p className="mt-1.5 text-[13px] text-stone-500 dark:text-stone-400">
              {loading
                ? 'Loading…'
                : total === 0
                  ? 'No places yet'
                  : (
                    <>
                      <span className="font-medium text-stone-700 dark:text-stone-300">{total}</span> place{total !== 1 ? 's' : ''}
                      {flaggedCount > 0 && (
                        <>
                          <span aria-hidden className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                          <span className="text-amber-600 dark:text-amber-400">{flaggedCount} flagged for review</span>
                        </>
                      )}
                    </>
                  )
              }
            </p>
          </div>

          {/* Search */}
          <div className="w-full sm:w-64">
            <label htmlFor="places-search" className="sr-only">Search places</label>
            <input
              id="places-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search places…"
              className="w-full min-h-[44px] rounded-xl border border-stone-300 bg-white px-4 py-2 text-[13px] text-stone-900 placeholder-stone-400 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-600 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
              aria-label="Search extracted places by name or quote"
            />
          </div>
        </div>
      </motion.header>

      {/* Hairline */}
      <div className="mt-6 border-b border-stone-200/80 dark:border-stone-800/80" aria-hidden />

      {/* Filter chips */}
      <motion.section
        aria-label="Filter by category and confidence"
        initial={reduce ? false : { opacity: 0, y: 4 }}
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
      </motion.section>

      {/* Places list */}
      <section aria-label="Extracted places" aria-live="polite" className="mt-8">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {loading && !error && (
          <div className="flex min-h-[140px] items-center justify-center">
            <p className="text-[13px] text-stone-400 dark:text-stone-600" aria-live="polite" aria-busy="true">
              Loading places…
            </p>
          </div>
        )}

        {!loading && !error && places.length === 0 && (
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-6 py-10 text-center dark:border-stone-800 dark:bg-stone-900/30">
            {hasActiveFilters ? (
              <>
                <p className="text-[14px] text-stone-500 dark:text-stone-400">No matches.</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-[13px] font-medium text-stone-600 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <p className="text-[14px] text-stone-500 dark:text-stone-400">
                No extracted places yet. Submit a link in{' '}
                <Link to="/korea/ingest" className="text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">
                  Ingest
                </Link>{' '}
                to get started.
              </p>
            )}
          </div>
        )}

        {!loading && places.length > 0 && (
          <div className="space-y-4">
            {places.map((place) => (
              <PlaceCard key={place.id} place={place} reduce={reduce} />
            ))}
          </div>
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              aria-busy={loadingMore}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-2.5 text-[13px] font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              {loadingMore ? 'Loading…' : `Load ${PAGE_SIZE} more`}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
