import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { Box, ChevronLeft, ChevronRight, ExternalLink, Footprints, LocateFixed, Pause, Pencil, Play, Route, Scan, X } from "lucide-react"
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
  const [hasUser, setHasUser] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const needleRef = useRef<SVGSVGElement>(null)
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
          if (needleRef.current) needleRef.current.style.transform = `rotate(${(-bearing).toFixed(4)}rad)`
        },
        onTilt: setTilted,
        onAttribution: setCredit,
        onInteract: () => setPlaying(false),
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
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      if (before?.isConnected) before.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const root = rootRef.current
      if (!root) return
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

  useEffect(() => {
    if (status === "failed") closeRef.current?.focus({ preventScroll: true })
  }, [status])

  // Keep the selected row in view in the desktop list.
  useEffect(() => {
    if (!selectedId || !wide) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-stop="${CSS.escape(selectedId)}"]`)
    row?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" })
    // The row that was clicked (or the card's own Next button) has just been
    // replaced; hand focus to the new card instead of dropping it on <body>.
    const active = document.activeElement
    if (!active || active === document.body || listRef.current?.contains(active)) {
      row?.querySelector<HTMLElement>("article")?.focus({ preventScroll: true })
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

  // Look the place up by its own name ("Time Out Market"), not the plan's wording ("Lunch at…").
  const photoOf = useMemo(
    () => (selected ? { id: selected.id, title: selected.item.location?.name || selected.title, lat: selected.lat, lng: selected.lng } : null),
    [selected],
  )
  const photo = useStopPhoto(photoOf, city)
  const total = dayMeters(stops)
  const summary = `${plural(stops.length, "stop")}${stops.length > 1 ? ` · ${formatDistance(total)}` : ""}`
  const canTour = !reducedMotion && stops.length > 1
  const failed = status === "failed"

  const card = selected && (
    <StopCard
      stop={selected}
      stops={stops}
      photo={photo}
      playing={playing}
      onDirections={() => setPlaying(false)}
      onEdit={onEditStop ? () => onEditStop(selected.id) : undefined}
      onStep={step}
      onTourEnd={advanceTour}
    />
  )

  return createPortal(
    <div className="trips trips-portal" data-trip-accent={accent}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Day ${dayNumber} in 3D: ${title}`}
        {...sx(p.root)}
        onPointerDownCapture={() => sceneRef.current?.rest()}
      >
        <div ref={hostRef} {...sx(p.stage, status === "ready" && p.shown)} />
        <div ref={pinRef} {...sx(p.pins, status === "ready" && p.shown)} />

        {!failed && (
          <div {...sx(p.veil, status === "ready" && p.veilGone)} aria-hidden={status === "ready"}>
            <div {...sx(p.veilInner)} role="status">
              <p {...sx(a.eyebrow)}>{eyebrow}</p>
              <p {...sx(a.display, p.veilLine)}>
                Flying to <em {...sx(a.italic)}>{city || title}</em>…
              </p>
              <span {...sx(p.shimmer)} aria-hidden>
                <span {...sx(p.shimmerBar)} />
              </span>
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
                <button type="button" {...sx(a.btn, a.btnSecondary, p.tourBtn)} aria-pressed={playing} title="Play or pause the tour (Space)" onClick={toggleTour}>
                  {playing ? <Pause size={15} strokeWidth={2} aria-hidden /> : <Play size={15} strokeWidth={2} aria-hidden />}
                  {playing ? "Pause tour" : "Play tour"}
                </button>
              ) : (
                <span />
              )}
              <p {...sx(a.mono, p.summary)}>{summary}</p>
            </div>
            <ol ref={listRef} {...sx(p.list)}>
              {stops.map((stop, index) => {
                const leg = legInto(stops, index)
                const on = stop.id === selectedId
                const hot = on || (selectedIndex >= 0 && index === selectedIndex + 1)
                return (
                  <li key={stop.id} data-stop={stop.id} {...sx(p.item)}>
                    {leg && (
                      <p {...sx(p.leg)} aria-hidden={on}>
                        <span {...sx(p.legRail, hot && p.legRailHot)} />
                        {!on && legSummary(leg)}
                      </p>
                    )}
                    {on ? (
                      card
                    ) : (
                      <button
                        type="button"
                        {...sx(p.row)}
                        onClick={() => pick(stop.id)}
                        onPointerEnter={() => sceneRef.current?.setHot(stop.id)}
                        onPointerLeave={() => sceneRef.current?.setHot(null)}
                        onFocus={() => sceneRef.current?.setHot(stop.id)}
                        onBlur={() => sceneRef.current?.setHot(null)}
                      >
                        <span {...sx(p.badge)} aria-hidden>
                          {stop.label}
                        </span>
                        <span {...sx(p.rowName)}>
                          <span {...sx(a.srOnly)}>Stop {stop.label}: </span>
                          {stop.title}
                        </span>
                        {stop.item.time && <span {...sx(p.rowTime)}>{formatClock(stop.item.time)}</span>}
                      </button>
                    )}
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
              {credit && <p {...sx(p.credit, p.dockCredit)}>{credit}</p>}
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

        {!failed && (
          <>
            <div {...sx(p.controls)} role="group" aria-label="Map controls">
              <button type="button" {...sx(p.control)} aria-label="Point north up" title="Point north up" onClick={() => sceneRef.current?.orientNorth()}>
                <svg ref={needleRef} {...sx(p.compass)} width="20" height="20" viewBox="0 0 20 20" aria-hidden>
                  <path d="M10 1.5 13.4 10H6.6Z" {...sx(p.compassNorth)} />
                  <path d="M10 18.5 6.6 10h6.8Z" {...sx(p.compassSouth)} />
                </svg>
              </button>
              <button
                type="button"
                {...sx(p.control, tilted && p.controlOn)}
                aria-label="3D tilt"
                aria-pressed={tilted}
                title={tilted ? "Look straight down" : "Tilt the view"}
                onClick={() => setTilted(sceneRef.current?.toggleTilt() ?? tilted)}
              >
                <Box size={18} strokeWidth={1.75} aria-hidden />
              </button>
              <span {...sx(p.controlRule)} aria-hidden />
              <button
                type="button"
                {...sx(p.control, hasUser && p.controlOn)}
                aria-label={hasUser ? "Go to my location" : "Show my location"}
                title={hasUser ? "Go to my location" : "Show my location"}
                disabled={locating}
                onClick={onLocate}
              >
                <LocateFixed size={18} strokeWidth={1.75} aria-hidden />
              </button>
              <button type="button" {...sx(p.control)} aria-label="Fit all stops" title="Fit all stops (F)" onClick={fitAll}>
                <Scan size={18} strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            {wide && credit && <p {...sx(p.credit)}>{credit}</p>}
            {toast && (
              <p {...sx(p.toast)} role="status">
                {toast}
              </p>
            )}
          </>
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
    <article {...sx(p.card)} tabIndex={-1} aria-label={`Stop ${stop.label}: ${stop.title}`}>
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
        <h3 {...sx(a.display, p.cardTitle, a.wrap)}>{stop.title}</h3>
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
          <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(a.btn, a.btnPrimary, p.action)} onClick={onDirections}>
            <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
            Directions
          </a>
        )}
        {onEdit && (
          <button type="button" {...sx(a.btn, a.btnSecondary, p.action)} onClick={onEdit}>
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
          <h3 {...sx(a.display, p.sheetTitle)}>{stop.title}</h3>
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
          {stop.item.notes && <p {...sx(p.note, p.sheetNote)}>{stop.item.notes}</p>}
        </div>
        {photo.status !== "none" && (
          <div {...sx(p.thumb)}>
            {photo.status === "ready" ? <img src={photo.url} alt="" {...sx(p.photoImg)} /> : <span {...sx(a.skeleton, p.photoSkeleton)} />}
          </div>
        )}
      </div>
      <div {...sx(p.sheetActions)}>
        {maps && (
          <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(a.btn, a.btnPrimary, p.action)} onClick={onDirections}>
            <ExternalLink size={15} strokeWidth={1.75} aria-hidden />
            Directions
          </a>
        )}
        {onEdit && (
          <button type="button" {...sx(a.iconBtn)} aria-label="Edit stop" onClick={onEdit}>
            <Pencil size={17} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        {canTour && (
          <button type="button" {...sx(a.iconBtn)} aria-label={playing ? "Pause tour" : "Play tour"} aria-pressed={playing} onClick={onToggleTour}>
            {playing ? <Pause size={18} strokeWidth={1.75} aria-hidden /> : <Play size={18} strokeWidth={1.75} aria-hidden />}
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
                    <span {...sx(p.rowName)}>{stop.title}</span>
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
