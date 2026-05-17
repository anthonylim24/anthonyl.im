import { useEffect, useMemo, useState, useRef } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { X, MapPin, Navigation, FlaskConical, Loader2, Crosshair, Globe2, List as ListIcon } from "lucide-react"
import { MapModeScene, isWebglSupported } from "./MapModeScene"
import { MapModeFallbackList } from "./MapModeFallbackList"
import { MapModeFilterBar } from "./MapModeFilterBar"
import { PlaceDetailSheet } from "./PlaceDetailSheet"
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
  const [disabledCategories, setDisabledCategories] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"orb" | "list">("orb")
  const sceneContainerRef = useRef<HTMLDivElement>(null)
  const showOrbs = viewMode === "orb" && !webglFailed
  const showList = viewMode === "list" || webglFailed

  function resetView() {
    sceneContainerRef.current?.firstElementChild?.dispatchEvent(
      new CustomEvent("korea-map-reset"),
    )
  }

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

  useEffect(() => {
    requestLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Lock body scroll while the overlay is open
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) {
          setSelected(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, onClose])

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

  const filteredPlaces = useMemo(() => {
    if (state.status !== "success") return []
    if (disabledCategories.size === 0) return state.data.places
    return state.data.places.filter((p) => !disabledCategories.has(p.category))
  }, [state, disabledCategories])

  const counts = useMemo(() => {
    if (state.status !== "success") return { scheduled: 0, core: 0, supplemental: 0 }
    const acc = { scheduled: 0, core: 0, supplemental: 0 }
    for (const p of filteredPlaces) acc[p.priority]++
    return acc
  }, [state, filteredPlaces])

  function toggleCategory(cat: string) {
    setDisabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
  function resetCategories() {
    setDisabledCategories(new Set())
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-stone-50 dark:bg-stone-950"
      role="dialog"
      aria-modal="true"
      aria-label="Map Mode"
    >
      {/* Atmospheric backdrop — radial gradient + faint grain for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 30%, rgba(255, 220, 200, 0.6) 0%, rgba(255, 220, 200, 0.1) 35%, transparent 70%), radial-gradient(ellipse 110% 80% at 50% 90%, rgba(190, 220, 255, 0.4) 0%, rgba(190, 220, 255, 0.1) 30%, transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(ellipse 90% 75% at 50% 25%, rgba(80, 30, 70, 0.55) 0%, rgba(30, 12, 40, 0.4) 35%, transparent 75%), radial-gradient(ellipse 110% 85% at 50% 95%, rgba(20, 30, 70, 0.45) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 20% 60%, rgba(60, 20, 80, 0.3) 0%, transparent 80%)",
        }}
      />

      {/* Header — floats above the scene so the canvas (and its center) span
          the full viewport. Without this, the scene region would sit BELOW the
          header in a flex column and the canvas's geometric center would land
          below the visible viewport center — making YOU and its orbit ring
          appear shifted downward. */}
      <header className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-stone-200/60 bg-white/70 px-3 py-2.5 backdrop-blur-xl dark:border-stone-800/60 dark:bg-stone-950/70 sm:gap-3 sm:px-5">
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
              <span className="text-rose-700 dark:text-rose-300">{counts.scheduled} scheduled</span> ·{" "}
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

        {!webglFailed && (
          <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-stone-300 bg-white text-xs font-medium dark:border-stone-700 dark:bg-stone-900">
            <button
              type="button"
              onClick={() => setViewMode("orb")}
              aria-pressed={viewMode === "orb"}
              title="3D bubble view"
              className={
                "inline-flex items-center gap-1 px-2.5 py-1.5 transition " +
                (viewMode === "orb"
                  ? "bg-rose-600 text-white"
                  : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800")
              }
            >
              <Globe2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">3D</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              title="List view"
              className={
                "inline-flex items-center gap-1 px-2.5 py-1.5 transition " +
                (viewMode === "list"
                  ? "bg-rose-600 text-white"
                  : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800")
              }
            >
              <ListIcon className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>
        )}

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

      {/* Scene region — fills the full viewport so the canvas center coincides
          with the visible center. The header floats on top via absolute
          positioning; the filter bar below clears it via a top offset. */}
      <div className="absolute inset-0 overflow-hidden">
        {state.status === "loading" && <LoadingPulse />}
        {state.status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-xs rounded-2xl bg-rose-100 p-4 text-center text-sm text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
              {state.message}
            </div>
          </div>
        )}

        {state.status === "success" && (
          <>
            {showOrbs && (
              <>
                <div ref={sceneContainerRef} className="absolute inset-0">
                  <MapModeScene
                    places={filteredPlaces}
                    onSelect={setSelected}
                    selectedId={selected?.id ?? null}
                    reducedMotion={reduce ?? undefined}
                    onWebglError={() => setWebglFailed(true)}
                  />
                </div>
                <button
                  type="button"
                  onClick={resetView}
                  title="Reset camera view"
                  aria-label="Reset camera view"
                  className="absolute right-3 top-16 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-stone-700 shadow-md backdrop-blur transition hover:bg-white hover:text-rose-700 dark:bg-stone-900/85 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-rose-200"
                >
                  <Crosshair className="h-4 w-4" />
                </button>
              </>
            )}
            <MapModeFilterBar
              places={state.data.places}
              enabledCategories={
                disabledCategories.size === 0
                  ? new Set()
                  : new Set(
                      Array.from(new Set(state.data.places.map((p) => p.category))).filter(
                        (c) => !disabledCategories.has(c),
                      ),
                    )
              }
              onToggle={toggleCategory}
              onReset={resetCategories}
            />
            {showOrbs && filteredPlaces.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl bg-white/90 px-4 py-3 text-center text-sm text-stone-700 shadow-md backdrop-blur dark:bg-stone-900/90 dark:text-stone-300">
                  No places match these filters.
                  <button
                    type="button"
                    onClick={resetCategories}
                    className="pointer-events-auto ml-2 underline decoration-rose-500/60 hover:text-rose-700 dark:hover:text-rose-300"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
            {showList && (
              <div className="absolute inset-0 overflow-y-auto pt-16">
                <MapModeFallbackList places={filteredPlaces} onSelect={setSelected} />
              </div>
            )}
          </>
        )}

        {/* Legend — only in orb view; list view doesn't need 3D hints */}
        {showOrbs && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-2xl bg-white/85 px-3 py-2 text-[10px] font-medium text-stone-700 shadow-md backdrop-blur dark:bg-stone-900/85 dark:text-stone-300">
            <Dot color="#ff4d6d" label="Scheduled · in your plan" />
            <Dot color="#fb923c" label="Core · on today's itinerary" />
            <Dot color="#a3a3a3" label="Supplemental · nearby extras" />
            <div className="mt-1 border-t border-stone-200 pt-1 text-[9px] text-stone-500 dark:border-stone-800 dark:text-stone-500">
              Drag to rotate · pinch to zoom · tap a bubble
            </div>
          </div>
        )}

        {/* Location pill */}
        {location && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 max-w-[60vw] truncate rounded-full bg-white/85 px-3 py-1.5 text-[10px] font-medium text-stone-700 shadow-md backdrop-blur dark:bg-stone-900/85 dark:text-stone-300">
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

// Animated loading state inside the scene area
function LoadingPulse() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative">
        <motion.div
          className="absolute inset-0 -m-8 rounded-full bg-rose-400/20 blur-2xl"
          animate={{ scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 20 }}
          className="relative flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-medium text-stone-700 shadow-lg backdrop-blur dark:bg-stone-900/90 dark:text-stone-300"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Pulling places + photos…
        </motion.div>
      </div>
    </div>
  )
}
