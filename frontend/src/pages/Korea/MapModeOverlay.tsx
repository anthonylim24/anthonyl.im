import { lazy, Suspense, useEffect, useMemo, useState, useRef, useTransition } from "react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import {
  X,
  MapPin,
  Navigation,
  Loader2,
  Crosshair,
  Globe2,
  List as ListIcon,
  Eye,
} from "lucide-react"
import { useAuthReady, useGetToken } from "@/lib/safeAuth"
import { fetchDayPlaces } from "./dayPlacesApi"
import { isWebglSupported } from "./webglSupport"
import { MapModeCompass } from "./MapModeCompass"
import { coordsEqual, resolveMapLocation } from "./mapLocation"
import { detectTier, loadEffectPrefs } from "./deviceTier"

// Detailed3DScene pulls in 3DTilesRendererJS — keep it lazy so other
// Korea routes don't pay the cost. Map Mode is the only consumer.
const Detailed3DScene = lazy(() =>
  import("./Detailed3DScene").then((m) => ({ default: m.Detailed3DScene })),
)
import { MapModeFallbackList } from "./MapModeFallbackList"
import { MapModeFilterBar } from "./MapModeFilterBar"
import { PlaceDetailSheet } from "./PlaceDetailSheet"
import { useNeighborhoodLabel } from "./allKoreaDongs"
import type {
  BusynessLevel,
  PlacePriority,
  PlacesResponse,
  RankedPlace,
  UserLocation,
} from "./mapModeTypes"

interface MapModeOverlayProps {
  daySlug: string
  dayTitle: string
  onClose: () => void
  /** Auto-select this place once loaded (e.g. Instagram save deep-link). */
  initialFocusPlaceId?: string
  /** Override places endpoint (path only). Trips pass
   *  `/api/trips/:id/days/:dayId/places`. */
  placesUrl?: string
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: PlacesResponse }
  | { status: "error"; message: string }

type DeviceCoords = { lat: number; lng: number } | null

const controlBtn =
  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.88)] text-stone-700 shadow-[0_8px_24px_rgba(28,25,23,0.1)] backdrop-blur-xl transition hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.78)] dark:text-stone-300 dark:hover:text-rose-200"

const easeOutExpo = [0.16, 1, 0.3, 1] as const

