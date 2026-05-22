import { lazy, Suspense, useEffect, useMemo, useState, useRef } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { X, MapPin, Navigation, Bug, Loader2, Crosshair, Globe2, List as ListIcon, Info } from "lucide-react"
import { IgIcon } from "./IgIcon"
import { KstClock } from "./KstClock"
import { useGetToken } from "@/lib/safeAuth"
import { isWebglSupported } from "./webglSupport"
import { MapModeCompass } from "./MapModeCompass"
// Detailed3DScene pulls in 3DTilesRendererJS (~160 kB gz) — keep it
// lazy-loaded so /korea/ingest and other Korea routes don't pay the
// cost. Map Mode is the only consumer.
const Detailed3DScene = lazy(() =>
  import("./Detailed3DScene").then((m) => ({ default: m.Detailed3DScene })),
)
import { MapModeFallbackList } from "./MapModeFallbackList"
import { MapModeFilterBar } from "./MapModeFilterBar"
import { PlaceDetailSheet } from "./PlaceDetailSheet"
import { useNeighborhoodLabel } from "./allKoreaDongs"
import type { BusynessLevel, PlacePriority, PlacesResponse, RankedPlace, UserLocation } from "./mapModeTypes"
import { detectTier, loadEffectPrefs, saveEffectPrefs, type EffectPrefs } from "./deviceTier"


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
  /** When set, the overlay auto-selects this place once the day's
   *  places have loaded — entering focus mode on it. Used by the
   *  itinerary's Instagram Saves cards to deep-link into Map Mode
   *  centered on a specific save. */
  initialFocusPlaceId?: string
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: PlacesResponse }
  | { status: "error"; message: string }

