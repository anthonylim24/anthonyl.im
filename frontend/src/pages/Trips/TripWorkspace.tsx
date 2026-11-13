import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutGrid,
  List,
  Map as MapIcon,
  MoreHorizontal,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { sx } from "@/styles/merge"
import { useTabTitle } from "@/hooks/useTabTitle"
import { externalMapsLink } from "@/lib/externalMaps"
import { useViewer } from "@/lib/safeAuth"
import { deleteTrip, duplicateTrip, generateItinerary } from "./tripsApi"
import { dayCount, formatClock, formatRange, formatTripDate, plural, resolveAccent, titleCase, todayIsoIn, tripTiming } from "./meta"
import { AtlasMap } from "./map/AtlasMap"
import { centroid, corePoints, DAY_PIN, dayPins, dayRoute, isLocated, locatedItems, tripDots, tripPins, type LngLat } from "./map/geo"
import { errorText, useTripEditor } from "./useTripEditor"
import { isMissingTripError, TripsNotFound } from "./TripsNotFound"
import { Menu, Modal, Spinner, type MenuItem } from "./components/kit"
import { ShareDialog } from "./components/ShareDialog"
import { AiSheet, briefToRequest, type AiRequest, type DraftBrief } from "./workspace/AiPanels"
import { DayPanel } from "./workspace/DayPanel"
import { DetailsDialog } from "./workspace/DetailsDialog"
import { OverviewPanel } from "./workspace/OverviewPanel"
import type { ItineraryItem, Trip, TripDay } from "./types"
import { a } from "./atlas.stylex"
import { share, ws as s } from "./workspace.stylex"

const MapModeOverlay = lazy(() => import("../Korea/MapModeOverlay").then((m) => ({ default: m.MapModeOverlay })))

const PHOTOREAL_READY = Boolean(
  import.meta.env.VITE_GOOGLE_MAP_TILES_API_KEY || import.meta.env.VITE_GOOGLE_PLACES_API_KEY,
)
/** Notices that describe a problem: announced as alerts and never auto-dismissed. */
const PROBLEM = /couldn|didn|isn’t|not |fail|error/i
const WIDE_QUERY = "(min-width: 1024px)"
const MAP_PADDING = { top: 84, right: 72, bottom: 96, left: 72 }
const MAP_PADDING_NARROW = { top: 76, right: 36, bottom: 120, left: 36 }

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window === "undefined" || !window.matchMedia || window.matchMedia(WIDE_QUERY).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia(WIDE_QUERY)
    const sync = () => setWide(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])
  return wide
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || Boolean(target.closest('[role="dialog"], [role="menu"]'))
}

type Dialog = null | "share" | "details" | "delete" | "clear" | { ai: "day" | "trip" }

