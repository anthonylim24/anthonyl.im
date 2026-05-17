import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Navigation, ExternalLink, X, Share2, Footprints } from "lucide-react"
import type { RankedPlace } from "./mapModeTypes"
import { lookupPhoto, formatWalkingTime } from "./placePhoto"

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

  const walking = useMemo(() => formatWalkingTime(place.distanceMeters), [place.distanceMeters])

  // Look up a real Wikipedia photo
  useEffect(() => {
    let cancelled = false
    setPhotoLoading(true)
    setPhotoFailed(false)
    const titles = [
      // primary name (e.g. "Gyeongbokgung Palace")
      place.name.replace(/\s*\([^)]+\)\s*/g, "").trim(),
      // first-word strip
      place.name.split("·")[0].trim(),
      place.name.split("(")[0].trim(),
      // photoQuery is a Wikipedia-friendly query already
      // (set by the server from PlaceDef.photoQuery)
    ].filter(Boolean)
    lookupPhoto(titles)
      .then((url) => {
        if (cancelled) return
        if (url) {
          setPhotoUrl(url)
        } else {
          // Fallback: Unsplash placeholder
          setPhotoUrl(place.photoUrl)
        }
        setPhotoLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setPhotoUrl(place.photoUrl)
        setPhotoLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [place.id, place.name, place.photoUrl])

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
      className="absolute inset-x-0 bottom-0 z-30 max-h-[78vh] overflow-hidden rounded-t-3xl border-t border-stone-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/95"
    >
      <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-stone-300/80 dark:bg-stone-700/80" />
      <div className="max-h-[calc(78vh-0.5rem)] overflow-y-auto px-4 pb-6 pt-3 sm:px-6">
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
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
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open in Maps
          </a>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
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
  const map = {
    scheduled: { label: "Scheduled", cls: "bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200" },
    core: { label: "Core", cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" },
    supplemental: { label: "Extra", cls: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-300" },
  }
  const v = map[priority]
  return (
    <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " + v.cls}>
      {v.label}
    </span>
  )
}
