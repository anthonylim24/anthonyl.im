import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { Box, ChevronLeft, ChevronRight, ExternalLink, Footprints, LocateFixed, Pause, Pencil, Play, Route, Scan, Square, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { externalMapsLink } from "@/lib/externalMaps"
import { a } from "../atlas.stylex"
import { useIsDark } from "../map/AtlasMap"
import { centroid, type LngLat } from "../map/geo"
import { formatClock, formatTripDate, itemIcon, plural, resolveAccent, titleCase } from "../meta"
import type { Trip, TripDay } from "../types"
import { tilesKey } from "./available"
import { useStopPhoto, type PhotoState } from "./photo"
import { p } from "./photoreal.stylex"
import { PhotorealScene, type Insets, type SceneStop } from "./scene"
import {
  announcement,
  dayMeters,
  dayStops,
  distanceToStops,
  formatDistance,
  legInto,
  legSummary,
  NEARBY_M,
  stepIndex,
  timeRange,
  tourNext,
  tourStart,
  type Stop,
} from "./stops"

// "Fly the day": the day's stops standing on a photoreal 3D city. This file
// is the chrome and the state; `scene.ts` is the engine, created once per
// open and driven through its methods.

export interface PhotorealOverlayProps {
  trip: Trip
  day: TripDay
  /** 1-based. */
  dayNumber: number
  initialStopId?: string
  onClose: () => void
  /** Present when the viewer can edit: close and open that stop's editor. */
  onEditStop?: (itemId: string) => void
}

const WIDE = "(min-width: 900px)"
const SWIPE_PX = 56

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window === "undefined" || !window.matchMedia || window.matchMedia(WIDE).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia(WIDE)
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])
  return wide
}

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter(
    (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
  )
}

function locate(): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"))
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
    )
  })
}

