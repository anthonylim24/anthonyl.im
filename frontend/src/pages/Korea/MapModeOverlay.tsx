import { lazy, Suspense, useEffect, useMemo, useState, useRef } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { X, MapPin, Navigation, Bug, Loader2, Crosshair, Globe2, List as ListIcon } from "lucide-react"
import { MapModeScene, isWebglSupported } from "./MapModeScene"
import { MapModeCompass } from "./MapModeCompass"
// Detailed3DScene pulls in 3DTilesRendererJS (~160 kB gz) — load it
// only when the user actually flips the debug toggle.
const Detailed3DScene = lazy(() =>
  import("./Detailed3DScene").then((m) => ({ default: m.Detailed3DScene })),
)
import { MapModeFallbackList } from "./MapModeFallbackList"
import { MapModeFilterBar } from "./MapModeFilterBar"
import { PlaceDetailSheet } from "./PlaceDetailSheet"
import type { PlacePriority, PlacesResponse, RankedPlace, UserLocation } from "./mapModeTypes"

const ALL_PRIORITIES: ReadonlyArray<PlacePriority> = ["scheduled", "core", "supplemental"]

// Last-resort fallback when we don't yet know the day's hotel (e.g.
// while the day-places fetch is in flight). Park Hyatt Seoul is the
// trip's main hotel; the day-specific hotel from the server response
// overrides this as soon as it arrives.
const HOTEL_LOCATION: UserLocation = {
  lat: 37.5093,
  lng: 127.0578,
  source: "hotel",
  label: "Park Hyatt Seoul",
}