export function MapModeOverlay({
  daySlug,
  dayTitle,
  onClose,
  initialFocusPlaceId,
  placesUrl,
}: MapModeOverlayProps) {
  const reduce = useReducedMotion()
  const getToken = useGetToken()
  const readToken = useLatestCallback(getToken)
  const authReady = useAuthReady()
  const [, startTransition] = useTransition()
  const [deviceCoords, setDeviceCoords] = useState<DeviceCoords>(null)
  const [deviceReady, setDeviceReady] = useState(false)
  const [locating, setLocating] = useState(false)
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [selected, setSelected] = useState<RankedPlace | null>(null)
  const [sheetInitialMode, setSheetInitialMode] = useState<"compact" | "expanded">("compact")
  const [webglFailed, setWebglFailed] = useState<boolean>(() => !isWebglSupported())
  const [effects, setEffects] = useState(() => loadEffectPrefs(detectTier(), reduce ?? false))
  // Which lat,lng the current places payload was ranked for (reactive).
  const [rankedKey, setRankedKey] = useState<string | null>(null)
  /** Bumped to re-run the bootstrap places fetch (Retry). */
  const [reloadNonce, setReloadNonce] = useState(0)
  const userNeighborhood = useNeighborhoodLabel(location?.lat, location?.lng)

  // If reduced-motion resolves after first paint, drop the heavy effects.
  useEffect(() => {
    if (!reduce) return
    setEffects((prev) => {
      if (!prev.fog && !prev.godRays && !prev.maxQuality) return prev
      return { ...prev, fog: false, godRays: false, maxQuality: false }
    })
  }, [reduce])

  const honoredFocusRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialFocusPlaceId) return
    if (honoredFocusRef.current === initialFocusPlaceId) return
    if (state.status !== "success") return
    const match = state.data.places.find((p) => p.id === initialFocusPlaceId)
    if (match) {
      setSheetInitialMode("compact")
      setSelected(match)
      honoredFocusRef.current = initialFocusPlaceId
    }
  }, [initialFocusPlaceId, state])

  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(() => new Set())
  const [enabledPriorities, setEnabledPriorities] = useState<Set<PlacePriority>>(
    () => new Set(["scheduled", "core"]),
  )
  const [enabledBusyness, setEnabledBusyness] = useState<Set<BusynessLevel>>(() => new Set())
  const [viewMode, setViewMode] = useState<"orb" | "list">("orb")
  const [birdsEye, setBirdsEye] = useState(false)
  const sceneContainerRef = useRef<HTMLDivElement>(null)
  const yawRef = useRef<number>(0)
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null)
  const morphAnchorRef = useRef<{ x: number; y: number; color: string } | null>(null)
  /** Tracks which lat/lng the places payload was last ranked for. */
  const rankedForRef = useRef<string | null>(null)
  const showOrbs = viewMode === "orb" && !webglFailed
  const showList = viewMode === "list" || webglFailed

  function dispatchSceneEvent(name: string) {
    window.dispatchEvent(new CustomEvent(name))
  }
  function resetView() {
    setBirdsEye(false)
    dispatchSceneEvent("korea-map-reset")
  }
  function orientNorth() {
    dispatchSceneEvent("korea-map-orient-north")
  }
  function toggleBirdsEye() {
    setBirdsEye((on) => {
      const next = !on
      dispatchSceneEvent(next ? "korea-map-birds-eye" : "korea-map-reset")
      return next
    })
  }

  // ── Orb → sheet morph (View Transitions) ─────────────────────────
  useEffect(() => {
    const el = sceneContainerRef.current
    if (!el) return
    const onUp = (e: PointerEvent) => {
      lastTapRef.current = { x: e.clientX, y: e.clientY, at: performance.now() }
    }
    // Capture so label/canvas taps still record before stopPropagation.
    el.addEventListener("pointerup", onUp, true)
    return () => el.removeEventListener("pointerup", onUp, true)
  }, [showOrbs])

  type VTDocument = Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }

  function openSheetWithMorph(place: RankedPlace, mode: "compact" | "expanded") {
    const tap = lastTapRef.current
    const fresh = tap && performance.now() - tap.at < 1500 ? tap : null
    morphAnchorRef.current = fresh
      ? { x: fresh.x, y: fresh.y, color: place.color }
      : null
    setSheetInitialMode(mode)
    const doc = document as VTDocument
    const canMorph = !reduce && fresh !== null && typeof doc.startViewTransition === "function"
    if (!canMorph) {
      setSelected(place)
      return
    }
    // Named stand-in gives the VT "before" snapshot something to morph from.
    const standIn = document.createElement("div")
    standIn.setAttribute("aria-hidden", "true")
    standIn.style.cssText = [
      "position:fixed",
      "z-index:40",
      "width:44px",
      "height:44px",
      `left:${fresh!.x - 22}px`,
      `top:${fresh!.y - 22}px`,
      "border-radius:9999px",
      `background:radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), ${place.color}66 65%, ${place.color}22 100%)`,
      `box-shadow:0 0 0 1px ${place.color}55, 0 6px 20px ${place.color}55`,
      "pointer-events:none",
      "view-transition-name:place-detail-morph",
    ].join(";")
    document.body.appendChild(standIn)
    const transition = doc.startViewTransition!(() => {
      standIn.remove()
      setSelected(place)
    })
    transition.finished.catch(() => {
      if (standIn.isConnected) standIn.remove()
    })
  }

  function closeSheetWithMorph() {
    const anchor = morphAnchorRef.current
    const doc = document as VTDocument
    if (!doc.startViewTransition || reduce || !anchor) {
      setSelected(null)
      morphAnchorRef.current = null
      return
    }
    const standIn = document.createElement("div")
    standIn.setAttribute("aria-hidden", "true")
    standIn.style.cssText = [
      "position:fixed",
      "z-index:40",
      "width:44px",
      "height:44px",
      `left:${anchor.x - 22}px`,
      `top:${anchor.y - 22}px`,
      "border-radius:9999px",
      `background:radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), ${anchor.color}66 65%, ${anchor.color}22 100%)`,
      `box-shadow:0 0 0 1px ${anchor.color}55, 0 6px 20px ${anchor.color}55`,
      "pointer-events:none",
      "view-transition-name:place-detail-morph",
    ].join(";")
    const transition = doc.startViewTransition(() => {
      document.body.appendChild(standIn)
      setSelected(null)
    })
    transition.finished
      .catch(() => {
        if (standIn.isConnected) standIn.remove()
      })
      .finally(() => {
        if (standIn.isConnected) standIn.remove()
        morphAnchorRef.current = null
      })
  }

  function requestDeviceLocation() {
    if (!("geolocation" in navigator)) {
      setDeviceCoords(null)
      setDeviceReady(true)
      setLocating(false)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setDeviceCoords((prev) => (coordsEqual(prev, next) ? prev : next))
        setDeviceReady(true)
        setLocating(false)
      },
      () => {
        setDeviceCoords(null)
        setDeviceReady(true)
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    )
  }

  useEffect(() => {
    requestDeviceLocation()
  }, [])

  // Bootstrap places immediately (parallel with geolocation). Distances
  // are provisional until resolve + re-rank; the 3D scene waits for
  // `mapReady` so Google tiles only mount once at the final anchor.
  useEffect(() => {
    rankedForRef.current = null
    setRankedKey(null)
    setLocation(null)
    setState({ status: "loading" })
    const queryKey = "0,0"
    let cancelled = false
    void (async () => {
      try {
        const base = placesUrl ?? `/api/korea/day/${encodeURIComponent(daySlug)}/places`
        const data = await fetchDayPlaces(readToken, base, { lat: 0, lng: 0 })
        if (!cancelled) {
          rankedForRef.current = queryKey
          startTransition(() => {
            setRankedKey(queryKey)
            setState({ status: "success", data })
          })
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [daySlug, placesUrl, reloadNonce, startTransition, authReady])

  // Resolve YOU / day-center once places are known and geo has settled
  // (or failed). While geo is pending we still show places in list mode.
  useEffect(() => {
    if (state.status !== "success") return
    if (!deviceReady) return
    const places = state.data.places.map((p) => ({ lat: p.lat, lng: p.lng }))
    const fallback = state.data.meta.center
      ? { lat: state.data.meta.center.lat, lng: state.data.meta.center.lng }
      : null
    const resolved = resolveMapLocation({
      device: deviceCoords,
      places,
      fallbackCenter: fallback,
      fallbackLabel: state.data.meta.center?.label,
    })
    if (!resolved) return

    setLocation((prev) => {
      if (
        prev &&
        coordsEqual(prev, resolved) &&
        prev.source === resolved.source &&
        prev.label === resolved.label
      ) {
        return prev
      }
      return resolved
    })
  }, [state, deviceCoords, deviceReady])

  // Refresh distances when the resolved anchor differs from what we
  // last ranked for (abroad → day median, or live GPS refresh).
  useEffect(() => {
    if (!location || state.status !== "success") return
    const key = `${location.lat},${location.lng}`
    if (rankedForRef.current === key) return

    let cancelled = false
    void (async () => {
      try {
        const base = placesUrl ?? `/api/korea/day/${encodeURIComponent(daySlug)}/places`
        const data = await fetchDayPlaces(readToken, base, { lat: location.lat, lng: location.lng })
        if (!cancelled) {
          // Set only after success so Strict Mode cleanup+rerun still fetches.
          rankedForRef.current = key
          startTransition(() => {
            setRankedKey(key)
            setState({ status: "success", data })
          })
        }
      } catch {
        /* keep prior payload; distances may be slightly off */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [location, state.status, daySlug, placesUrl, startTransition, authReady])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (selected) closeSheetWithMorph()
      else onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selected, onClose])

  const locationKey = location ? `${location.lat},${location.lng}` : null
  /** 3D scene waits until distances match the resolved YOU anchor. */
  const mapReady =
    state.status === "success" &&
    locationKey !== null &&
    rankedKey === locationKey &&
    location != null

  const filteredPlaces = useMemo(() => {
    if (state.status !== "success") return []
    if (enabledCategories.size === 0 && enabledPriorities.size === 0) return []
    return state.data.places.filter((p) => {
      const passesFilter =
        enabledCategories.has(p.category) || enabledPriorities.has(p.priority)
      if (!passesFilter) return false
      if (enabledBusyness.size > 0) {
        if (!p.busyness || !enabledBusyness.has(p.busyness)) return false
      }
      return true
    })
  }, [state, enabledCategories, enabledPriorities, enabledBusyness])

  function toggleCategory(cat: string) {
    setEnabledCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }
  function togglePriority(priority: PlacePriority) {
    setEnabledPriorities((prev) => {
      const next = new Set(prev)
      if (next.has(priority)) next.delete(priority)
      else next.add(priority)
      return next
    })
  }
  function toggleBusyness(level: BusynessLevel) {
    setEnabledBusyness((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }
  function resetCategories() {
    setEnabledCategories(new Set())
    setEnabledPriorities(new Set(["scheduled", "core"]))
    setEnabledBusyness(new Set())
  }

  const cityLabel = state.status === "success" ? state.data.meta.city : null
  const enter = reduce
    ? { duration: 0.01 }
    : { duration: 0.22, ease: easeOutExpo }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={enter}
      className="fixed inset-0 z-50 bg-[#F5F2ED] dark:bg-[#171613]"
      role="dialog"
      aria-modal="true"
      aria-label="Map Mode"
    >
      {/* Floating header — keeps canvas center at viewport center */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0.01 } : { duration: 0.28, ease: easeOutExpo, delay: 0.04 }}
        className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 sm:gap-3 sm:px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.88)] px-1.5 py-1.5 shadow-[0_8px_28px_rgba(28,25,23,0.08)] backdrop-blur-xl dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.78)]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Map Mode"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-700 transition hover:bg-stone-100/80 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:text-stone-300 dark:hover:bg-stone-800/80 dark:hover:text-rose-200"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 py-0.5 pr-1">
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
              Map{cityLabel ? ` · ${cityLabel}` : ""}
            </p>
            <p className="truncate text-sm font-medium tracking-tight text-stone-900 dark:text-stone-100">
              {dayTitle}
            </p>
          </div>

          <button
            type="button"
            onClick={requestDeviceLocation}
            disabled={locating}
            title="Use my location"
            aria-label="Use my location"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-700 transition hover:bg-stone-100/80 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800/80 dark:hover:text-rose-200"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Navigation className="h-4 w-4" aria-hidden />
            )}
          </button>

          {!webglFailed && (
            <div
              role="group"
              aria-label="View mode"
              className="mr-0.5 inline-flex h-10 shrink-0 overflow-hidden rounded-full bg-stone-100/90 p-0.5 text-xs font-medium dark:bg-stone-800/90"
            >
              <button
                type="button"
                onClick={() => setViewMode("orb")}
                aria-pressed={viewMode === "orb"}
                aria-label="3D map view"
                title="3D map"
                className={
                  "inline-flex items-center gap-1 rounded-full px-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
                  (viewMode === "orb"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100")
                }
              >
                <Globe2 className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Map</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
                aria-label="List view"
                title="List"
                className={
                  "inline-flex items-center gap-1 rounded-full px-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
                  (viewMode === "list"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100")
                }
              >
                <ListIcon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          )}
        </div>
      </motion.header>

      <div className="absolute inset-0 overflow-hidden">
        {(state.status === "loading" ||
          (state.status === "success" && !mapReady) ||
          state.status === "idle") && <LoadingPulse reduce={!!reduce} />}

        {state.status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-sm rounded-2xl border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.94)] p-5 text-center shadow-[0_16px_40px_rgba(28,25,23,0.12)] backdrop-blur-xl dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.9)]">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                Couldn’t load places
              </p>
              <p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                {state.message}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLocation(null)
                  setDeviceReady(false)
                  requestDeviceLocation()
                  setReloadNonce((n) => n + 1)
                }}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-rose-600 px-4 text-xs font-semibold text-white transition hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {state.status === "success" && mapReady && (
          <>
            {webglFailed && viewMode === "orb" && (
              <div
                className="absolute inset-x-0 z-20 flex justify-center px-3"
                style={{ top: "calc(env(safe-area-inset-top, 0px) + 72px)" }}
                role="status"
              >
                <p className="rounded-full border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.92)] px-3 py-1.5 text-[11px] font-medium text-stone-600 shadow-sm backdrop-blur dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.85)] dark:text-stone-300">
                  Map unavailable — showing list
                </p>
              </div>
            )}

            {showOrbs && (
              <>
                <div ref={sceneContainerRef} className="absolute inset-0">
                  <Suspense fallback={<LoadingPulse reduce={!!reduce} />}>
                    <Detailed3DScene
                      places={filteredPlaces}
                      neighborhoods={state.data.neighborhoods ?? []}
                      onSelect={(p) => openSheetWithMorph(p, "compact")}
                      onDeselect={() => setSelected(null)}
                      selectedId={selected?.id ?? null}
                      reducedMotion={reduce ?? undefined}
                      onWebglError={() => setWebglFailed(true)}
                      userLat={location.lat}
                      userLng={location.lng}
                      yawRef={yawRef}
                      effects={effects}
                    />
                  </Suspense>
                </div>

                <motion.div
                  initial={reduce ? false : { opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={
                    reduce
                      ? { duration: 0.01 }
                      : { duration: 0.28, ease: easeOutExpo, delay: 0.1 }
                  }
                  className="absolute right-3 z-20 flex flex-col gap-2"
                  style={{ top: "calc(env(safe-area-inset-top, 0px) + 78px)" }}
                >
                  <MapModeCompass
                    yawRef={yawRef}
                    onOrientNorth={orientNorth}
                    className={controlBtn}
                  />
                  <button
                    type="button"
                    onClick={resetView}
                    title="Reset camera view"
                    aria-label="Reset camera view"
                    className={controlBtn}
                  >
                    <Crosshair className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={toggleBirdsEye}
                    aria-pressed={birdsEye}
                    title={birdsEye ? "Exit birds-eye view" : "Birds-eye view"}
                    aria-label={birdsEye ? "Exit birds-eye view" : "Birds-eye view"}
                    className={
                      birdsEye
                        ? "inline-flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-[0_8px_24px_rgba(244,63,94,0.35)] transition hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60"
                        : controlBtn
                    }
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                  </button>
                </motion.div>
              </>
            )}

            <AnimatePresence>
              {!selected && (
                <motion.div
                  key="filter-bar"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: reduce ? 0.01 : 0.18 }}
                >
                  <MapModeFilterBar
                    places={state.data.places}
                    enabledCategories={enabledCategories}
                    enabledPriorities={enabledPriorities}
                    enabledBusyness={enabledBusyness}
                    onSoloSelect={toggleCategory}
                    onSoloPriority={togglePriority}
                    onSoloBusyness={toggleBusyness}
                    onReset={resetCategories}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {showOrbs && filteredPlaces.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.92)] px-4 py-3 text-center text-sm text-stone-700 shadow-md backdrop-blur dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.9)] dark:text-stone-300">
                  No places match these filters.
                  <button
                    type="button"
                    onClick={resetCategories}
                    className="pointer-events-auto ml-2 text-rose-700 underline decoration-rose-500/40 hover:decoration-rose-500 dark:text-rose-300"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}

            {showList && (
              <div
                className="absolute inset-0 overflow-y-auto"
                style={{
                  paddingTop: "calc(env(safe-area-inset-top, 0px) + 128px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
                }}
              >
                <MapModeFallbackList
                  places={filteredPlaces}
                  onSelect={(p) => {
                    setSheetInitialMode("expanded")
                    morphAnchorRef.current = null
                    setSelected(p)
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Location status */}
        <AnimatePresence>
          {(location || locating) && (
            <motion.button
              type="button"
              key="loc-pill"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={
                reduce ? { duration: 0.01 } : { duration: 0.28, ease: easeOutExpo, delay: 0.14 }
              }
              onClick={requestDeviceLocation}
              className={
                "pointer-events-auto absolute left-1/2 z-10 max-w-[min(20rem,70vw)] -translate-x-1/2 border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.9)] px-3 py-2 text-left shadow-[0_8px_24px_rgba(28,25,23,0.1)] backdrop-blur-xl transition hover:bg-[rgba(255,254,250,0.98)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.82)] dark:hover:bg-[rgba(28,25,23,0.92)] " +
                (userNeighborhood ? "rounded-2xl" : "rounded-full")
              }
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
              aria-label={
                locating
                  ? "Finding your location"
                  : location?.source === "geolocation"
                    ? "Using live location. Tap to refresh."
                    : "Anchored to day center. Tap to refresh location."
              }
            >
              <div className="flex items-center gap-2 text-[11px] font-medium text-stone-700 dark:text-stone-200">
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-stone-500" aria-hidden />
                ) : (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span
                      className={
                        "absolute inline-flex h-full w-full rounded-full opacity-60 " +
                        (location?.source === "geolocation"
                          ? "bg-rose-500 " + (reduce ? "" : "animate-ping")
                          : "bg-amber-500")
                      }
                    />
                    <span
                      className={
                        "relative inline-flex h-2 w-2 rounded-full " +
                        (location?.source === "geolocation" ? "bg-rose-600" : "bg-amber-500")
                      }
                    />
                  </span>
                )}
                <MapPin className="hidden h-3 w-3 shrink-0 sm:inline" aria-hidden />
                <span className="truncate">
                  {locating
                    ? "Finding you…"
                    : location?.source === "geolocation"
                      ? `${userNeighborhood ?? location.label ?? "You"} · Live`
                      : userNeighborhood
                        ? `${userNeighborhood} · Day center`
                        : (location?.label ?? "Day center")}
                </span>
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selected && (
          <PlaceDetailSheet
            key={selected.id}
            place={selected}
            onClose={closeSheetWithMorph}
            userLat={location?.lat}
            userLng={location?.lng}
            initialMode={sheetInitialMode}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function LoadingPulse({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#F5F2ED]/60 dark:bg-[#171613]/60">
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0.01 } : { duration: 0.28, ease: easeOutExpo }}
        className="relative flex items-center gap-2 rounded-full border border-[rgba(28,25,23,0.08)] bg-[rgba(255,254,250,0.92)] px-4 py-2.5 text-xs font-medium text-stone-700 shadow-[0_8px_28px_rgba(28,25,23,0.1)] backdrop-blur-xl dark:border-[rgba(255,252,245,0.06)] dark:bg-[rgba(28,25,23,0.88)] dark:text-stone-300"
        role="status"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-600" aria-hidden />
        Loading places…
      </motion.div>
    </div>
  )
}
