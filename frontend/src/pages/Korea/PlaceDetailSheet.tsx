import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from "motion/react"
import { Navigation, ExternalLink, X, Share2, Footprints } from "lucide-react"
import type { RankedPlace } from "./mapModeTypes"
import { lookupGooglePlacePhoto, lookupPhoto, formatWalkingTime } from "./placePhoto"

interface PlaceDetailSheetProps {
  place: RankedPlace
  onClose: () => void
  userLat?: number
  userLng?: number
}

export function PlaceDetailSheet({ place, onClose, userLat, userLng }: PlaceDetailSheetProps) {
  const reduce = useReducedMotion()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoLoading, setPhotoLoading] = useState(true)
  const [photoFailed, setPhotoFailed] = useState(false)
  const [shared, setShared] = useState(false)

  // ── Drag-to-close ────────────────────────────────────────────────────
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
    // Threshold: ~120px pulled OR a hard flick (>500 px/s) closes; else
    // snap back. Motion lerp-resets the y motion value automatically.
    if (info.offset.y > 120 || info.velocity.y > 500) {
      onClose()
    }
  }

  const walking = useMemo(() => formatWalkingTime(place.distanceMeters), [place.distanceMeters])

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

  async function onShare() {
    const text = `${place.name} — ${place.description}`
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: place.name, text, url: searchUrl })
        setShared(true)
        setTimeout(() => setShared(false), 2500)
        return
      } catch {
        /* fall through to clipboard */
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${text}\n${searchUrl}`)
        setShared(true)
        setTimeout(() => setShared(false), 2500)
      } catch {
        /* no-op */
      }
    }
  }

  return (
    <motion.div
      role="dialog"
      aria-label={place.name}
      initial={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      style={{ y, touchAction: "pan-y" }}
      drag={reduce ? false : "y"}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      onPointerDown={reduce ? undefined : maybeStartDrag}
      className="absolute inset-x-0 bottom-0 z-30 max-h-[78vh] overflow-hidden rounded-t-3xl border-t border-stone-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/95"
    >
      {/* Drag handle — larger touch target than the visible pill, so a
          tap-down anywhere in the top strip can pull the sheet down. */}
      <div
        data-sheet-handle
        aria-hidden
        className="mx-auto flex h-6 w-full cursor-grab items-center justify-center pt-2 active:cursor-grabbing"
      >
        <div className="h-1.5 w-12 rounded-full bg-stone-300/80 dark:bg-stone-700/80" />
      </div>
      <div ref={scrollRef} className="max-h-[calc(78vh-0.5rem)] overflow-y-auto px-4 pb-6 pt-3 sm:px-6">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-inner"
            style={{ background: place.color + "33" }}
          >
            {place.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="break-words text-base font-semibold text-stone-900 dark:text-stone-100 sm:text-lg">
                {place.name}
              </h2>
              <PriorityPill priority={place.priority} />
            </div>
            <p className="mt-0.5 break-words text-xs text-stone-500 dark:text-stone-400">
              <span className="capitalize">{place.category}</span> · {place.city}
              {place.distanceLabel ? ` · ${place.distanceLabel}` : ""}
              {walking ? ` · ${walking}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 transition hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Photo */}
        <div
          className="relative mt-4 overflow-hidden rounded-2xl bg-stone-200 dark:bg-stone-800"
          style={{ aspectRatio: "3 / 2" }}
        >
          {photoLoading && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-stone-200 via-stone-100 to-stone-200 dark:from-stone-800 dark:via-stone-900 dark:to-stone-800" />
          )}
          {photoUrl && !photoFailed && (
            <img
              src={photoUrl}
              alt={place.name}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
              onLoad={() => setPhotoLoading(false)}
              onError={() => {
                setPhotoFailed(true)
                setPhotoLoading(false)
              }}
            />
          )}
          {photoFailed && (
            <div
              className="absolute inset-0 flex items-center justify-center text-6xl"
              style={{
                background: `linear-gradient(135deg, ${place.color}55 0%, ${place.color}22 100%)`,
              }}
            >
              {place.icon}
            </div>
          )}
        </div>

        {/* Description */}
        <p className="mt-4 break-words text-sm text-stone-700 dark:text-stone-300">{place.description}</p>

        {/* Meta rows */}
        <div className="mt-4 space-y-2.5">
          {place.address && <Row icon="📍" label="Address" value={place.address} />}
          {place.openingHours && <Row icon="🕒" label="Hours" value={place.openingHours} />}
          {place.notice && (
            <Row
              icon="⚠️"
              label="Notice"
              value={place.notice}
              className="text-amber-800 dark:text-amber-200"
            />
          )}
          {walking && (
            <Row
              icon={<Footprints className="h-3.5 w-3.5" aria-hidden />}
              label="Walking"
              value={`${walking}${place.distanceLabel ? ` · ${place.distanceLabel}` : ""}`}
            />
          )}
          <Row icon="✨" label="Why" value={place.reason} />
          {place.reservationTime && <Row icon="📌" label="Booked" value={place.reservationTime} />}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
          >
            <Navigation className="h-4 w-4" aria-hidden />
            Directions
          </a>
          <a
            href={searchUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open in Maps
          </a>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
          >
            <Share2 className="h-4 w-4" aria-hidden />
            {shared ? "Shared!" : "Share"}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function Row({
  icon,
  label,
  value,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={"flex items-start gap-2 text-xs " + (className ?? "text-stone-700 dark:text-stone-300")}>
      <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500 dark:text-stone-500">{label}</p>
        <p className="break-words">{value}</p>
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
      dot: "bg-rose-500 dark:bg-rose-400",
      text: "text-rose-700 dark:text-rose-300",
    },
    core: {
      label: "Core",
      dot: "bg-stone-700 dark:bg-stone-300",
      text: "text-stone-700 dark:text-stone-300",
    },
    supplemental: {
      label: "Extra",
      dot: "bg-stone-400 dark:bg-stone-600",
      text: "text-stone-500 dark:text-stone-500",
    },
  }
  const v = map[priority]
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] " + v.text
      }
    >
      <span aria-hidden className={"inline-block h-1.5 w-1.5 rounded-full " + v.dot} />
      {v.label}
    </span>
  )
}