// SF test anchor for the synthetic Fairmont demo data.
const SF_TEST_LOCATION: UserLocation = {
  lat: 37.7926,
  lng: -122.4101,
  source: "test-anchor",
  label: "Fairmont SF (test anchor)",
}

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
  const [mockHotel, setMockHotel] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  // Detailed 3D = the default Map Mode now. The orbital bubble view
  // remains accessible via the Debug menu (uncheck to switch back),
  // but the photorealistic Google 3D city is what the user sees first.
  const [detailed3D, setDetailed3D] = useState(true)
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const debugRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [selected, setSelected] = useState<RankedPlace | null>(null)
  const [webglFailed, setWebglFailed] = useState<boolean>(() => !isWebglSupported())
  const [disabledCategories, setDisabledCategories] = useState<Set<string>>(new Set())
  const [disabledPriorities, setDisabledPriorities] = useState<Set<PlacePriority>>(new Set())
  const [viewMode, setViewMode] = useState<"orb" | "list">("orb")
  const sceneContainerRef = useRef<HTMLDivElement>(null)
  // Live camera yaw, written by the Three.js tick loop, read by the
  // compass each frame. Ref so the React tree doesn't re-render every
  // time the user drags.
  const yawRef = useRef<number>(0)
  const showOrbs = viewMode === "orb" && !webglFailed
  const showList = viewMode === "list" || webglFailed

  // The day's hotel from the server response — Grand InterContinental
  // Seoul Parnas on days 1-2, Park Hyatt Seoul on 3-8, Signiel Busan
  // on 9+. Held as state with a *stable* reference: we only assign a
  // new object when the lat/lng actually change. Without this stable
  // identity, the location → fetch → state → memo → location chain
  // oscillates each render and the 3D scene re-fetches Google tiles
  // on every cycle (an "infinite loop" of API calls).
  const [dayHotelLocation, setDayHotelLocation] = useState<UserLocation>(HOTEL_LOCATION)
  useEffect(() => {
    if (state.status !== "success") return
    const c = state.data.meta.center
    if (!c) return
    setDayHotelLocation((prev) => {
      if (prev.lat === c.lat && prev.lng === c.lng && prev.label === c.label) {
        return prev
      }
      return { lat: c.lat, lng: c.lng, source: "hotel", label: c.label }
    })
  }, [state])

  function dispatchSceneEvent(name: string) {
    // Window-level event channel — the scene listens on window so the
    // dispatch path doesn't depend on the DOM structure of MapModeScene.
    window.dispatchEvent(new CustomEvent(name))
  }
  function resetView() {
    dispatchSceneEvent("korea-map-reset")
  }
  function orientNorth() {
    dispatchSceneEvent("korea-map-orient-north")
  }

  // Geolocation fetch. Honors the two debug toggles: when `mockHotel` is
  // on, we skip the browser API entirely and pin to Park Hyatt Seoul;
  // when `testMode` is on with no real geolocation, we anchor to the
  // Fairmont SF synthetic dataset.
  function requestLocation() {
    if (mockHotel) {
      setLocation(dayHotelLocation)
      setLocating(false)
      return
    }
    if (!("geolocation" in navigator)) {
      setLocation(testMode ? SF_TEST_LOCATION : dayHotelLocation)
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
        setLocation(testMode ? SF_TEST_LOCATION : dayHotelLocation)
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  }

  useEffect(() => {
    requestLocation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // React to debug-toggle changes. The mock-hotel toggle takes precedence
  // (always swaps to the hotel coords); the SF test toggle only swaps
  // when we're NOT on a real geolocation source.
  // Helper: only update `location` when the lat/lng actually change.
  // Without this guard the fetch effect retriggers on every render
  // (even when the underlying coords are identical) and the 3D
  // scene re-mounts → re-requests Google's root tileset → API
  // request storm.
  function setLocationIfCoordsChanged(next: UserLocation) {
    setLocation((prev) => {
      if (prev && prev.lat === next.lat && prev.lng === next.lng && prev.source === next.source) {
        return prev
      }
      return next
    })
  }

  useEffect(() => {
    if (mockHotel) {
      setLocationIfCoordsChanged(dayHotelLocation)
      return
    }
    // Mock just turned off → re-fetch the real geolocation.
    if (location?.source === "hotel" && !mockHotel) {
      requestLocation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockHotel, dayHotelLocation])

  useEffect(() => {
    if (!location || mockHotel) return
    if (location.source !== "geolocation") {
      setLocationIfCoordsChanged(testMode ? SF_TEST_LOCATION : dayHotelLocation)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testMode, dayHotelLocation])

  // When the day's hotel coords arrive from the server (or the day
  // changes via SPA navigation), update any "hotel-source" location
  // to the new day's hotel. Real geolocation + test-anchor stay put.
  useEffect(() => {
    if (location?.source === "hotel") {
      setLocationIfCoordsChanged(dayHotelLocation)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayHotelLocation])

  // Lock body scroll while the overlay is open
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Escape to close (selection → debug dropdown → overlay)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (debugOpen) {
          setDebugOpen(false)
        } else if (selected) {
          setSelected(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, onClose, debugOpen])

  // Click outside the debug dropdown to close it.
  useEffect(() => {
    if (!debugOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const node = debugRef.current
      if (!node) return
      const target = e.target as Node | null
      if (target && node.contains(target)) return
      setDebugOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("touchstart", onDown)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("touchstart", onDown)
    }
  }, [debugOpen])

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
    if (disabledCategories.size === 0 && disabledPriorities.size === 0) return state.data.places
    return state.data.places.filter(
      (p) => !disabledCategories.has(p.category) && !disabledPriorities.has(p.priority),
    )
  }, [state, disabledCategories, disabledPriorities])

  const counts = useMemo(() => {
    if (state.status !== "success") return { scheduled: 0, core: 0, supplemental: 0 }
    const acc = { scheduled: 0, core: 0, supplemental: 0 }
    for (const p of filteredPlaces) acc[p.priority]++
    return acc
  }, [state, filteredPlaces])

  // Solo-select a category: click → only that category visible. Click the
  // already-solo'd one → reset to all visible. The disabledCategories set
  // is "everything that is NOT the solo'd category"; "all enabled" is
  // represented as an empty set.
  function soloSelect(cat: string) {
    if (state.status !== "success") return
    const allCats = new Set(state.data.places.map((p) => p.category))
    setDisabledCategories((prev) => {
      const enabled = prev.size === 0 ? allCats : new Set(Array.from(allCats).filter((c) => !prev.has(c)))
      const isAlreadySolo = enabled.size === 1 && enabled.has(cat)
      if (isAlreadySolo) return new Set()
      const next = new Set(allCats)
      next.delete(cat)
      return next
    })
  }
  // Solo-select a priority bucket. Same toggle semantics as soloSelect.
  function soloPriority(priority: PlacePriority) {
    setDisabledPriorities((prev) => {
      const enabled =
        prev.size === 0 ? new Set(ALL_PRIORITIES) : new Set(ALL_PRIORITIES.filter((p) => !prev.has(p)))
      const isAlreadySolo = enabled.size === 1 && enabled.has(priority)
      if (isAlreadySolo) return new Set()
      const next = new Set<PlacePriority>(ALL_PRIORITIES)
      next.delete(priority)
      return next
    })
  }

  function resetCategories() {
    setDisabledCategories(new Set())
    setDisabledPriorities(new Set())
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
      <header
        className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-stone-200/60 bg-white/70 px-3 backdrop-blur-xl dark:border-stone-800/60 dark:bg-stone-950/70 sm:gap-3 sm:px-5"
        style={{
          // Reserve room for the iOS dynamic island / status bar
          // when the app is launched standalone from Home Screen.
          // env(safe-area-inset-top) resolves to 0 on non-iOS — the
          // calc fallback keeps the desktop padding consistent.
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
          paddingBottom: "10px",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Map Mode"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-stone-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Navigation className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">Locate</span>
        </button>

        {!webglFailed && (
          <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-stone-300 bg-stone-50 text-xs font-medium dark:border-stone-700 dark:bg-stone-900">
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

        <div ref={debugRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setDebugOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={debugOpen}
            aria-label="Debug options"
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition " +
              (testMode || mockHotel || detailed3D
                ? "border-violet-400 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-100"
                : "border-stone-300 bg-stone-50 text-stone-700 hover:border-violet-300 hover:text-violet-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-violet-700 dark:hover:text-violet-200")
            }
          >
            <Bug className="h-3.5 w-3.5" aria-hidden />
            <span>Debug</span>
            {(testMode || mockHotel || detailed3D) && (
              <span
                aria-hidden
                className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-bold leading-none text-white"
              >
                {(testMode ? 1 : 0) + (mockHotel ? 1 : 0) + (detailed3D ? 1 : 0)}
              </span>
            )}
          </button>

          <AnimatePresence>
            {debugOpen && (
              <motion.div
                role="menu"
                aria-label="Debug options"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 origin-top-right rounded-2xl border border-stone-200 bg-stone-50 p-1.5 shadow-xl ring-1 ring-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:ring-stone-800"
              >
                <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                    checked={testMode}
                    onChange={(e) => setTestMode(e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
                      SF Test
                    </div>
                    <div className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                      Anchor on the Fairmont SF synthetic dataset.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                    checked={mockHotel}
                    onChange={(e) => setMockHotel(e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
                      Mock location: Park Hyatt Seoul
                    </div>
                    <div className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                      Override geolocation with the trip's base hotel.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                    checked={detailed3D}
                    onChange={(e) => setDetailed3D(e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
                      Detailed 3D (Google Photorealistic)
                    </div>
                    <div className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                      Swap the orbital bubbles for a Google Earth-style 3D
                      mesh of Seoul. Requires the Map Tiles API key.
                    </div>
                  </div>
                </label>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
                  {detailed3D ? (
                    <Suspense fallback={<LoadingPulse />}>
                      <Detailed3DScene
                        places={filteredPlaces}
                        onSelect={setSelected}
                        onDeselect={() => setSelected(null)}
                        selectedId={selected?.id ?? null}
                        reducedMotion={reduce ?? undefined}
                        onWebglError={() => setWebglFailed(true)}
                        userLat={location?.lat}
                        userLng={location?.lng}
                        yawRef={yawRef}
                      />
                    </Suspense>
                  ) : (
                    <MapModeScene
                      places={filteredPlaces}
                      onSelect={setSelected}
                      onDeselect={() => setSelected(null)}
                      selectedId={selected?.id ?? null}
                      reducedMotion={reduce ?? undefined}
                      onWebglError={() => setWebglFailed(true)}
                      userLat={location?.lat}
                      userLng={location?.lng}
                      yawRef={yawRef}
                    />
                  )}
                </div>
                {/* Reset + compass live above both scenes. Both
                    scenes write to `yawRef` so the compass dial
                    points correctly regardless of which mode is
                    active, and the `korea-map-reset` /
                    `korea-map-orient-north` window events are
                    handled by whichever scene is mounted. */}
                <button
                  type="button"
                  onClick={resetView}
                  title="Reset camera view"
                  aria-label="Reset camera view"
                  className="absolute right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-stone-700 shadow-md backdrop-blur transition hover:bg-stone-50 hover:text-rose-700 dark:bg-stone-900/85 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-rose-200"
                  style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
                >
                  <Crosshair className="h-4 w-4" />
                </button>
                <MapModeCompass yawRef={yawRef} onOrientNorth={orientNorth} />
              </>
            )}
            {/* Filter bar — hidden while a place is selected so the
                focus state (YOU + line + destination) gets the full
                upper viewport. */}
            <AnimatePresence>
              {!selected && (
                <motion.div
                  key="filter-bar"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
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
                    enabledPriorities={
                      disabledPriorities.size === 0
                        ? new Set()
                        : new Set(ALL_PRIORITIES.filter((p) => !disabledPriorities.has(p)))
                    }
                    onSoloSelect={soloSelect}
                    onSoloPriority={soloPriority}
                    onReset={resetCategories}
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
