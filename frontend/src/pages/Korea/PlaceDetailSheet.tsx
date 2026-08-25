import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { placeDetailSheet } from './PlaceDetailSheet.stylex'
import { markerStyles } from './korea.stylex'
import { useEffect, useMemo, useRef, useState } from "react"
import {
  motion,
  AnimatePresence,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from "motion/react"
import { Navigation, ExternalLink, X, Share2, Footprints, ChevronUp, ChevronDown } from "lucide-react"
import { IgIcon } from "./IgIcon"
import type { RankedPlace } from "./mapModeTypes"
import { BusynessBadge } from "./BusynessBadge"
import { lookupGooglePlacePhoto, lookupPhoto, formatWalkingTime } from "./placePhoto"
import { useNeighborhoodLabel } from "./allKoreaDongs"

type SheetMode = "compact" | "expanded"

interface PlaceDetailSheetProps {
  place: RankedPlace
  onClose: () => void
  userLat?: number
  userLng?: number
  /** Initial mode the sheet opens in. Default "compact" so the orb focus
   *  state stays visible; the list view passes "expanded" since there's
   *  no focus state behind it to preserve. */
  initialMode?: SheetMode
}

// Sheet heights — compact peeks just enough to preserve the Map Mode
// focus state (line + distance + dim) above; expanded reclaims most of
// the viewport for the full details.
const SHEET_MAX_HEIGHT = {
  compact: "26vh",
  expanded: "78vh",
} as const

export function PlaceDetailSheet({ place, onClose, userLat, userLng, initialMode = "compact" }: PlaceDetailSheetProps) {
  const reduce = useReducedMotion()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(true)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [shared, setShared] = useState(false)
  // Sheet opens in the initialMode the caller chose: "compact" (default)
  // so the orb focus state stays visible above the peek; "expanded" when
  // the selection came from the list view, where there's no focus state
  // behind the sheet to preserve.
  const [mode, setMode] = useState<SheetMode>(initialMode)

  // Reset mode when a new place is selected — the user's previous
  // expanded/compact state shouldn't leak across selections.
  useEffect(() => {
    setMode(initialMode)
  }, [place.id, initialMode])

  // ── Drag-to-close / drag-to-collapse ─────────────────────────────────
  //
  // Motion's drag layer is driven by a useDragControls instance so we can
  // gate it: drag only starts when the inner scroll container is at top
  // (native iOS sheet feel — scroll first, then continued downward swipe
  // pulls the sheet down).
  const dragControls = useDragControls()
  const scrollRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)

  function maybeStartDrag(e: React.PointerEvent<HTMLDivElement>) {
    const el = scrollRef.current
    // Always allow drag from the visible handle (the small pill at the
    // top). Otherwise, only start a drag when the scroll is at top.
    const handle = (e.target as HTMLElement | null)?.closest("[data-sheet-handle]")
    if (handle) {
      dragControls.start(e, { snapToCursor: false })
      return
    }
    if (el && el.scrollTop <= 0) {
      dragControls.start(e, { snapToCursor: false })
    }
  }

  function onDragEnd(_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    // Down-drag thresholds: ~110 px OR hard flick (>500 px/s).
    // - In expanded mode, a soft pull-down collapses to compact (a
    //   second pull from compact closes); a hard flick closes
    //   immediately.
    // - In compact mode, any qualifying down-drag closes.
    // Up-drag from compact expands to full at ~60 px / >400 px/s.
    if (info.offset.y > 110 || info.velocity.y > 500) {
      if (mode === "expanded" && info.velocity.y < 1000 && info.offset.y < 220) {
        setMode("compact")
      } else {
        onClose()
      }
      return
    }
    if (mode === "compact" && (info.offset.y < -60 || info.velocity.y < -400)) {
      setMode("expanded")
    }
  }

  const walking = useMemo(() => formatWalkingTime(place.distanceMeters), [place.distanceMeters])
  // Dong-level neighborhood (e.g. "강남구 압구정동"). Resolved from the
  // place's lat/lng via the all-Seoul+Busan dong dataset.
  const placeNeighborhood = useNeighborhoodLabel(place.lat, place.lng)

  // Photo lookup cascade. Google Places is the primary source (real
  // user-submitted photos of the actual business); Wikipedia is the
  // fallback for landmarks and a final resort when Google isn't
  // configured or doesn't find the place; the server-provided
  // place.photoUrl is the last-line backup.
  useEffect(() => {
    let cancelled = false
    setPhotoLoading(true)
    setPhotoFailed(false)
    const titles = [
      place.name.replace(/\s*\([^)]+\)\s*/g, "").trim(),
      place.name.split("·")[0].trim(),
      place.name.split("(")[0].trim(),
    ].filter(Boolean)

    void (async () => {
      try {
        // Bottom-sheet hero renders at ~600 px wide. Both sources serve
        // an 800 px-wide thumbnail (sharp at retina without exceeding
        // the 1 MB byte budget).
        const googleUrl = await lookupGooglePlacePhoto({
          name: place.name,
          city: place.city,
          lat: place.lat,
          lng: place.lng,
          maxWidth: 800,
        })
        if (cancelled) return
        if (googleUrl) {
          setPhotoUrl(googleUrl)
          setPhotoLoading(false)
          return
        }
        const wikiUrl = await lookupPhoto(titles, { size: 800 })
        if (cancelled) return
        setPhotoUrl(wikiUrl ?? place.photoUrl)
        setPhotoLoading(false)
      } catch {
        if (cancelled) return
        setPhotoUrl(place.photoUrl)
        setPhotoLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [place.id, place.name, place.city, place.lat, place.lng, place.photoUrl])

  const directionsUrl = useMemo(() => {
    const origin = userLat && userLng ? `${userLat},${userLng}` : ""
    const destination = `${place.lat},${place.lng}`
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&destination_place_id=${encodeURIComponent(place.name)}`
  }, [place, userLat, userLng])

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(place.name + ", " + place.city)}`

  // Clean up the "Shared!" feedback timer if the user navigates away
  // before it fires — otherwise React warns about state on an
  // unmounted component.
  const sharedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current)
    }
  }, [])

  async function onShare() {
    const text = `${place.name} — ${place.description}`
    function flashShared() {
      setShared(true)
      if (sharedTimerRef.current) clearTimeout(sharedTimerRef.current)
      sharedTimerRef.current = setTimeout(() => setShared(false), 2500)
    }
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: place.name, text, url: searchUrl })
        flashShared()
        return
      } catch {
        /* fall through to clipboard */
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${text}\n${searchUrl}`)
        flashShared()
      } catch {
        /* no-op */
      }
    }
  }

  function toggleMode() {
    setMode((m) => (m === "compact" ? "expanded" : "compact"))
  }

  return (
    <motion.div
      role="dialog"
      aria-label={place.name}
      initial={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      animate={{
        y: 0,
        opacity: 1,
        maxHeight: SHEET_MAX_HEIGHT[mode],
      }}
      exit={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      style={{ y, touchAction: "pan-y" }}
      drag={reduce ? false : "y"}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      // Allow a touch of upward elastic in compact so the gesture to
      // expand reads naturally.
      dragElastic={mode === "compact" ? { top: 0.4, bottom: 0.6 } : { top: 0, bottom: 0.6 }}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      onPointerDown={reduce ? undefined : maybeStartDrag}
      {...sx(placeDetailSheet.sc7e2988d)}
    >
      {/* Drag handle — larger touch target than the visible pill, so a
          tap-down anywhere in the top strip can pull the sheet down. */}
      <div
        data-sheet-handle
        role="presentation"
        aria-hidden
        {...sx(placeDetailSheet.s17b2365b)}
      >
        <div {...sx(placeDetailSheet.sdfadf75b)} />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {mode === "compact" ? (
          <motion.div
            key="compact"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            {...sx(placeDetailSheet.s2804882a)}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <CompactBody
              place={place}
              walking={walking}
              directionsUrl={directionsUrl}
              neighborhood={placeNeighborhood}
              onExpand={toggleMode}
              onClose={onClose}
            />
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            ref={scrollRef}
            {...sx(placeDetailSheet.s6fd3804)}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            <div {...sx(placeDetailSheet.se99caeca)}>
              <div
                aria-hidden
                {...sx(placeDetailSheet.s7998c83b)}
                style={{
                  background: place.color + "33",
                  // Mirror of the CompactBody morph target so the
                  // view-transition-name follows the icon block across
                  // mode toggles and through expanded-initial opens.
                  viewTransitionName: "place-detail-morph",
                }}
              >
                {place.icon}
              </div>
              <div {...sx(placeDetailSheet.se30fd43e)}>
                <div {...sx(placeDetailSheet.sf5684841)}>
                  <h2 {...sx(placeDetailSheet.s42c67f3a)}>
                    {place.name}
                  </h2>
                  {place.instagramUrl && (
                    <a
                      href={place.instagramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${place.name} on Instagram (opens in new tab)`}
                      {...sx(placeDetailSheet.s6556428b)}
                    >
                      <IgIcon style={placeDetailSheet.sd2d12d59} aria-hidden />
                    </a>
                  )}
                  <PriorityPill priority={place.priority} />
                </div>
                <p {...sx(placeDetailSheet.sf516b1b6)}>
                  <span {...sx(placeDetailSheet.s96c27eec)}>{place.category}</span> · {place.city}
                  {place.distanceLabel ? ` · ${place.distanceLabel}` : ""}
                  {walking ? ` · ${walking}` : ""}
                </p>
                {place.subcategory === "instagram" && (
                  <p {...sx(placeDetailSheet.sf6d08cdc)}>
                    From Instagram{place.instagramShortcode ? ` · @${place.instagramShortcode}` : ""}
                  </p>
                )}
              </div>
              <div {...sx(placeDetailSheet.s7cc08f70)}>
                <button
                  type="button"
                  onClick={toggleMode}
                  aria-label="Collapse details"
                  title="Collapse details"
                  {...sx(placeDetailSheet.sbdd8e690)}
                >
                  <ChevronDown {...sx(placeDetailSheet.scd3f3ccd)} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close details"
                  {...sx(placeDetailSheet.sbdd8e690)}
                >
                  <X {...sx(placeDetailSheet.scd3f3ccd)} />
                </button>
              </div>
            </div>

            {/* Photo */}
            <div
              {...sx(placeDetailSheet.s6f6b1c71)}
              style={{ aspectRatio: "3 / 2" }}
            >
              {photoLoading && (
                <div {...sx(placeDetailSheet.sa6125807, 'animate-pulse')} />
              )}
              {photoUrl && !photoFailed && (
                <img
                  src={photoUrl}
                  alt={place.name}
                  loading="lazy"
                  {...sx(placeDetailSheet.s2b57d061)}
                  onLoad={() => setPhotoLoading(false)}
                  onError={() => {
                    setPhotoFailed(true)
                    setPhotoLoading(false)
                  }}
                />
              )}
              {photoFailed && (
                <div
                  {...sx(placeDetailSheet.s4b5594d8)}
                  style={{
                    background: `linear-gradient(135deg, ${place.color}55 0%, ${place.color}22 100%)`,
                  }}
                >
                  {place.icon}
                </div>
              )}
            </div>

            {/* Description */}
            <p {...sx(placeDetailSheet.sc58ce75b)}>{place.description}</p>

            {/* Busyness badge */}
            {place.busyness && (
              <div {...sx(placeDetailSheet.s33458d)}>
                <BusynessBadge busyness={place.busyness} size="md" />
              </div>
            )}

            {/* Meta rows */}
            <div {...sx(placeDetailSheet.s2e94070c)}>
              {placeNeighborhood && <Row icon="🧭" label="Neighborhood" value={placeNeighborhood} />}
              {place.address && <Row icon="📍" label="Address" value={place.address} />}
              {place.openingHours && <Row icon="🕒" label="Hours" value={place.openingHours} />}
              {place.notice && (
                <Row
                  icon="⚠️"
                  label="Notice"
                  value={place.notice}
                  {...sx(placeDetailSheet.sc46c6a3a)}
                />
              )}
              {walking && (
                <Row
                  icon={<Footprints {...sx(placeDetailSheet.sd2d12d59)} aria-hidden />}
                  label="Walking"
                  value={`${walking}${place.distanceLabel ? ` · ${place.distanceLabel}` : ""}`}
                />
              )}
              <Row icon="✨" label="Why" value={place.reason} />
              {place.reservationTime && <Row icon="📌" label="Booked" value={place.reservationTime} />}
            </div>

            {/* Actions */}
            <div {...sx(placeDetailSheet.sd8d795c3)}>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                {...sx(placeDetailSheet.s5a7c52d4)}
              >
                <Navigation {...sx(placeDetailSheet.scd3f3ccd)} aria-hidden />
                Directions
              </a>
              <a
                href={searchUrl}
                target="_blank"
                rel="noreferrer"
                {...sx(placeDetailSheet.scadf1a4f)}
              >
                <ExternalLink {...sx(placeDetailSheet.scd3f3ccd)} aria-hidden />
                Open in Maps
              </a>
              {place.instagramUrl && (
                <a
                  href={place.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View source post on Instagram (opens in new tab)`}
                  {...sx(placeDetailSheet.scadf1a4f)}
                >
                  <IgIcon style={placeDetailSheet.scd3f3ccd} aria-hidden />
                  Instagram
                </a>
              )}
              <button
                type="button"
                onClick={onShare}
                {...sx(placeDetailSheet.scadf1a4f)}
              >
                <Share2 {...sx(placeDetailSheet.scd3f3ccd)} aria-hidden />
                {shared ? "Shared!" : "Share"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function CompactBody({
  place,
  walking,
  directionsUrl,
  neighborhood,
  onExpand,
  onClose,
}: {
  place: RankedPlace
  walking: string | null
  directionsUrl: string
  neighborhood: string | null
  onExpand: () => void
  onClose: () => void
}) {
  return (
    <>
      <div {...sx(placeDetailSheet.se99caeca)}>
        <div
          aria-hidden
          {...sx(placeDetailSheet.sf67f94db)}
          style={{
            background: place.color + "33",
            // Morph target for the orb → sheet View Transition. When the
            // overlay starts the transition, the page-level stand-in
            // carries the same view-transition-name, so the browser
            // morphs the orb stand-in's bounding box into this colored
            // icon tile. No-op when View Transitions aren't running.
            viewTransitionName: "place-detail-morph",
          }}
        >
          {place.icon}
        </div>
        <div {...sx(placeDetailSheet.se30fd43e)}>
          <div {...sx(placeDetailSheet.sf5684841)}>
            <h2 {...sx(placeDetailSheet.s861754e5)}>
              {place.name}
            </h2>
            {place.instagramUrl && (
              <a
                href={place.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${place.name} on Instagram (opens in new tab)`}
                {...sx(placeDetailSheet.s6556428b)}
              >
                <IgIcon style={placeDetailSheet.scd31254b} aria-hidden />
              </a>
            )}
            <PriorityPill priority={place.priority} />
          </div>
          <p {...sx(placeDetailSheet.s52e6bc97)}>
            <span {...sx(placeDetailSheet.s96c27eec)}>{place.category}</span> · {place.city}
            {place.distanceLabel ? ` · ${place.distanceLabel}` : ""}
            {walking ? ` · ${walking}` : ""}
          </p>
          {neighborhood && (
            <p {...sx(placeDetailSheet.se30908ef)}>
              {neighborhood}
            </p>
          )}
          {place.busyness && (
            <div {...sx(placeDetailSheet.s33458b)}>
              <BusynessBadge busyness={place.busyness} size="sm" />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          {...sx(placeDetailSheet.se647c7d4)}
        >
          <X {...sx(placeDetailSheet.scd3f3ccd)} />
        </button>
      </div>
      <div {...sx(placeDetailSheet.sb3307e51)}>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          {...sx(placeDetailSheet.s2350d53)}
        >
          <Navigation {...sx(placeDetailSheet.sd2d12d59)} aria-hidden />
          Directions
        </a>
        <button
          type="button"
          onClick={onExpand}
          aria-label="View full details"
          {...sx(placeDetailSheet.s5669c35)}
        >
          <ChevronUp {...sx(placeDetailSheet.sd2d12d59)} aria-hidden />
          Details
        </button>
      </div>
    </>
  )
}