export function MapModeOverlay({ daySlug, dayTitle, onClose, initialFocusPlaceId }: MapModeOverlayProps) {
  const reduce = useReducedMotion()
  const getToken = useGetToken()
  const [testMode, setTestMode] = useState(false)
  // Default to mock-location ON during pre-trip testing — geolocation from
  // anywhere outside Korea anchors the camera in the wrong place and breaks
  // the neighborhood-highlight framing. User can flip off in the debug menu.
  const [mockHotel, setMockHotel] = useState(true)
  const [debugOpen, setDebugOpen] = useState(false)
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [locating, setLocating] = useState(false)
  const debugRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<LoadState>({ status: "loading" })
  const [selected, setSelected] = useState<RankedPlace | null>(null)
  // Sheet open-mode: list-view selections open the sheet expanded (no
  // orb focus state behind it to preserve); 3D-scene selections open
  // compact so the focus line stays visible.
  const [sheetInitialMode, setSheetInitialMode] = useState<"compact" | "expanded">("compact")
  const [webglFailed, setWebglFailed] = useState<boolean>(() => !isWebglSupported())
  // Map legend defaults to collapsed — it's a one-time explainer, not
  // something the user needs every session. Tap the small chip to
  // expand and read the dot meanings.
  const [legendOpen, setLegendOpen] = useState(false)
  // Detailed-3D post-processing toggles. Tier-detected on first mount;
  // user overrides persist via localStorage so the same browser
  // remembers its preference. Toggling any flag rebuilds the scene's
  // useEffect (cheaper than re-mounting the whole overlay and lets
  // OrbitControls keep state). Lifted into overlay state so the debug
  // menu can write directly into the prop the scene reads.
  const [effects, setEffects] = useState<EffectPrefs>(() =>
    loadEffectPrefs(detectTier(), reduce ?? false),
  )
  function toggleEffect(key: keyof EffectPrefs, value: boolean) {
    setEffects((prev) => {
      const next = { ...prev, [key]: value }
      saveEffectPrefs(next)
      return next
    })
  }

  // Reverse-geocode the user's current location to a dong label
  // (e.g. "강남구 압구정동"). Surfaces beneath the city label in the
  // location pill. Null until the dongs data has loaded.
  const userNeighborhood = useNeighborhoodLabel(location?.lat, location?.lng)

  // Deep-link focus: when the parent opened Map Mode with a target
  // place id (e.g. clicking an Instagram save card on the itinerary),
  // auto-select it once the day's places have loaded. The 3D scene
  // animates the camera into focus mode via its selectedId prop. We
  // honor the focus id exactly once per overlay mount so re-renders
  // don't re-snap to it after the user has navigated away.
  const honoredFocusRef = useRef(false)
  useEffect(() => {
    if (honoredFocusRef.current) return
    if (!initialFocusPlaceId) return
    if (state.status !== "success") return
    const match = state.data.places.find((p) => p.id === initialFocusPlaceId)
    if (match) {
      setSheetInitialMode("compact")
      setSelected(match)
      honoredFocusRef.current = true
    }
  }, [initialFocusPlaceId, state])
  // Multi-select filter state — UNION semantics. A place is visible if its
  // category is in `enabledCategories` OR its priority is in `enabledPriorities`.
  // Both sets are independently toggled. By default only the day's
  // scheduled + core pins are visible (supplemental hidden — same nearby
  // extras across every day, mostly noise). Selecting an explicit category
  // like "Shopping" surfaces ALL shopping places regardless of priority.
  const [enabledCategories, setEnabledCategories] = useState<Set<string>>(() => new Set())
  const [enabledPriorities, setEnabledPriorities] = useState<Set<PlacePriority>>(() => new Set(['scheduled', 'core']))
  const [enabledBusyness, setEnabledBusyness] = useState<Set<BusynessLevel>>(() => new Set())
  const [viewMode, setViewMode] = useState<"orb" | "list">("orb")
  const sceneContainerRef = useRef<HTMLDivElement>(null)
  // Live camera yaw, written by the Three.js tick loop, read by the
  // compass each frame. Ref so the React tree doesn't re-render every
  // time the user drags.
  const yawRef = useRef<number>(0)
  // Last orb-tap screen position. Captured by a pointer-up listener on
  // the scene container so we can use it as the View Transitions anchor
  // for the orb → sheet morph below.
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null)
  // Anchor for the currently-open sheet so the close transition can
  // morph back to the orb's original screen position.
  const morphAnchorRef = useRef<{ x: number; y: number; color: string } | null>(null)
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
    // dispatch path doesn't depend on the DOM structure of the scene.
    window.dispatchEvent(new CustomEvent(name))
  }
  function resetView() {
    dispatchSceneEvent("korea-map-reset")
  }
  function orientNorth() {
    dispatchSceneEvent("korea-map-orient-north")
  }

  // ── Orb → sheet morph (View Transitions) ─────────────────────────
  // Capture the last pointer-up position on the 3D scene container so
  // we can morph the sheet open from where the user actually tapped
  // the orb. Pointer-up reads the precise tap location; we time-stamp
  // it so an unrelated selection (e.g. deep-link via
  // initialFocusPlaceId) that didn't originate from a tap doesn't
  // anchor to a stale position.
  useEffect(() => {
    const el = sceneContainerRef.current
    if (!el) return
    const onPointerUp = (e: PointerEvent) => {
      lastTapRef.current = { x: e.clientX, y: e.clientY, at: performance.now() }
    }
    el.addEventListener("pointerup", onPointerUp, true)
    return () => {
      el.removeEventListener("pointerup", onPointerUp, true)
    }
  }, [])

  // Open the sheet using View Transitions when possible, with an orb
  // stand-in element that morphs into the sheet's icon block. The
  // stand-in mimics the frosted-orb appearance + color tint so the
  // visual continuity reads as "zooming into the orb you tapped".
  //
  // Browsers without `document.startViewTransition` (Firefox, older
  // Safari) get the existing motion-driven slide-up — same UX, no
  // morph. `prefers-reduced-motion` skips the morph (the sheet already
  // honors `reduce` with a plain opacity fade).
  function openSheetWithMorph(p: RankedPlace, initialMode: "compact" | "expanded") {
    const tapped = lastTapRef.current
    const recent = tapped && performance.now() - tapped.at < 1500 ? tapped : null
    morphAnchorRef.current = recent
      ? { x: recent.x, y: recent.y, color: p.color }
      : null
    setSheetInitialMode(initialMode)

    const canMorph =
      !reduce &&
      recent !== null &&
      typeof document !== "undefined" &&
      typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function"

    if (!canMorph) {
      setSelected(p)
      return
    }

    // Mount a transient orb stand-in at the tap location, mark it with
    // the same `view-transition-name` the sheet's icon block will carry,
    // then start the transition. The browser snapshots the stand-in's
    // bounding box as the "before" state, mounts the sheet (which now
    // owns the same view-transition-name), and morphs between them.
    const standIn = document.createElement("div")
    standIn.setAttribute("aria-hidden", "true")
    standIn.style.cssText = [
      "position:fixed",
      "z-index:40",
      "width:44px",
      "height:44px",
      `left:${recent!.x - 22}px`,
      `top:${recent!.y - 22}px`,
      "border-radius:9999px",
      `background:radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), ${p.color}66 65%, ${p.color}22 100%)`,
      `box-shadow:0 0 0 1px ${p.color}55, 0 6px 20px ${p.color}55`,
      "pointer-events:none",
      "view-transition-name:place-detail-morph",
    ].join(";")
    document.body.appendChild(standIn)

    type VTDocument = Document & {
      startViewTransition: (cb: () => void | Promise<void>) => { finished: Promise<void> }
    }
    const transition = (document as VTDocument).startViewTransition(() => {
      standIn.remove()
      setSelected(p)
    })
    transition.finished.catch(() => {
      if (standIn.isConnected) standIn.remove()
    })
  }

  // Close the sheet with a reverse morph toward the orb when we still
  // have a recent anchor. Falls through to the existing motion-driven
  // exit otherwise.
  function closeSheetWithMorph() {
    const anchor = morphAnchorRef.current
    const canMorph =
      !reduce &&
      anchor !== null &&
      typeof document !== "undefined" &&
      typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function"
    if (!canMorph) {
      setSelected(null)
      morphAnchorRef.current = null
      return
    }
    type VTDocument = Document & {
      startViewTransition: (cb: () => void | Promise<void>) => { finished: Promise<void> }
    }
    const standIn = document.createElement("div")
    standIn.setAttribute("aria-hidden", "true")
    standIn.style.cssText = [
      "position:fixed",
      "z-index:40",
      "width:44px",
      "height:44px",
      `left:${anchor!.x - 22}px`,
      `top:${anchor!.y - 22}px`,
      "border-radius:9999px",
      `background:radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55), ${anchor!.color}66 65%, ${anchor!.color}22 100%)`,
      `box-shadow:0 0 0 1px ${anchor!.color}55, 0 6px 20px ${anchor!.color}55`,
      "pointer-events:none",
      "view-transition-name:place-detail-morph",
    ].join(";")
    const transition = (document as VTDocument).startViewTransition(() => {
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
    void (async () => {
      try {
        const token = await getToken()
        const headers: Record<string, string> = {}
        if (token) headers["Authorization"] = `Bearer ${token}`
        const r = await fetch(
          `/api/korea/day/${encodeURIComponent(daySlug)}/places?${qs.toString()}`,
          { headers },
        )
        if (!r.ok) throw new Error(`Places fetch ${r.status}`)
        const data = await r.json() as PlacesResponse
        setState({ status: "success", data })
      } catch (err) {
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) })
      }
    })()
  }, [daySlug, location, testMode, getToken])

  const filteredPlaces = useMemo(() => {
    if (state.status !== "success") return []
    // Union semantics: visible if category OR priority matches. When BOTH
    // sets are empty (the "reset" state), show nothing — the reset button
    // re-applies the default (scheduled + core priorities enabled).
    if (enabledCategories.size === 0 && enabledPriorities.size === 0) return []
    return state.data.places.filter((p) => {
      const passesFilter = enabledCategories.has(p.category) || enabledPriorities.has(p.priority)
      if (!passesFilter) return false
      // Busyness is an intersection filter (AND): when any busyness levels are
      // selected, only places with a matching busyness level pass through.
      if (enabledBusyness.size > 0) {
        if (!p.busyness || !enabledBusyness.has(p.busyness)) return false
      }
      return true
    })
  }, [state, enabledCategories, enabledPriorities, enabledBusyness])

  const counts = useMemo(() => {
    if (state.status !== "success") return { scheduled: 0, core: 0, supplemental: 0 }
    const acc = { scheduled: 0, core: 0, supplemental: 0 }
    for (const p of filteredPlaces) acc[p.priority]++
    return acc
  }, [state, filteredPlaces])

  // Toggle a category in/out of the enabled set. Multi-select friendly —
  // clicking "Shopping" then "Cafe" enables both; clicking "Shopping" a
  // second time removes it.
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
    setEnabledPriorities(new Set(['scheduled', 'core']))
    setEnabledBusyness(new Set())
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
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-stone-700 transition hover:border-rose-300 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
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

        <KstClock />

        <button
          type="button"
          onClick={requestLocation}
          disabled={locating}
          title="Re-fetch your location"
          aria-label="Re-fetch your location"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-stone-300 bg-stone-50 px-3 text-xs font-medium text-stone-700 transition hover:border-rose-300 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-200"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Navigation className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="hidden sm:inline">Locate</span>
        </button>

        {!webglFailed && (
          <div role="group" aria-label="View mode" className="inline-flex h-10 shrink-0 overflow-hidden rounded-full border border-stone-300 bg-stone-50 text-xs font-medium dark:border-stone-700 dark:bg-stone-900">
            <button
              type="button"
              onClick={() => setViewMode("orb")}
              aria-pressed={viewMode === "orb"}
              aria-label="3D bubble view"
              title="3D bubble view"
              className={
                "inline-flex items-center gap-1 px-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
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
              aria-label="List view"
              title="List view"
              className={
                "inline-flex items-center gap-1 px-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
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
              "inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 " +
              (testMode || mockHotel
                ? "border-violet-400 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-100"
                : "border-stone-300 bg-stone-50 text-stone-700 hover:border-violet-300 hover:text-violet-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-violet-700 dark:hover:text-violet-200")
            }
          >
            <Bug className="h-3.5 w-3.5" aria-hidden />
            <span>Debug</span>
            {(testMode || mockHotel) && (
              <span
                aria-hidden
                className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[9px] font-bold leading-none text-white"
              >
                {(testMode ? 1 : 0) + (mockHotel ? 1 : 0)}
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

                <div className="mx-2 my-1 border-t border-stone-200 dark:border-stone-800" />
                <div className="px-2 pb-0.5 pt-1 font-mono text-[9px] uppercase tracking-widest text-stone-500 dark:text-stone-500">
                  Scene effects
                </div>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                    checked={effects.fog}
                    onChange={(e) => toggleEffect("fog", e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
                      Atmospheric fog
                    </div>
                    <div className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                      Exponential haze that tints with the KST hour.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                    checked={effects.godRays}
                    onChange={(e) => toggleEffect("godRays", e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
                      God rays
                    </div>
                    <div className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                      Volumetric sun shafts. Heavier — defaults off on low-tier GPUs.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl p-2 transition hover:bg-stone-50 dark:hover:bg-stone-900">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                    checked={effects.grade}
                    onChange={(e) => toggleEffect("grade", e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-stone-900 dark:text-stone-100">
                      Time-of-day grade
                    </div>
                    <div className="text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                      CSS filter that warms/cools the canvas by hour.
                    </div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2 transition hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:hover:bg-rose-950/60">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
                    checked={effects.maxQuality}
                    onChange={(e) => toggleEffect("maxQuality", e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-rose-900 dark:text-rose-100">
                      Max Quality (experimental)
                    </div>
                    <div className="text-[11px] leading-snug text-rose-700/80 dark:text-rose-300/70">
                      HDR + AgX tonemap, per-hour bloom, ray-marched
                      volumetric clouds, SMAA, in-shader grade. Sharper
                      tiles. Budgeted for iPhone 17 Pro / M-class
                      hardware.
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
                  <Suspense fallback={<LoadingPulse />}>
                    <Detailed3DScene
                      places={filteredPlaces}
                      neighborhoods={state.data.neighborhoods ?? []}
                      onSelect={(p) => openSheetWithMorph(p, "compact")}
                      onDeselect={() => setSelected(null)}
                      selectedId={selected?.id ?? null}
                      reducedMotion={reduce ?? undefined}
                      onWebglError={() => setWebglFailed(true)}
                      userLat={location?.lat}
                      userLng={location?.lng}
                      yawRef={yawRef}
                      effects={effects}
                    />
                  </Suspense>
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
                  className="absolute right-3 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-stone-700 shadow-md backdrop-blur transition hover:bg-stone-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:bg-stone-900/85 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-rose-200"
                  style={{ top: "calc(env(safe-area-inset-top, 0px) + 76px)" }}
                >
                  <Crosshair className="h-4 w-4" aria-hidden />
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
              <div
                className="absolute inset-0 overflow-y-auto"
                style={{
                  paddingTop: "calc(env(safe-area-inset-top, 0px) + 124px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
                }}
              >
                <MapModeFallbackList
                  places={filteredPlaces}
                  onSelect={(p) => {
                    // List view has no orb to morph from — skip the
                    // View Transition and use the sheet's default
                    // motion-driven entry.
                    setSheetInitialMode("expanded")
                    morphAnchorRef.current = null
                    setSelected(p)
                  }}
                />
              </div>
            )}
          </>
        )}

        {/* Legend — collapsed by default. The closed chip is a small
            info circle in the bottom-left; tapping expands the full
            dot legend. Only in orb view; list view doesn't need 3D hints. */}
        {showOrbs && (
          <div
            className="absolute left-3 z-10"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            {legendOpen ? (
              <div className="flex flex-col gap-1.5 rounded-2xl bg-white/85 px-3 py-2 text-[10px] font-medium text-stone-700 shadow-md backdrop-blur dark:bg-stone-900/85 dark:text-stone-300">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500 dark:text-stone-500">
                    Legend
                  </span>
                  <button
                    type="button"
                    onClick={() => setLegendOpen(false)}
                    aria-label="Collapse legend"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>
                <Dot color="#ff4d6d" label="Scheduled · in your plan" />
                <Dot color="#fb923c" label="Core · on today's itinerary" />
                <Dot color="#a3a3a3" label="Supplemental · nearby extras" />
                {state.status === "success" && state.data.places.some((p) => p.subcategory === "instagram") && (
                  <div className="flex items-center gap-1.5">
                    <IgIcon className="h-3 w-3 text-rose-500" aria-hidden />
                    <span>Instagram save</span>
                  </div>
                )}
                <div className="mt-1 border-t border-stone-200 pt-1 text-[9px] text-stone-500 dark:border-stone-800 dark:text-stone-500">
                  Drag to rotate · pinch to zoom · tap a bubble
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLegendOpen(true)}
                aria-label="Show map legend"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-stone-700 shadow-md backdrop-blur transition hover:bg-stone-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500/60 dark:bg-stone-900/85 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-rose-200"
              >
                <Info className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        )}

        {/* Location pill */}
        {location && (
          <div
            className={"pointer-events-none absolute right-3 z-10 max-w-[60vw] bg-white/85 px-3 py-1.5 text-[10px] font-medium text-stone-700 shadow-md backdrop-blur dark:bg-stone-900/85 dark:text-stone-300 " + (userNeighborhood ? "rounded-2xl" : "rounded-full")}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            <div className="flex items-center gap-1.5">
              <MapPin className="inline-block h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">
                {location.label}
                {location.source === "geolocation" && " · live"}
              </span>
            </div>
            {userNeighborhood && (
              <div className="mt-0.5 truncate pl-[18px] text-[10px] font-normal text-stone-500 dark:text-stone-400">
                {userNeighborhood}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail sheet */}
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
