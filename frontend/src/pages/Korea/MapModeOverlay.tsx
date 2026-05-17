import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { X, MapPin, Navigation, FlaskConical, ExternalLink, Loader2 } from "lucide-react"
import { MapModeScene, isWebglSupported } from "./MapModeScene"
import { MapModeFallbackList } from "./MapModeFallbackList"
import type { PlacesResponse, RankedPlace, UserLocation } from "./mapModeTypes"

interface MapModeOverlayProps {
  daySlug: string
  dayTitle: string
  onClose: () => void
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: PlacesResponse }
  | { status: "error"; message: string }

export function MapModeOverlay({ daySlug, dayTitle, onClose }: MapModeOverlayProps) {
  const reduce = useReducedMotion()
  const [testMode, setTestMode] = useState(false)
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [selected, setSelected] = useState<RankedPlace | null>(null)
  const [webglFailed, setWebglFailed] = useState<boolean>(() => !isWebglSupported())

  // Geolocation fetch
  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setLocation({ lat: 37.5093, lng: 127.0578, source: "hotel", label: "Park Hyatt Seoul (fallback)" })
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: "geolocation",
          label: "Your location",
        })
        setLocating(false)
      },
      () => {
        // Denied / failed — fall back. If test mode, use Fairmont SF; otherwise hotel.
        setLocation(
          testMode
            ? { lat: 37.7926, lng: -122.4101, source: "test-anchor", label: "Fairmont SF (test fallback)" }
            : { lat: 37.5093, lng: 127.0578, source: "hotel", label: "Park Hyatt Seoul (fallback)" },
        )
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  }

  // Auto-request location on open
  useEffect(() => {
    requestLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-anchor when test mode flips: if no real geo, use the appropriate fallback.
  useEffect(() => {
    if (!location) return
    if (location.source !== "geolocation") {
      setLocation(
        testMode
          ? { lat: 37.7926, lng: -122.4101, source: "test-anchor", label: "Fairmont SF (test anchor)" }
          : { lat: 37.5093, lng: 127.0578, source: "hotel", label: "Park Hyatt Seoul (fallback)" },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMode])

  // Fetch places whenever slug, location or testMode changes.
  useEffect(() => {
    if (!location) return
    setState({ status: "loading" })
    const qs = new URLSearchParams({
      lat: String(location.lat),
      lng: String(location.lng),
    })
    if (testMode) qs.set("test", "sf")
    fetch(`/api/korea/day/${encodeURIComponent(daySlug)}/places?${qs.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Places fetch ${r.status}`)
        return r.json() as Promise<PlacesResponse>
      })
      .then((data) => setState({ status: "success", data }))
      .catch((err: Error) => setState({ status: "error", message: err.message }))
  }, [daySlug, location, testMode])

  const counts = useMemo(() => {
    if (state.status !== "success") return { scheduled: 0, core: 0, supplemental: 0 }
    const acc = { scheduled: 0, core: 0, supplemental: 0 }
    for (const p of state.data.places) acc[p.priority]++
    return acc
  }, [state])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-stone-100 via-rose-50 to-amber-50 dark:from-stone-950 dark:via-stone-950 dark:to-stone-900"
      role="dialog"
      aria-modal="true"
      aria-label="Map Mode"
    >
      {/* Header */}
      <header className="relative z-20 flex items-center gap-2 border-b border-stone-200/60 bg-white/60 px-3 py-2.5 backdrop-blur-xl dark:border-stone-800/60 dark:bg-stone-950/70 sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Map Mode"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400">
            Map Mode · {dayTitle}
          </p>
          {state.status === "success" && (
            <p className="truncate text-xs text-stone-700 dark:text-stone-300">
              {state.data.meta.city} ·{" "}
              <span className="text-rose-700 dark:text-rose-300">
                {counts.scheduled} scheduled
              </span>{" "}
              ·{" "}
              <span className="text-amber-700 dark:text-amber-300">{counts.core} core</span> ·{" "}
              <span className="text-stone-500 dark:text-stone-500">{counts.supplemental} more</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={requestLocation}
          disabled={locating}
          title="Re-fetch your location"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Navigation className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">Locate</span>
        </button>

        <label
          className={
            "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition " +
            (testMode
              ? "border-violet-400 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-100"
              : "border-stone-300 bg-white text-stone-700 hover:border-violet-300 hover:text-violet-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-violet-700 dark:hover:text-violet-200")
          }
        >
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          <span>SF Test</span>
          <input
            type="checkbox"
            className="sr-only"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
          />
        </label>
      </header>

      {/* Scene */}
      <div className="relative flex-1 overflow-hidden">
        {state.status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-white/80 px-4 py-2 text-xs font-medium text-stone-700 shadow-sm backdrop-blur dark:bg-stone-900/80 dark:text-stone-300">
              <Loader2 className="mr-2 inline-block h-3.5 w-3.5 animate-spin" aria-hidden /> Loading places…
            </div>
          </div>
        )}
        {state.status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-xs rounded-2xl bg-rose-100 p-4 text-center text-sm text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
              {state.message}
            </div>
          </div>
        )}
        {state.status === "success" && !webglFailed && (
          <MapModeScene
            places={state.data.places}
            onSelect={setSelected}
            selectedId={selected?.id ?? null}
            reducedMotion={reduce ?? undefined}
            onWebglError={() => setWebglFailed(true)}
          />
        )}
        {state.status === "success" && webglFailed && (
          <div className="absolute inset-0 overflow-y-auto">
            <MapModeFallbackList places={state.data.places} onSelect={setSelected} />
          </div>
        )}

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-2xl bg-white/80 px-3 py-2 text-[10px] font-medium text-stone-700 shadow-sm backdrop-blur dark:bg-stone-900/80 dark:text-stone-300">
          <Dot color="#ff4d6d" label="Scheduled · in your plan" />
          <Dot color="#fb923c" label="Core · on the day's itinerary" />
          <Dot color="#a3a3a3" label="Supplemental · nearby extras" />
        </div>

        {/* Location pill */}
        {location && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[60vw] rounded-full bg-white/80 px-3 py-1.5 text-[10px] font-medium text-stone-700 shadow-sm backdrop-blur dark:bg-stone-900/80 dark:text-stone-300">
            <MapPin className="mr-1 inline-block h-3 w-3" aria-hidden />
            {location.label}
            {location.source === "geolocation" && " · live"}
          </div>
        )}
      </div>

      {/* Detail sheet */}
      <AnimatePresence>
        {selected && (
          <PlaceDetailSheet
            key={selected.id}
            place={selected}
            onClose={() => setSelected(null)}
            userLat={location?.lat}
            userLng={location?.lng}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  )
}

interface PlaceDetailSheetProps {
  place: RankedPlace
  onClose: () => void
  userLat?: number
  userLng?: number
}

function PlaceDetailSheet({ place, onClose, userLat, userLng }: PlaceDetailSheetProps) {
  const directionsUrl = useMemo(() => {
    const origin = userLat && userLng ? `${userLat},${userLng}` : ""
    const destination = `${place.lat},${place.lng}`
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&destination_place_id=${encodeURIComponent(place.name)}`
  }, [place, userLat, userLng])

  const reduce = useReducedMotion()

  return (
    <motion.div
      role="dialog"
      aria-label={place.name}
      initial={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className="absolute inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-hidden rounded-t-3xl border-t border-stone-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-stone-800 dark:bg-stone-950/95"
    >
      <div className="mx-auto h-1.5 w-12 rounded-full bg-stone-300/80 dark:bg-stone-700/80" style={{ marginTop: 8 }} />
      <div className="max-h-[calc(70vh-1rem)] overflow-y-auto px-4 pb-6 pt-3 sm:px-6">
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
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 sm:text-lg">
                {place.name}
              </h2>
              <PriorityPill priority={place.priority} />
            </div>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              {place.category} · {place.city}
              {place.distanceLabel ? ` · ${place.distanceLabel} away` : ""}
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
        <div className="relative mt-4 overflow-hidden rounded-2xl bg-stone-200 dark:bg-stone-800" style={{ aspectRatio: "3 / 2" }}>
          <img
            src={place.photoUrl}
            alt={place.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        </div>

        {/* Description */}
        <p className="mt-4 text-sm text-stone-700 dark:text-stone-300">{place.description}</p>

        {/* Meta rows */}
        <div className="mt-4 space-y-2">
          {place.address && (
            <Row icon="📍" label="Address" value={place.address} />
          )}
          {place.openingHours && (
            <Row icon="🕒" label="Hours" value={place.openingHours} />
          )}
          {place.notice && (
            <Row
              icon="⚠️"
              label="Notice"
              value={place.notice}
              className="text-amber-800 dark:text-amber-200"
            />
          )}
          <Row icon="✨" label="Why" value={place.reason} />
          {place.reservationTime && (
            <Row icon="📌" label="Booked" value={place.reservationTime} />
          )}
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
            href={`https://www.google.com/maps/search/${encodeURIComponent(place.name + ", " + place.city)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open in Maps
          </a>
        </div>
      </div>
    </motion.div>
  )
}

function Row({ icon, label, value, className }: { icon: string; label: string; value: string; className?: string }) {
  return (
    <div className={"flex items-start gap-2 text-xs " + (className ?? "text-stone-700 dark:text-stone-300")}>
      <span aria-hidden className="mt-0.5 shrink-0 text-sm">
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