export function TripWorkspace() {
  const editor = useTripEditor()
  const { dayId } = useParams<{ dayId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const viewer = useViewer()
  const wide = useWide()
  const [view, setView] = useState<"list" | "map">("list")
  const [dialog, setDialog] = useState<Dialog>(null)
  const [hotId, setHotId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [photoreal, setPhotoreal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLElement>(null)

  const { trip, editable } = editor
  const locked = editor.editorLocked || drafting
  const dayIndex = trip && dayId ? trip.days.findIndex((d) => d.id === dayId) : -1
  const day = trip && dayIndex >= 0 ? trip.days[dayIndex] : undefined
  const basePath = trip ? `/trips/${trip.slug ?? trip.id}` : "/trips"
  useTabTitle(trip ? `${day ? `Day ${dayIndex + 1} · ` : ""}${trip.name} · Trips` : null)

  // New day (or back to the overview): start at the top with nothing selected.
  useEffect(() => {
    setActiveId(null)
    setFocusId(null)
    setHotId(null)
    if (wide) paneRef.current?.scrollTo({ top: 0 })
    else window.scrollTo({ top: 0 })
    railRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId, trip?.id])

  // Deep link: /day/:id#item-<id> selects that stop.
  useEffect(() => {
    if (!day) return
    const id = location.hash.startsWith("#item-") ? decodeURIComponent(location.hash.slice(6)) : null
    if (id && day.items.some((i) => i.id === id)) setActiveId(id)
  }, [location.hash, day?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!trip) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || dialog !== null) return
      if (event.key === "Escape" && activeId) {
        setActiveId(null)
        setFocusId(null)
        return
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      const at = dayIndex + (event.key === "ArrowRight" ? 1 : -1)
      if (at < -1 || at >= trip.days.length) return
      event.preventDefault()
      navigate(at === -1 ? basePath : `${basePath}/day/${trip.days[at]!.id}`)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [trip, dayIndex, basePath, navigate, dialog, activeId])

  // Good news clears itself; anything that reads like a problem stays put.
  const notice = editor.notice
  useEffect(() => {
    if (!notice || PROBLEM.test(notice)) return
    const timer = setTimeout(() => editor.setNotice(null), 9000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice])

  const tripCenter = useMemo<LngLat | null>(() => {
    if (!trip) return null
    const all = trip.days.flatMap((d) => d.items.filter(isLocated).map((i) => ({ lat: i.location.lat, lng: i.location.lng })))
    return centroid(all) ?? trip.center ?? null
  }, [trip])

  const near = useMemo<LngLat | null>(() => (day ? (centroid(dayRoute(day)) ?? tripCenter) : tripCenter), [day, tripCenter])

  const pins = useMemo(() => (!trip ? [] : day ? dayPins(day, fresh) : tripPins(trip)), [trip, day, fresh])
  const dots = useMemo(() => (trip && !day ? tripDots(trip) : []), [trip, day])
  const routes = useMemo(() => (!trip ? [] : day ? [dayRoute(day)] : []), [trip, day])
  const focusPin = focusId ? pins.find((p) => p.id === focusId) : undefined
  const frameKey = `${day?.id ?? "all"}|${pins.map((p) => p.id).join(",")}|${focusPin?.id ?? ""}`

  const active = useMemo(() => {
    if (!trip || !activeId) return null
    for (let i = 0; i < trip.days.length; i++) {
      const item = trip.days[i]!.items.find((it) => it.id === activeId)
      if (item) return { item, day: trip.days[i]!, dayNumber: i + 1 }
    }
    return null
  }, [trip, activeId])

  // Touring: step through the day's pinned stops from the place card.
  const tour = useMemo(() => {
    if (!day || !activeId) return null
    const ids = locatedItems(day).map((i) => i.id)
    const at = ids.indexOf(activeId)
    return at < 0 ? null : { ids, at }
  }, [day, activeId])

  const locate = useCallback(
    (id: string) => {
      setActiveId(id)
      setFocusId(id)
      if (!wide) setView("map")
    },
    [wide],
  )

  const onAdded = useCallback((id: string) => {
    setFresh(new Set([id]))
  }, [])

  const hasItems = trip ? trip.days.some((d) => d.items.length > 0) : false

  const draft = async (brief: DraftBrief) => {
    if (!trip) return
    setDrafting(true)
    editor.setNotice(null)
    try {
      await editor.flushPendingSave()
      const { trip: next, summary } = await generateItinerary(editor.readToken, trip.id, {
        ...briefToRequest(brief),
        replaceExisting: hasItems,
      })
      editor.cancelPendingSave()
      editor.setTrip(next)
      editor.setSaveState("saved")
      const added = next.days.flatMap((d) => d.items.map((i) => i.id))
      editor.flashTouched(new Set(added))
      setFresh(new Set(added))
      editor.setNotice(
        added.length > 0
          ? (summary ?? `Drafted ${plural(added.length, "stop")} across ${plural(next.days.length, "day")}. Edit anything.`)
          : "The draft came back empty. Try again with a little more detail.",
      )
    } catch (err) {
      const message = errorText(err)
      editor.setNotice(
        /GEMINI|GROQ|ai_not_configured|503/i.test(message)
          ? "AI isn’t switched on for this server yet, so drafts are unavailable. You can still add stops yourself."
          : `The draft didn’t finish, so nothing changed. Try again in a moment. (${message})`,
      )
    } finally {
      setDrafting(false)
    }
  }

  const runAi = (request: AiRequest) => {
    if (request.type === "draft") void draft(request.brief)
    else if (request.type === "day" && day) editor.enhanceDay(day.id, request.prompt)
    else void editor.runEnhance("trip", undefined, request.prompt)
  }

  const act = async (key: string, work: () => Promise<void>) => {
    setBusy(key)
    try {
      await work()
    } catch (err) {
      editor.setNotice(`That didn’t go through. (${errorText(err)})`)
    } finally {
      setBusy(null)
    }
  }

  if (editor.state.status === "loading") {
    return (
      <div {...sx(s.root)} role="status" aria-label="Loading trip">
        <div {...sx(s.pane)}>
          <div {...sx(s.head)}>
            <div {...sx(a.skeleton)} style={{ height: "0.875rem", width: "9rem" }} />
            <div {...sx(a.skeleton, s.skeletonTitle)} />
            <div {...sx(a.skeleton)} style={{ height: "1rem", width: "14rem" }} />
          </div>
          <div {...sx(s.content)}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} {...sx(a.skeleton, s.skeletonRow)} />
            ))}
          </div>
        </div>
        {wide && <div {...sx(s.mapPane, a.skeleton)} />}
      </div>
    )
  }

  if (editor.state.status === "error" || !trip) {
    if (editor.state.status === "error" && isMissingTripError(editor.state.message)) return <TripsNotFound />
    return (
      <div {...sx(s.content)} style={{ maxWidth: "36rem", marginInline: "auto" }}>
        <div {...sx(a.alert)} role="alert">
          <p {...sx(a.wrap)} style={{ margin: 0 }}>
            Couldn’t open this trip. Check your connection, then try again.
            {editor.state.status === "error" ? ` (${editor.state.message})` : ""}
          </p>
        </div>
        <Link to="/trips" {...sx(a.btn, a.btnSecondary)} style={{ alignSelf: "flex-start" }}>
          Back to all trips
        </Link>
      </div>
    )
  }

  const accent = resolveAccent(trip.appearance?.accent)
  const timing = tripTiming(trip)
  const today = todayIsoIn(trip.timezone)
  const owner = editor.access === "owner"
  const showMap = wide || view === "map"

  const menu: MenuItem[] = [
    ...(editable && dayId
      ? [
          {
            label: "Improve whole trip with AI",
            icon: <Sparkles size={16} strokeWidth={1.75} aria-hidden />,
            disabled: locked,
            onSelect: () => setDialog({ ai: "trip" }),
          },
        ]
      : []),
    ...(editable
      ? [{ label: "Trip details", icon: <Settings2 size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setDialog("details") }]
      : []),
    {
      label: "Duplicate trip",
      icon: <Copy size={16} strokeWidth={1.75} aria-hidden />,
      onSelect: () =>
        void act("duplicate", async () => {
          await editor.flushPendingSave()
          const copy = await duplicateTrip(editor.readToken, editor.trip ?? trip)
          navigate(`/trips/${copy.slug ?? copy.id}`)
        }),
    },
    ...(owner && !trip.sharedWithAllUsers
      ? [
          {
            label: "Delete trip…",
            icon: <Trash2 size={16} strokeWidth={1.75} aria-hidden />,
            danger: true,
            separated: true,
            onSelect: () => setDialog("delete"),
          },
        ]
      : []),
  ]

  const activeMaps = active
    ? externalMapsLink({
        name: active.item.location?.name ?? active.item.title,
        address: active.item.location?.address,
        lat: active.item.location?.lat,
        lng: active.item.location?.lng,
      })
    : undefined

  return (
    <div {...sx(s.root)} data-trip-accent={accent}>
      <div {...sx(s.pane)} ref={paneRef}>
        {dayId ? (
          <header {...sx(s.headCompact, s.headCompactHide)}>
            <Link to={basePath} {...sx(s.compactTitle, a.truncate)} title="Back to the trip overview">
              {trip.name}
            </Link>
            <span {...sx(a.mono, a.muted, a.noShrink, s.compactDates)}>{formatRange(trip.startDate, trip.endDate)}</span>
            <span {...sx(a.grow)} />
            {editable && (
              <span {...sx(s.saveState, s.saveCompact)} role="status" aria-live="polite">
                <span
                  {...sx(s.saveDot, (editor.saveState === "saving" || editor.saveState === "dirty") && s.saveDotBusy, editor.saveState === "error" && s.saveDotError)}
                  aria-hidden
                />
                {editor.saveState === "error" ? (
                  <button type="button" {...sx(a.link)} onClick={() => editor.scheduleSave({ ...trip })}>
                    Not saved · Retry
                  </button>
                ) : editor.saveState === "saved" ? (
                  "Saved"
                ) : (
                  "Saving"
                )}
              </span>
            )}
            <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => setDialog("share")}>
              <Share2 size={14} strokeWidth={1.75} aria-hidden />
              Share
            </button>
            {busy === "duplicate" ? (
              <span {...sx(a.iconBtn, a.iconBtnSm)} role="status" aria-label="Duplicating">
                <Spinner />
              </span>
            ) : (
              <Menu
                label="More trip options"
                trigger={<MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />}
                triggerStyle={[a.iconBtn, a.iconBtnSm]}
                items={menu}
              />
            )}
          </header>
        ) : (
          <header {...sx(s.head)}>
            <p {...sx(a.eyebrow)}>
              <span {...sx(s.tripText)}>{timing.phase === "past" ? "Travelled" : timing.label}</span>
              {trip.destinations.join(" · ").toLowerCase() === trip.name.trim().toLowerCase()
                ? ""
                : ` · ${trip.destinations.join(" · ")}`}
              {trip.status === "draft" ? " · Draft" : ""}
            </p>
            {editable ? (
              <>
                <label {...sx(a.srOnly)} htmlFor="trip-name">
                  Trip name
                </label>
                <textarea
                  id="trip-name"
                  rows={1}
                  value={trip.name}
                  disabled={locked}
                  placeholder="Name this trip"
                  {...sx(s.titleInput, s.title, "trips-title-input")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                  }}
                  onChange={(event) => editor.scheduleSave({ ...trip, name: event.target.value.replace(/\s*\n\s*/g, " ") })}
                />
              </>
            ) : (
              <h1 {...sx(a.display, s.title, a.wrap)}>{trip.name}</h1>
            )}
            <div {...sx(s.headMeta)}>
              {editable ? (
                <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} style={{ marginLeft: "-0.875rem" }} onClick={() => setDialog("details")}>
                  <CalendarDays size={14} strokeWidth={1.75} aria-hidden />
                  {formatRange(trip.startDate, trip.endDate)} · {plural(dayCount(trip.startDate, trip.endDate), "day")}
                </button>
              ) : (
                <span {...sx(a.mono, a.muted)}>
                  {formatRange(trip.startDate, trip.endDate)} · {plural(dayCount(trip.startDate, trip.endDate), "day")}
                </span>
              )}
              {!editable && <span {...sx(a.chip)}>View only</span>}
            </div>
            <div {...sx(s.headActions)}>
              <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => setDialog("share")}>
                <Share2 size={14} strokeWidth={1.75} aria-hidden />
                Share
              </button>
              {editable && (
                <button type="button" {...sx(a.btn, a.btnSoft, a.btnSm)} disabled={locked} onClick={() => setDialog({ ai: "trip" })}>
                  <Sparkles size={14} strokeWidth={1.75} aria-hidden />
                  {hasItems ? "Improve with AI" : "Draft with AI"}
                </button>
              )}
              {busy === "duplicate" ? (
                <span {...sx(a.iconBtn, a.iconBtnSm)} role="status" aria-label="Duplicating">
                  <Spinner />
                </span>
              ) : (
                <Menu
                  label="More trip options"
                  align="start"
                  trigger={<MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />}
                  triggerStyle={[a.iconBtn, a.iconBtnSm]}
                  items={menu}
                />
              )}
              {editable && (
                <span {...sx(s.saveState)} role="status" aria-live="polite">
                  <span
                    {...sx(s.saveDot, (editor.saveState === "saving" || editor.saveState === "dirty") && s.saveDotBusy, editor.saveState === "error" && s.saveDotError)}
                    aria-hidden
                  />
                  {editor.saveState === "error" ? (
                    <button type="button" {...sx(a.link)} onClick={() => editor.scheduleSave({ ...trip })}>
                      Not saved · Retry
                    </button>
                  ) : editor.saveState === "saved" ? (
                    "Saved"
                  ) : (
                    "Saving"
                  )}
                </span>
              )}
            </div>
          </header>
        )}

        <nav {...sx(s.rail)} aria-label="Days" ref={railRef}>
          <Link to={basePath} {...sx(s.railItem, s.railAll, !dayId && s.railItemOn)} aria-current={!dayId ? "page" : undefined}>
            <LayoutGrid size={15} strokeWidth={1.75} aria-hidden />
            Overview
          </Link>
          {trip.days.map((d, index) => (
            <Link
              key={d.id}
              to={`${basePath}/day/${d.id}`}
              {...sx(s.railItem, d.id === dayId && s.railItemOn)}
              aria-current={d.id === dayId ? "page" : undefined}
              aria-label={`Day ${index + 1}, ${formatTripDate(d.date, trip.timezone, { weekday: "long", month: "long" })}${d.date === today ? ", today" : ""}, ${plural(d.items.length, "item")}`}
            >
              {d.date === today && <span {...sx(s.railToday)} aria-hidden />}
              <span {...sx(s.railDow, d.items.length === 0 && d.id !== dayId && s.railEmpty)}>
                {formatTripDate(d.date, trip.timezone, { weekday: "short", month: undefined, day: undefined })}
              </span>
              <span {...sx(s.railNum, d.items.length === 0 && d.id !== dayId && s.railEmpty)}>
                {formatTripDate(d.date, trip.timezone, { weekday: undefined, month: undefined, day: "numeric" })}
              </span>
            </Link>
          ))}
        </nav>

        {dayId && !day ? (
          <div {...sx(s.content)} role="alert">
            <h2 {...sx(a.display, s.dayTitle)}>That day isn’t on this trip</h2>
            <p {...sx(a.body)}>The dates may have changed since this link was made.</p>
            <Link to={basePath} {...sx(a.btn, a.btnSecondary)} style={{ alignSelf: "flex-start" }}>
              Back to the overview
            </Link>
          </div>
        ) : day ? (
          <DayPanel
            key={day.id}
            trip={trip}
            day={day}
            dayIndex={dayIndex}
            basePath={basePath}
            editable={editable}
            locked={locked}
            enhancing={editor.enhancingTarget === day.id}
            applying={editor.enhancingTarget === "apply"}
            run={editor.activeRun && editor.activeRun.scope === "day" && editor.activeRun.dayId === day.id ? editor.activeRun : null}
            dayOptions={editor.dayOptions}
            recentIds={editor.recentIds}
            hotId={hotId}
            activeId={activeId}
            editId={editId}
            near={near}
            onChange={editor.setDays}
            onDelete={editor.deleteItem}
            onAdded={onAdded}
            onHover={setHotId}
            onLocate={locate}
            onAskAi={() => setDialog({ ai: "day" })}
            onClear={() => setDialog("clear")}
            onApplyRun={editor.applyActiveRun}
            onDismissRun={editor.dismissRun}
            onPhotoreal={PHOTOREAL_READY ? () => setPhotoreal(true) : undefined}
          />
        ) : (
          <OverviewPanel
            trip={trip}
            basePath={basePath}
            editable={editable}
            locked={locked}
            drafting={drafting}
            enhancing={editor.enhancingTarget === "trip"}
            applying={editor.enhancingTarget === "apply"}
            run={editor.activeRun && editor.activeRun.scope === "trip" ? editor.activeRun : null}
            dayOptions={editor.dayOptions}
            onDraft={(brief) => void draft(brief)}
            onHoverDay={(id) => setHotId(id ? `${DAY_PIN}${id}` : null)}
            onApplyRun={editor.applyActiveRun}
            onDismissRun={editor.dismissRun}
          />
        )}
      </div>

      {showMap && (
        <div {...sx(s.mapPane)}>
          <AtlasMap
            pins={pins}
            routes={routes}
            frameKey={frameKey}
            framePoints={focusPin ? [focusPin] : corePoints(day ? pins : dots)}
            restCenter={tripCenter ?? undefined}
            restZoom={tripCenter ? 10.5 : 1.4}
            maxZoom={focusPin ? 16.2 : undefined}
            padding={wide ? MAP_PADDING : MAP_PADDING_NARROW}
            activeId={activeId}
            hotId={hotId}
            dots={dots}
            onSelect={(id) => {
              if (id.startsWith(DAY_PIN)) {
                navigate(`${basePath}/day/${id.slice(DAY_PIN.length)}`)
                return
              }
              setActiveId(id)
              setFocusId(null)
            }}
            onHover={setHotId}
            label={
              day
                ? `Map of day ${dayIndex + 1} with ${plural(pins.length, "pinned stop")}`
                : `Map of the whole trip with ${plural(pins.length, "pinned place")}`
            }
          >
            <p {...sx(s.mapChip)}>
              <span {...sx(a.truncate)}>
                {day ? `Day ${dayIndex + 1}${day.city ? ` · ${day.city}` : ""}` : "All days"} · {plural(day ? pins.length : dots.length, "place")}
              </span>
            </p>
            {active && (
              <aside {...sx(s.placeCard)} aria-label="Selected place">
                <div {...sx(a.between)} style={{ alignItems: "flex-start" }}>
                  <div {...sx(a.stack)} style={{ gap: "0.25rem" }}>
                    <p {...sx(a.eyebrow)}>
                      {tour ? `Stop ${tour.at + 1} of ${tour.ids.length}` : `Day ${active.dayNumber}`}
                      {active.item.time ? ` · ${formatClock(active.item.time)}` : ""}
                      {active.item.location?.category ? ` · ${titleCase(active.item.location.category)}` : ""}
                    </p>
                    <h3 {...sx(a.display, s.placeTitle, a.wrap)}>{active.item.title || active.item.location?.name}</h3>
                  </div>
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    aria-label="Close place"
                    onClick={() => {
                      setActiveId(null)
                      setFocusId(null)
                    }}
                  >
                    <X size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
                {active.item.location?.address && <p {...sx(a.small, a.wrap)}>{active.item.location.address}</p>}
                {active.item.notes && (
                  <p {...sx(a.small, a.wrap)} style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {active.item.notes}
                  </p>
                )}
                <div {...sx(a.rowWrap)}>
                  {activeMaps && (
                    <a href={activeMaps.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnPrimary, a.btnSm)}>
                      <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                      Directions
                    </a>
                  )}
                  {!day && (
                    <Link to={`${basePath}/day/${active.day.id}#item-${active.item.id}`} {...sx(a.btn, a.btnSecondary, a.btnSm)}>
                      Open day {active.dayNumber}
                    </Link>
                  )}
                  {day && editable && (
                    <button
                      type="button"
                      {...sx(a.btn, a.btnSecondary, a.btnSm)}
                      onClick={() => {
                        setEditId(active.item.id)
                        setView("list")
                      }}
                    >
                      Edit stop
                    </button>
                  )}
                  {tour && tour.ids.length > 1 && (
                    <span {...sx(a.row)} style={{ marginLeft: "auto", gap: 0 }}>
                      <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Previous stop" disabled={tour.at === 0} onClick={() => locate(tour.ids[tour.at - 1]!)}>
                        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
                      </button>
                      <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Next stop" disabled={tour.at === tour.ids.length - 1} onClick={() => locate(tour.ids[tour.at + 1]!)}>
                        <ChevronRight size={18} strokeWidth={1.75} aria-hidden />
                      </button>
                    </span>
                  )}
                </div>
              </aside>
            )}
          </AtlasMap>
        </div>
      )}

      <div {...sx(s.bar)}>
        <div {...sx(share.segment, s.barSegment)} role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={view === "list"} {...sx(share.segmentBtn, s.barBtn, view === "list" && share.segmentOn)} onClick={() => setView("list")}>
            <List size={16} strokeWidth={1.75} aria-hidden />
            Itinerary
          </button>
          <button type="button" role="radio" aria-checked={view === "map"} {...sx(share.segmentBtn, s.barBtn, view === "map" && share.segmentOn)} onClick={() => setView("map")}>
            <MapIcon size={16} strokeWidth={1.75} aria-hidden />
            Map
          </button>
        </div>
      </div>

      {(editor.notice || editor.deleted) && (
        <div {...sx(s.dock)}>
          {editor.notice && (
            <div {...sx(s.dockItem)} role={PROBLEM.test(editor.notice) ? "alert" : "status"}>
              <span {...sx(a.grow, a.wrap)}>{editor.notice}</span>
              <button type="button" {...sx(s.dockBtn)} onClick={() => editor.setNotice(null)}>
                Dismiss
              </button>
            </div>
          )}
          {editor.deleted && (
            <div {...sx(s.dockItem)} role="status" key={editor.deleted.key}>
              <span {...sx(a.grow, a.truncate)}>Removed “{editor.deleted.title || "Untitled"}”</span>
              <button type="button" {...sx(s.dockBtn)} onClick={editor.undoDelete}>
                Undo
              </button>
            </div>
          )}
        </div>
      )}

      {dialog === "share" && (
        <ShareDialog
          open
          tripId={trip.id}
          getToken={editor.readToken}
          viewerId={viewer.id}
          onClose={() => setDialog(null)}
          onChanged={(next) => {
            if (editor.saveState === "saved") editor.setTrip({ ...(editor.trip ?? trip), collaborators: next.collaborators })
          }}
          onLeft={() => navigate("/trips")}
        />
      )}
      {editable && (
        <DetailsDialog
          trip={trip}
          open={dialog === "details"}
          onClose={() => setDialog(null)}
          onSave={(next: Trip) => {
            editor.scheduleSave(next)
            if (dayId && !next.days.some((d: TripDay) => d.id === dayId)) navigate(basePath)
          }}
        />
      )}
      <AiSheet
        open={typeof dialog === "object" && dialog !== null}
        scope={typeof dialog === "object" && dialog !== null ? dialog.ai : "trip"}
        dayLabel={day ? day.title || formatTripDate(day.date, trip.timezone, { weekday: "long" }) : undefined}
        hasItems={hasItems}
        onClose={() => setDialog(null)}
        onRun={runAi}
      />
      <Modal
        open={dialog === "delete"}
        onClose={() => busy === null && setDialog(null)}
        title={`Delete “${trip.name}”?`}
        description="The itinerary, bookings and invite links are removed for everyone on the trip. This can’t be undone."
        accent={accent}
        footer={
          <>
            <button type="button" {...sx(a.btn, a.btnSecondary)} disabled={busy !== null} onClick={() => setDialog(null)}>
              Keep trip
            </button>
            <button
              type="button"
              {...sx(a.btn, a.btnDanger)}
              disabled={busy !== null}
              onClick={() =>
                void act("delete", async () => {
                  editor.cancelPendingSave()
                  await deleteTrip(editor.readToken, trip.id)
                  navigate("/trips")
                })
              }
            >
              {busy === "delete" ? <Spinner /> : <Trash2 size={16} strokeWidth={1.75} aria-hidden />}
              Delete trip
            </button>
          </>
        }
      >
        {null}
      </Modal>
      <Modal
        open={dialog === "clear" && Boolean(day)}
        onClose={() => setDialog(null)}
        title={`Clear day ${dayIndex + 1}?`}
        description={day ? `This removes all ${plural(day.items.length, "item")} from the day. The day itself stays.` : undefined}
        accent={accent}
        footer={
          <>
            <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={() => setDialog(null)}>
              Keep them
            </button>
            <button
              type="button"
              {...sx(a.btn, a.btnDanger)}
              onClick={() => {
                if (day) editor.setDays((days) => days.map((d) => (d.id === day.id ? { ...d, items: [] as ItineraryItem[] } : d)))
                setDialog(null)
              }}
            >
              Clear day
            </button>
          </>
        }
      >
        {null}
      </Modal>

      {photoreal && day && (
        <Suspense fallback={null}>
          <MapModeOverlay
            daySlug={day.id}
            dayTitle={day.title ?? `Day ${dayIndex + 1}`}
            placesUrl={`/api/trips/${encodeURIComponent(trip.id)}/days/${encodeURIComponent(day.id)}/places`}
            onClose={() => setPhotoreal(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