function Row({
  icon,
  label,
  value,
  style,
}: {
  icon: React.ReactNode
  label: string
  value: string
  style?: StyleXStyles
}) {
  return (
    <div {...sx(placeDetailSheet.row, style ?? placeDetailSheet.rowDefault)}>
      <span aria-hidden {...sx(placeDetailSheet.s585436ab)}>
        {icon}
      </span>
      <div {...sx(placeDetailSheet.s3f58665f)}>
        <p {...sx(placeDetailSheet.s8c250f5)}>{label}</p>
        <p {...sx(placeDetailSheet.s13588c5b)}>{value}</p>
      </div>
    </div>
  )
}

function PriorityPill({ priority }: { priority: RankedPlace["priority"] }) {
  // Priority differentiation through typographic weight + a leading dot,
  // not through a 3-color chip family. Scheduled is the loud rose; core
  // is the quieter ink dot; extra fades to stone.
  const map = {
    scheduled: {
      label: "Scheduled",
      dot: placeDetailSheet.priorityDotScheduled,
      text: placeDetailSheet.priorityScheduled,
    },
    core: {
      label: "Core",
      dot: placeDetailSheet.priorityDotCore,
      text: placeDetailSheet.priorityCore,
    },
    supplemental: {
      label: "Extra",
      dot: placeDetailSheet.priorityDotSupplemental,
      text: placeDetailSheet.prioritySupplemental,
    },
  }
  const v = map[priority]
  return (
    <span {...sx(placeDetailSheet.priorityPill, v.text)}>
      <span aria-hidden {...sx(markerStyles.dot, v.dot)} />
      {v.label}
    </span>
  )
}