export default function PhotorealOverlay({ trip, day, dayNumber, initialStopId, onClose, onEditStop }: PhotorealOverlayProps) {
  const stops = useMemo(() => dayStops(day), [day])
  const wide = useWide()
  const dark = useIsDark()
  const reducedMotion = useReducedMotion()
  const accent = resolveAccent(trip.appearance?.accent)
  const city = day.city || trip.destinations[0] || ""
  const title = day.title || city || trip.name
  const eyebrow = [`Day ${dayNumber}`, formatTripDate(day.date, trip.timezone).replace(",", ""), day.title && city ? city : ""].filter(Boolean).join(" · ")

  const [status, setStatus] = useState<"loading" | "ready" | "failed">(stops.length ? "loading" : "failed")
  const [selectedId, setSelectedId] = useState<string | null>(() => (stops.some((s) => s.id === initialStopId) ? initialStopId! : null))
  const [playing, setPlaying] = useState(false)
  const [tilted, setTilted] = useState(true)
  const [credit, setCredit] = useState("")
  const [toast, setToast] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [refining, setRefining] = useState(false)
  const [hasUser, setHasUser] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const needleRef = useRef<SVGGElement>(null)
  const progressRef = useRef<HTMLSpanElement>(null)
  /** How the traveller last acted: decides whether a selection should move keyboard focus. */
  const keyboardRef = useRef(false)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const plateRef = useRef<HTMLElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const sceneRef = useRef<PhotorealScene | null>(null)

  const selectedIndex = selectedId ? stops.findIndex((s) => s.id === selectedId) : -1
  const selected = selectedIndex >= 0 ? stops[selectedIndex]! : null
  const sceneStops = useMemo<SceneStop[]>(
    () => stops.map((s) => ({ id: s.id, label: s.label, title: s.title, lat: s.lat, lng: s.lng, time: s.item.time })),
    [stops],
  )
  const latest = useRef({ sceneStops, selectedId, wide })
  latest.current = { sceneStops, selectedId, wide }

  const close = useLatestCallback(onClose)
  const pick = useCallback((id: string | null, keepTour = false) => {
    if (!keepTour) setPlaying(false)
    setSelectedId(id)
  }, [])
  const step = useCallback(
    (delta: 1 | -1) => {
      const at = stepIndex(selectedIndex >= 0 ? selectedIndex : null, delta, stops.length)
      if (at !== null) pick(stops[at]!.id)
    },
    [pick, selectedIndex, stops],
  )
  const toggleTour = useCallback(() => {
    if (playing) return setPlaying(false)
    const at = tourStart(selectedIndex >= 0 ? selectedIndex : null, stops.length)
    if (at === null) return
    setSelectedId(stops[at]!.id)
    setPlaying(true)
  }, [playing, selectedIndex, stops])
  const advanceTour = useCallback(() => {
    const at = tourNext(selectedIndex >= 0 ? selectedIndex : null, stops.length)
    if (at === null) setPlaying(false)
    else setSelectedId(stops[at]!.id)
  }, [selectedIndex, stops])
  const fitAll = useCallback(() => {
    setPlaying(false)
    setSelectedId(null)
    sceneRef.current?.fitAll()
  }, [])

  // Chrome covers part of the view; tell the camera what is left.
  const measure = useCallback((): Insets => {
    if (latest.current.wide) return { top: 24, right: 76, bottom: 40, left: 412 }
    const root = rootRef.current?.getBoundingClientRect()
    const plate = plateRef.current?.getBoundingClientRect()
    const dock = dockRef.current?.getBoundingClientRect()
    return {
      top: plate && root ? plate.bottom - root.top + 8 : 84,
      right: 12,
      bottom: dock && root ? root.bottom - dock.top + 4 : 240,
      left: 12,
    }
  }, [])

  // ── The engine: created once per open ────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current
    const pinLayer = pinRef.current
    const root = rootRef.current
    const first = latest.current
    const anchor = centroid(first.sceneStops)
    if (!host || !pinLayer || !root || !anchor) return
    let cancelled = false
    let scene: PhotorealScene | null = null
    PhotorealScene.create(
      {
        host,
        pinLayer,
        tokens: root,
        anchor,
        apiKey: tilesKey(),
        reducedMotion,
        timezone: trip.timezone,
        date: day.date,
        insets: measure(),
        initialStopId: first.selectedId,
        onSelect: (id) => pick(id),
        onReady: () => setStatus((s) => (s === "failed" ? s : "ready")),
        onError: () => setStatus("failed"),
        onYaw: (bearing) => {
          needleRef.current?.setAttribute("transform", `rotate(${((-bearing * 180) / Math.PI).toFixed(2)} 12 12)`)
        },
        onTilt: setTilted,
        onAttribution: setCredit,
        onInteract: () => setPlaying(false),
        onProgress: (progress) => {
          if (progressRef.current) progressRef.current.style.transform = `scaleX(${Math.max(0.06, progress).toFixed(3)})`
        },
        onRefining: setRefining,
      },
      first.sceneStops,
    )
      .then((created) => {
        if (cancelled) return created.dispose()
        scene = created
        sceneRef.current = created
        const now = latest.current
        if (now.sceneStops !== first.sceneStops) created.setStops(now.sceneStops)
        if (now.selectedId !== first.selectedId) created.select(now.selectedId)
        created.setInsets(measure())
      })
      .catch(() => {
        if (!cancelled) setStatus("failed")
      })
    return () => {
      cancelled = true
      scene?.dispose()
      sceneRef.current = null
    }
    // One engine per open; later changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  useEffect(() => {
    sceneRef.current?.setStops(sceneStops)
  }, [sceneStops])
  useEffect(() => {
    sceneRef.current?.select(selectedId)
  }, [selectedId])
  useEffect(() => {
    sceneRef.current?.setTheme()
  }, [dark, accent])
  useEffect(() => {
    if (selectedId && !stops.some((s) => s.id === selectedId)) setSelectedId(null)
  }, [selectedId, stops])

  useEffect(() => {
    const apply = () => sceneRef.current?.setInsets(measure())
    apply()
    const observer = new ResizeObserver(apply)
    for (const el of [rootRef.current, plateRef.current, dockRef.current]) if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [measure, wide, status])

  // ── Dialog behaviour: focus, scroll lock, keys ───────────────────────────
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    // Focus the dialog itself: the keyboard is inside it and Tab lands on Close,
    // but nothing wears a focus ring until the traveller actually uses the keyboard.
    rootRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const root = rootRef.current
      if (!root) return
      keyboardRef.current = true
      if (event.key === "Tab") {
        const nodes = focusables(root)
        if (nodes.length === 0) return
        const active = document.activeElement
        const at = nodes.indexOf(active as HTMLElement)
        let next: number
        if (at === -1 && active && root.contains(active)) {
          // Focus is parked on something not in the tab order (the stop card): carry on from there.
          const after = nodes.findIndex((node) => active.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
          next = event.shiftKey ? (after <= 0 ? nodes.length - 1 : after - 1) : after === -1 ? 0 : after
        } else {
          next = event.shiftKey ? (at <= 0 ? nodes.length - 1 : at - 1) : at === nodes.length - 1 ? 0 : at + 1
        }
        event.preventDefault()
        event.stopPropagation()
        nodes[next]!.focus()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const onControl = event.target instanceof HTMLElement && Boolean(event.target.closest("button, a"))
      let handled = true
      if (event.key === "Escape") close()
      else if (event.key === "ArrowRight") step(1)
      else if (event.key === "ArrowLeft") step(-1)
      else if (event.key === "Home" && stops.length) pick(stops[0]!.id)
      else if (event.key === "End" && stops.length) pick(stops[stops.length - 1]!.id)
      else if (event.key.toLowerCase() === "f") fitAll()
      else if (event.key === " " && !onControl && !reducedMotion && stops.length > 1) toggleTour()
      else handled = false
      // Keep the page underneath (arrow keys change day there) out of it.
      event.stopPropagation()
      if (handled) {
        event.preventDefault()
        sceneRef.current?.rest()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [close, fitAll, pick, reducedMotion, step, stops, toggleTour])

  // Selection and focus. From the keyboard, focus follows to the stop card's
  // heading, where the card (and the live region's news) is. By pointer or
  // during the tour, focus stays where it was and nothing gains a ring.
  useEffect(() => {
    if (!selectedId) return
    if (wide) {
      const row = listRef.current?.querySelector<HTMLElement>(`[data-stop="${CSS.escape(selectedId)}"]`)
      row?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" })
    }
    if (keyboardRef.current && !playingRef.current) {
      rootRef.current?.querySelector<HTMLElement>("[data-stop-title]")?.focus({ preventScroll: true })
    } else if (!document.activeElement || document.activeElement === document.body) {
      rootRef.current?.focus({ preventScroll: true })
    }
  }, [reducedMotion, selectedId, wide])

  // ── "You": never prompt on open ──────────────────────────────────────────
  const showUser = useLatestCallback((user: LngLat, announce: boolean) => {
    const away = distanceToStops(user, stops)
    if (away <= NEARBY_M) {
      sceneRef.current?.setUser(user)
      setHasUser(true)
      if (announce) sceneRef.current?.showUser()
    } else {
      sceneRef.current?.setUser(null)
      setHasUser(false)
      if (announce) setToast(`You’re about ${formatDistance(away)} from these stops, so you’re not on this map.`)
    }
  })
  useEffect(() => {
    if (status !== "ready" || !navigator.permissions?.query) return
    let cancelled = false
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => (result.state === "granted" ? locate() : null))
      .then((user) => {
        if (user && !cancelled) showUser(user, false)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [showUser, status])
  const onLocate = () => {
    if (hasUser) return sceneRef.current?.showUser()
    setLocating(true)
    setPlaying(false)
    locate()
      .then((user) => showUser(user, true))
      .catch(() => setToast("Couldn’t find your location. Check that location access is allowed for this site."))
      .finally(() => setLocating(false))
  }
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 5200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const photo = useStopPhoto(selected, city)
  const total = dayMeters(stops)
  const summary = `${plural(stops.length, "stop")}${stops.length > 1 ? ` · ${formatDistance(total)}` : ""}`
  const canTour = !reducedMotion && stops.length > 1
  const failed = status === "failed"

  const controls = !failed && (
    <div {...sx(p.controls)} role="group" aria-label="Map controls">
      <button type="button" {...sx(p.control, "group")} aria-label="Point north up" title="Point north up" onClick={() => sceneRef.current?.orientNorth()}>
        <svg {...sx(p.compass)} width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10.5" {...sx(p.compassRing)} />
          <g ref={needleRef}>
            <path d="M12 3.25 15.25 12h-6.5Z" {...sx(p.compassNorth)} />
            <path d="M12 20.75 8.75 12h6.5Z" {...sx(p.compassSouth)} />
            <circle cx="12" cy="12" r="1.25" {...sx(p.compassHub)} />
          </g>
        </svg>
        <span {...sx(p.tip)} aria-hidden>
          North up
        </span>
      </button>
      <button
        type="button"
        {...sx(p.control, !tilted && p.controlOn, "group")}
        aria-label="Top-down view"
        aria-pressed={!tilted}
        title={tilted ? "Look straight down" : "Tilt the view"}
        onClick={() => setTilted(sceneRef.current?.toggleTilt() ?? tilted)}
      >
        {tilted ? <Box size={18} strokeWidth={1.75} aria-hidden /> : <Square size={17} strokeWidth={1.75} aria-hidden />}
        <span {...sx(p.tip)} aria-hidden>
          {tilted ? "Top-down" : "Tilt"}
        </span>
      </button>
      <span {...sx(p.controlRule)} aria-hidden />
      <button
        type="button"
        {...sx(p.control, hasUser && p.controlOn, "group")}
        aria-label={hasUser ? "Go to my location" : "Show my location"}
        title={hasUser ? "Go to my location" : "Show my location"}
        disabled={locating}
        onClick={onLocate}
      >
        <LocateFixed size={18} strokeWidth={1.75} aria-hidden />
        <span {...sx(p.tip)} aria-hidden>
          My location
        </span>
      </button>
      <button type="button" {...sx(p.control, "group")} aria-label="Fit all stops" title="Fit all stops (F)" onClick={fitAll}>
        <Scan size={18} strokeWidth={1.75} aria-hidden />
        <span {...sx(p.tip)} aria-hidden>
          Fit all
        </span>
      </button>
    </div>
  )
  const sharpening = status === "ready" && refining && (
    <p {...sx(p.sharpen)} role="status">
      <span {...sx(p.sharpenDot)} aria-hidden />
      Sharpening…
    </p>
  )

  return createPortal(
    <div className="trips trips-portal" data-trip-accent={accent}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Day ${dayNumber} in 3D: ${title}`}
        tabIndex={-1}
        {...sx(p.root)}
        onPointerDownCapture={() => {
          keyboardRef.current = false
          sceneRef.current?.rest()
        }}
      >
        <div ref={hostRef} {...sx(p.stage, status === "ready" && p.shown)} />

        {!failed && (
          <div {...sx(p.veil, status === "ready" && p.veilGone)} aria-hidden={status === "ready"}>
            <div {...sx(p.veilInner)} role="status">
              <p {...sx(a.eyebrow)}>{eyebrow}</p>
              <p {...sx(a.display, p.veilLine)}>{title}</p>
              <p {...sx(p.veilChip)}>
                Loading {city || "the day"} in 3D…
                <span {...sx(p.shimmer)} aria-hidden>
                  <span ref={progressRef} {...sx(p.shimmerBar)} />
                </span>
              </p>
            </div>
          </div>
        )}

        {failed ? (
          <Failure eyebrow={eyebrow} stops={stops} onClose={onClose} closeRef={closeRef} />
        ) : wide ? (
          <aside {...sx(p.panel)} aria-label="Stops">
            <header {...sx(p.head)}>
              <button ref={closeRef} type="button" {...sx(a.iconBtn, p.close)} aria-label="Close 3D view" title="Close (Esc)" onClick={onClose}>
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
              <div {...sx(p.titleBlock)}>
                <p {...sx(a.eyebrow)}>{eyebrow}</p>
                <h2 {...sx(a.display, p.title, a.wrap)}>{title}</h2>
              </div>
            </header>
            <div {...sx(p.tourRow)}>
              {canTour ? (
                <button type="button" {...sx(a.btn, playing ? a.btnSecondary : a.btnPrimary, p.tourBtn)} aria-pressed={playing} title="Play or pause the tour (Space)" onClick={toggleTour}>
                  {playing ? <Pause size={15} strokeWidth={2} aria-hidden /> : <Play size={15} strokeWidth={2} aria-hidden />}
                  {playing ? "Pause tour" : "Play tour"}
                </button>
              ) : (
                <span />
              )}
              <p {...sx(a.mono, p.summary)}>{summary}</p>
            </div>
            {selected && (
              <div {...sx(p.cardWrap)}>
                <StopCard
                  key={selected.id}
                  stop={selected}
                  stops={stops}
                  photo={photo}
                  playing={playing}
                  onDirections={() => setPlaying(false)}
                  onEdit={onEditStop ? () => onEditStop(selected.id) : undefined}
                  onStep={step}
                  onTourEnd={advanceTour}
                />
              </div>
            )}
            <ol ref={listRef} {...sx(p.list)}>
              {stops.map((stop, index) => {
                const leg = legInto(stops, index)
                const on = stop.id === selectedId
                return (
                  <li key={stop.id} data-stop={stop.id} {...sx(p.item)}>
                    {/* With a card open the list is a compact index; the card carries the leg. */}
                    {leg && !selected && (
                      <p {...sx(p.leg)}>
                        <span {...sx(p.legRail, on && p.legRailHot)} />
                        {legSummary(leg)}
                      </p>
                    )}
                    <button
                      type="button"
                      {...sx(p.row, on && p.rowOn)}
                      aria-current={on ? "true" : undefined}
                      onClick={() => pick(stop.id)}
                      onPointerEnter={() => sceneRef.current?.setHot(stop.id)}
                      onPointerLeave={() => sceneRef.current?.setHot(null)}
                      onFocus={() => sceneRef.current?.setHot(stop.id)}
                      onBlur={() => sceneRef.current?.setHot(null)}
                    >
                      <span {...sx(p.badge, on && p.badgeOn)} aria-hidden>
                        {stop.label}
                      </span>
                      <span {...sx(p.rowName)}>
                        <span {...sx(a.srOnly)}>Stop {stop.label}: </span>
                        {stop.title}
                      </span>
                      {stop.item.time && <span {...sx(p.rowTime)}>{formatClock(stop.item.time)}</span>}
                    </button>
                  </li>
                )
              })}
            </ol>
            <p {...sx(p.hint)} aria-hidden>
              <span {...sx(p.hintItem)}>
                <kbd {...sx(p.key)}>←</kbd>
                <kbd {...sx(p.key)}>→</kbd> stops
              </span>
              {canTour && (
                <span {...sx(p.hintItem)}>
                  <kbd {...sx(p.key)}>Space</kbd> tour
                </span>
              )}
              <span {...sx(p.hintItem)}>
                <kbd {...sx(p.key)}>F</kbd> fit all
              </span>
            </p>
          </aside>
        ) : (
          <>
            <header ref={plateRef} {...sx(p.plate)}>
              <button ref={closeRef} type="button" {...sx(a.iconBtn, p.close)} aria-label="Close 3D view" onClick={onClose}>
                <X size={18} strokeWidth={1.75} aria-hidden />
              </button>
              <div {...sx(p.plateText)}>
                <p {...sx(a.eyebrow, p.plateEyebrow)}>{eyebrow}</p>
                <h2 {...sx(a.display, p.plateTitle)}>{title}</h2>
              </div>
            </header>
            <div ref={dockRef} {...sx(p.dock)}>
              {(credit || sharpening) && (
                <div {...sx(p.creditRow, p.dockCredit)}>
                  {sharpening}
                  {credit && <p {...sx(p.credit)}>{credit}</p>}
                </div>
              )}
              {stops.length > 1 && (
                <ol {...sx(p.rail)} aria-label="Stops">
                  {stops.map((stop) => (
                    <li key={stop.id}>
                      <button
                        type="button"
                        {...sx(p.railBtn)}
                        aria-label={`Stop ${stop.label}: ${stop.title}`}
                        aria-current={stop.id === selectedId ? "true" : undefined}
                        onClick={() => pick(stop.id)}
                        ref={stop.id === selectedId ? (el) => el?.scrollIntoView({ block: "nearest", inline: "center" }) : undefined}
                      >
                        <span {...sx(p.railDot, stop.id === selectedId && p.railDotOn)}>{stop.label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {selected ? (
                <PhoneSheet
                  key={selected.id}
                  stop={selected}
                  stops={stops}
                  photo={photo}
                  playing={playing}
                  canTour={canTour}
                  onToggleTour={toggleTour}
                  onDirections={() => setPlaying(false)}
                  onEdit={onEditStop ? () => onEditStop(selected.id) : undefined}
                  onStep={step}
                  onTourEnd={advanceTour}
                />
              ) : (
                <section {...sx(p.sheet)} aria-label="The day">
                  <div {...sx(p.sheetBody)}>
                    <div {...sx(p.sheetText)}>
                      <p {...sx(a.eyebrow)}>{summary}</p>
                      <h3 {...sx(a.display, p.sheetTitle)}>
                        The whole day, <em {...sx(a.italic)}>from above</em>
                      </h3>
                    </div>
                  </div>
                  <div {...sx(p.sheetActions)}>
                    {canTour && (
                      <button type="button" {...sx(a.btn, a.btnPrimary, p.action)} onClick={toggleTour}>
                        <Play size={15} strokeWidth={2} aria-hidden />
                        Play tour
                      </button>
                    )}
                    <button type="button" {...sx(a.btn, canTour ? a.btnSecondary : a.btnPrimary, p.action)} onClick={() => pick(stops[0]!.id)}>
                      Start at stop 1
                    </button>
                  </div>
                </section>
              )}
            </div>
          </>
        )}

        {controls}
        {/* After the chrome in the DOM so Tab reaches Close first; under it on screen (z-index). */}
        <div ref={pinRef} {...sx(p.pins, status === "ready" && p.shown)} />

        {!failed && wide && (credit || sharpening) && (
          <div {...sx(p.creditRow)}>
            {sharpening}
            {credit && <p {...sx(p.credit)}>{credit}</p>}
          </div>
        )}
        {!failed && toast && (
          <p {...sx(p.toast)} role="status">
            {toast}
          </p>
        )}

        <p {...sx(a.srOnly)} aria-live="polite">
          {selected ? announcement(selected, stops.length) : status === "ready" ? `All ${plural(stops.length, "stop")} in view` : ""}
        </p>
      </div>
    </div>,
    document.body,
  )
}

interface CardProps {
  stop: Stop
  stops: readonly Stop[]
  photo: PhotoState
  playing: boolean
  onDirections: () => void
  onEdit?: () => void
  onStep: (delta: 1 | -1) => void
  onTourEnd: () => void
}

function useCardFacts(stop: Stop, stops: readonly Stop[]) {
  const { item } = stop
  const leg = legInto(stops, stop.index)
  const Icon = itemIcon(item.kind, item.location?.category, item.reservation?.type)
  const kind = item.location?.category ? titleCase(item.location.category) : item.kind === "reservation" && item.reservation ? titleCase(item.reservation.type) : ""
  const maps = externalMapsLink({ name: stop.title, address: item.location?.address, lat: stop.lat, lng: stop.lng })
  return { leg, Icon, kind, maps, when: timeRange(item), count: stops.length }
}

function Progress({ playing, stopId, onEnd }: { playing: boolean; stopId: string; onEnd: () => void }) {
  return (
    <span {...sx(p.progress, playing && p.progressOn)} aria-hidden>
      {/* Keyed by stop: each stop gets a fresh seven seconds; pausing holds the bar where it is. */}
      <span key={stopId} {...sx(p.progressBar, !playing && p.paused)} onAnimationEnd={playing ? onEnd : undefined} />
    </span>
  )
}

function StopCard({ stop, stops, photo, playing, onDirections, onEdit, onStep, onTourEnd }: CardProps) {
  const { leg, Icon, kind, maps, when, count } = useCardFacts(stop, stops)
  return (
    <article {...sx(p.card)} aria-label={`Stop ${stop.label}: ${stop.title}`}>
      {photo.status !== "none" && (
        <div {...sx(p.photo)}>
          {photo.status === "ready" ? <img src={photo.url} alt="" {...sx(p.photoImg)} /> : <span {...sx(a.skeleton, p.photoSkeleton)} />}
        </div>
      )}
      <div {...sx(p.cardBody)}>
        <div {...sx(p.cardTop)}>
          <span {...sx(p.badge, p.badgeOn)} aria-hidden>
            {stop.label}
          </span>
          <p {...sx(a.eyebrow, p.cardEyebrow)}>
            Stop {stop.index + 1} of {count}
          </p>
        </div>
        <h3 data-stop-title tabIndex={-1} {...sx(a.display, p.cardTitle, a.wrap)}>
          {stop.title}
        </h3>
        {stop.plan && <p {...sx(p.plan)}>{stop.plan}</p>}
        {(when || kind) && (
          <p {...sx(p.meta)}>
            {when && <span>{when}</span>}
            {when && kind && (
              <span {...sx(p.metaDot)} aria-hidden>
                ·
              </span>
            )}
            {kind && (
              <span {...sx(p.metaIcon)}>
                <Icon size={13} strokeWidth={1.75} aria-hidden />
                {kind}
              </span>
            )}
          </p>
        )}
        {leg && (
          <p {...sx(p.legLine)}>
            {leg.walkMinutes === null ? (
              <Route size={14} strokeWidth={1.75} aria-hidden {...sx(p.legIcon)} />
            ) : (
              <Footprints size={14} strokeWidth={1.75} aria-hidden {...sx(p.legIcon)} />
            )}
            <span {...sx(a.wrap)}>
              {legSummary(leg)} from {leg.from}
            </span>
          </p>
        )}
        {stop.item.notes && <p {...sx(p.note)}>{stop.item.notes}</p>}
      </div>
      <div {...sx(p.actions)}>
        {maps && (
          <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(a.btn, a.btnSecondary, p.action)} onClick={onDirections}>
            <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
            Directions
          </a>
        )}
        {onEdit && (
          <button type="button" {...sx(a.btn, a.btnGhost, p.action)} onClick={onEdit}>
            <Pencil size={14} strokeWidth={1.75} aria-hidden />
            Edit stop
          </button>
        )}
        <span {...sx(p.stepper)}>
          <button type="button" {...sx(a.iconBtn)} aria-label="Previous stop" title="Previous stop (←)" disabled={stop.index === 0} onClick={() => onStep(-1)}>
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" {...sx(a.iconBtn)} aria-label="Next stop" title="Next stop (→)" disabled={stop.index === count - 1} onClick={() => onStep(1)}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </span>
      </div>
      <Progress playing={playing} stopId={stop.id} onEnd={onTourEnd} />
    </article>
  )
}

function PhoneSheet({
  stop,
  stops,
  photo,
  playing,
  canTour,
  onToggleTour,
  onDirections,
  onEdit,
  onStep,
  onTourEnd,
}: CardProps & { canTour: boolean; onToggleTour: () => void }) {
  const { leg, kind, maps, when, count } = useCardFacts(stop, stops)
  const [drag, setDrag] = useState<{ x: number; dx: number } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if ((event.target as HTMLElement).closest("button, a")) return
    setDrag({ x: event.clientX, dx: 0 })
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag) setDrag({ x: drag.x, dx: event.clientX - drag.x })
  }
  const onPointerEnd = () => {
    if (!drag) return
    if (drag.dx <= -SWIPE_PX) onStep(1)
    else if (drag.dx >= SWIPE_PX) onStep(-1)
    setDrag(null)
  }
  // Rubber-band at the ends so a swipe with nowhere to go still answers the finger.
  const atEnd = drag && ((drag.dx > 0 && stop.index === 0) || (drag.dx < 0 && stop.index === count - 1))
  const offset = drag ? drag.dx * (atEnd ? 0.18 : 0.6) : 0

  return (
    <section
      {...sx(p.sheet, drag && p.sheetDragging)}
      style={offset ? { transform: `translateX(${offset.toFixed(1)}px)` } : undefined}
      aria-label={`Stop ${stop.label}: ${stop.title}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div {...sx(p.sheetBody)}>
        <div {...sx(p.sheetText)}>
          <p {...sx(a.eyebrow, p.cardEyebrow)}>
            Stop {stop.index + 1} of {count}
            {kind ? ` · ${kind}` : ""}
          </p>
          <h3 data-stop-title tabIndex={-1} {...sx(a.display, p.sheetTitle, p.cardTitle)}>
            {stop.title}
          </h3>
          {stop.plan && <p {...sx(p.plan, p.planOne)}>{stop.plan}</p>}
          {(when || leg) && (
            <p {...sx(p.meta, p.metaLoose)}>
              {when && <span>{when}</span>}
              {leg && (
                <span {...sx(p.metaIcon)}>
                  {leg.walkMinutes === null ? <Route size={13} strokeWidth={1.75} aria-hidden /> : <Footprints size={13} strokeWidth={1.75} aria-hidden />}
                  {legSummary(leg)}
                </span>
              )}
            </p>
          )}
          {stop.item.notes && (
            <button type="button" {...sx(p.noteBtn)} aria-expanded={noteOpen} aria-label={noteOpen ? "Collapse note" : "Read the whole note"} onClick={() => setNoteOpen((open) => !open)}>
              <span {...sx(p.note, p.sheetNote, noteOpen && p.noteOpen)}>{stop.item.notes}</span>
            </button>
          )}
        </div>
        {photo.status !== "none" && (
          <div {...sx(p.thumb)}>
            {photo.status === "ready" ? <img src={photo.url} alt="" {...sx(p.photoImg)} /> : <span {...sx(a.skeleton, p.photoSkeleton)} />}
          </div>
        )}
      </div>
      <div {...sx(p.sheetActions)}>
        {/* One labelled action leads: the tour when there is one, otherwise the way there. */}
        {canTour && (
          <button type="button" {...sx(a.btn, playing ? a.btnSecondary : a.btnPrimary, p.action)} aria-pressed={playing} onClick={onToggleTour}>
            {playing ? <Pause size={15} strokeWidth={2} aria-hidden /> : <Play size={15} strokeWidth={2} aria-hidden />}
            {playing ? "Pause" : "Play tour"}
          </button>
        )}
        {maps &&
          (canTour ? (
            <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} title="Directions" {...sx(a.iconBtn)} onClick={onDirections}>
              <ExternalLink size={17} strokeWidth={1.75} aria-hidden />
            </a>
          ) : (
            <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(a.btn, a.btnPrimary, p.action)} onClick={onDirections}>
              <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
              Directions
            </a>
          ))}
        {onEdit && (
          <button type="button" {...sx(a.iconBtn)} aria-label="Edit stop" title="Edit stop" onClick={onEdit}>
            <Pencil size={17} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        <span {...sx(p.stepper)}>
          <button type="button" {...sx(a.iconBtn)} aria-label="Previous stop" disabled={stop.index === 0} onClick={() => onStep(-1)}>
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden />
          </button>
          <button type="button" {...sx(a.iconBtn)} aria-label="Next stop" disabled={stop.index === count - 1} onClick={() => onStep(1)}>
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </span>
      </div>
      <Progress playing={playing} stopId={stop.id} onEnd={onTourEnd} />
    </section>
  )
}

function Failure({
  eyebrow,
  stops,
  onClose,
  closeRef,
}: {
  eyebrow: string
  stops: readonly Stop[]
  onClose: () => void
  closeRef: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <div {...sx(p.fail)}>
      <section {...sx(p.failCard)} aria-labelledby="photoreal-fail-title">
        <div {...sx(p.failHead)}>
          <p {...sx(a.eyebrow)}>{eyebrow}</p>
          <h2 id="photoreal-fail-title" {...sx(a.display, p.failTitle)}>
            The 3D view <em {...sx(a.italic)}>couldn’t load</em>
          </h2>
          <p {...sx(a.body)}>
            {stops.length
              ? "Your stops are all still here. Open any of them in Maps, or head back to the day."
              : "This day has no pinned stops yet. Add a place to the day and it will stand on the map."}
          </p>
        </div>
        {stops.length > 0 && (
          <ol {...sx(p.failList)}>
            {stops.map((stop) => {
              const maps = externalMapsLink({ name: stop.title, address: stop.item.location?.address, lat: stop.lat, lng: stop.lng })
              return (
                <li key={stop.id} {...sx(p.failRow)}>
                  <span {...sx(p.badge)} aria-hidden>
                    {stop.label}
                  </span>
                  <span {...sx(p.failText)}>
                    <span {...sx(p.failName)}>{stop.title}</span>
                    {stop.item.time && <span {...sx(p.rowTime)}>{timeRange(stop.item)}</span>}
                  </span>
                  {maps && (
                    <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(p.failLink)}>
                      Directions
                      <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
                    </a>
                  )}
                </li>
              )
            })}
          </ol>
        )}
        <div {...sx(p.failFoot)}>
          <button ref={closeRef} type="button" {...sx(a.btn, a.btnPrimary, p.grow)} onClick={onClose}>
            Back to the day
          </button>
        </div>
      </section>
    </div>
  )
}
