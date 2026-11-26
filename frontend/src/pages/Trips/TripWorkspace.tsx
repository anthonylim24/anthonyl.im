import { applyDetailsPatch, detailsUndo } from "./workspace/tripDetails"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom"
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  List,
  Map as MapIcon,
  MoreHorizontal,
  Orbit,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { sx } from "@/styles/merge"
import { useTabTitle } from "@/hooks/useTabTitle"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { externalMapsLink } from "@/lib/externalMaps"
import { useViewer } from "@/lib/safeAuth"
import { deleteTrip, duplicateTrip } from "./tripsApi"
import { dayCount, formatClock, formatRange, formatTripDate, plural, resolveAccent, titleCase, todayIsoIn, tripTiming } from "./meta"
import { AtlasMap, canRenderMap, loadMapEngine, type AtlasMapProps } from "./map/AtlasMap"
import { IDEA_PARAM } from "./ideas/contract"
import { useIdeaNav } from "./ideas/ideaNav"
import { liveValue, useLiveValue, type LiveValue } from "./workspace/liveValue"
import { addItem, makeItem } from "./tripEdits"
import { addBookings, type BookingEntry } from "./bookings/addBookings"
import { OverlayBoundary } from "@/components/OverlayBoundary"
import { isChunkLoadError, lazyRetry } from "@/lib/lazyRetry"
import { changedLodging, lodgingBrief, lodgingEntries, type LodgingEntry } from "./lodging"
import { dayStays, framedStays, STAY_LEAD, withStays } from "./map/stayPins"
import { IgGlyph } from "./instagram/IgGlyph"
import { extractInstagramUrls } from "./instagram/instagram"
import { centroid, corePoints, searchCenter, isToSchedule, TO_SCHEDULE, DAY_PIN, dayPins, dayRoute, ideaPins, isLocated, locatedItems, splitDay, tripDots, tripPins, type LngLat } from "./map/geo"
import { errorText, useTripEditor } from "./useTripEditor"
import type { HistoryEntry } from "./editorMachine"
import { SaveIndicator } from "./offline/SaveIndicator"
import { scrollBehavior } from "./workspace/scroll"
import { isMissingTripError, TripsNotFound } from "./TripsNotFound"
import { photorealAvailable } from "./photoreal/available"
import { useStopPhoto } from "./stopPhoto"
import { daySky, useForecast } from "./forecast"
import { useHolidays } from "./holidays"
import { rememberTripAccent } from "./bootAccent"
import { Menu, Modal, Spinner, type MenuItem } from "./components/kit"
import { Presence } from "./components/presence"
import { ShareDialog } from "./components/ShareDialog"
import { AiSheet, briefToRequest, reviewProgress, type AiRequest, type DraftBrief } from "./workspace/AiPanels"
import { DayPanel } from "./workspace/DayPanel"
import { TripPlacesContext } from "./workspace/tripPlacesContext"
import { dayBias, tripPlaces } from "./searchArea"
import { useDayView } from "./workspace/dayView"
import { INLINE_EDITOR_QUERY, type EditorSurface } from "./workspace/stopEdits"
import { useMedia } from "./useMedia"
import { DayRail } from "./workspace/DayRail"
import { Parts } from "./workspace/Parts"
import { DetailsDialog } from "./workspace/DetailsDialog"
import { OverviewPanel } from "./workspace/OverviewPanel"
import { OverviewTabs, type TabBadge } from "./workspace/OverviewTabs"
import { OVERVIEW_TABS, readOverviewTab, type OverviewTab } from "./workspace/overviewTab"
import { AreaKey } from "./areas/AreaKey"
import type { Neighborhood } from "./areas/contract"
import { useAreaOnMap } from "./areas/useAreaOnMap"
import { calendarMenuItem, exportCalendar } from "./calendar/calendarMenu"
import { tripCommands } from "./command/tripCommands"
import { useRegisterCommands } from "./command/CommandContext"
import { COPY_MESSAGE, copyItinerary } from "./print/copyItinerary"
import { copyMenuItem, printMenuItem } from "./print/printMenu"
import { usePrintItinerary } from "./print/usePrintItinerary"
import type { ItineraryItem, Trip, TripDay } from "./types"
import { a } from "./atlas.stylex"
import { share, ws as s } from "./workspace.stylex"

const PhotorealOverlay = lazyRetry(() => import("./photoreal/PhotorealOverlay"))

const BudgetPanel = lazyRetry(() => import("./budget/BudgetPanel").then((m) => ({ default: m.BudgetPanel })))
const ChecklistPanel = lazyRetry(() => import("./prep/ChecklistPanel").then((m) => ({ default: m.ChecklistPanel })))
const IdeasPanel = lazyRetry(() => import("./workspace/IdeasPanel").then((m) => ({ default: m.IdeasPanel })))
const EssentialsPanel = lazyRetry(() => import("./prep/EssentialsPanel").then((m) => ({ default: m.EssentialsPanel })))
const AreasPanel = lazyRetry(() => import("./areas/AreasPanel").then((m) => ({ default: m.AreasPanel })))
const InstagramSheet = lazyRetry(() => import("./instagram/InstagramSheet").then((m) => ({ default: m.InstagramSheet })))
const PasteBookingsSheet = lazyRetry(() => import("./bookings/PasteBookingsSheet").then((m) => ({ default: m.PasteBookingsSheet })))
const TripRecap = lazyRetry(() => import("./recap/TripRecap").then((m) => ({ default: m.TripRecap })))
const IdeaOverlay = lazyRetry(() => import("./ideas/IdeaOverlay").then((m) => ({ default: m.IdeaOverlay })))
// The wishlist's place categories, areas and details cache ride with it, off the first paint;
// warmed at idle when the map has hearts and the device can hover.
const IdeaPreview = lazyRetry(() => import("./ideas/IdeaPreview").then((m) => ({ default: m.IdeaPreview })))
const ChangesSheet = lazyRetry(() => import("./changes/ChangesSheet").then((m) => ({ default: m.ChangesSheet })))

/** Notices that describe a problem: announced as alerts and never auto-dismissed. */
const PROBLEM = /couldn|didn|isn’t|not |fail|error/i
const WIDE_QUERY = "(min-width: 1024px)"
const MAP_PADDING = { top: 84, right: 72, bottom: 96, left: 72 }
const MAP_PADDING_NARROW = { top: 76, right: 36, bottom: 120, left: 36 }
/** A neighborhood on a phone's map: clear of its key (top left), the map's buttons (top right) and, in Liquid Glass, the dock over the map's foot. */
const AREA_PADDING_NARROW = { top: 84, right: 64, bottom: 96, left: 24 }
/** One empty set of wishlist pins, so the map does not redraw its markers each render. */
const NO_PINS: ReturnType<typeof ideaPins> = []
/** The least map kept clear above a tall place card on a phone. */
const MIN_MAP_BAND = 160

/**
 * True once the page has painted and the browser is idle. Work nobody needs
 * for the first paint waits for it: probing WebGL for the 3D view, and on a
 * phone fetching the map engine before the Map tab is tapped.
 */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setIdle(true), { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(() => setIdle(true), 1000)
    return () => clearTimeout(timer)
  }, [])
  return idle
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || Boolean(target.closest('[role="dialog"], [role="menu"]'))
}

/** Widgets whose arrow keys move within them (tabs, radio groups, menus, sliders). */
function inArrowWidget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="tablist"], [role="radiogroup"], [role="menu"], [role="listbox"], [role="slider"], [role="grid"]') !== null
  )
}

type Dialog = null | "share" | "details" | "delete" | "clear" | { ai: "day" | "trip"; prompt?: string }

/** Long enough to read and reach (WCAG 2.2.1); paused while hovered or focused. */
const UNDO_TOAST_MS = 12_000


/**
 * The offer to take back a destructive change. Stays for 12 s, and not
 * while the pointer or focus is on it or an AI run holds the editor.
 */
function UndoToast({ entry, hold, onUndo, onExpire }: { entry: HistoryEntry; hold: boolean; onUndo: () => void; onExpire: () => void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || hold) return
    const timer = setTimeout(onExpire, UNDO_TOAST_MS)
    return () => clearTimeout(timer)
  }, [paused, hold, onExpire, entry.id])
  return (
    <div
      {...sx(s.dockItem)}
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span {...sx(a.grow, a.truncate)}>{entry.label}</span>
      <button type="button" {...sx(s.dockBtn)} disabled={hold} onClick={onUndo} aria-keyshortcuts="Control+Z Meta+Z">
        Undo
      </button>
    </div>
  )
}

/** The selected stop's photo at the top of the map's place card; nothing while there is none. */
function PlacePhoto({ item, city }: { item: ItineraryItem; city: string }) {
  const lat = item.location?.lat
  const lng = item.location?.lng
  const category = item.reservation?.type ?? item.location?.category
  const stop = typeof lat === "number" && typeof lng === "number" ? { id: item.id, title: item.location?.name || item.title, lat, lng, category } : null
  const photo = useStopPhoto(stop, city, 720)
  const [failed, setFailed] = useState<string | null>(null)
  if (photo.status !== "ready" || failed === photo.url) return null
  return (
    <img
      key={photo.url}
      src={photo.url}
      alt=""
      loading="lazy"
      decoding="async"
      {...sx(s.placePhoto)}
      onError={() => setFailed(photo.url)}
    />
  )
}

/**
 * One workspace per trip. Going from one trip to another (Duplicate, browser
 * Back) starts a fresh one, so nothing from the last trip (a pending AI
 * answer, a toast, an open dialog) carries over. Changing day does not.
 */
export function TripWorkspace() {
  const { tripId } = useParams<{ tripId: string }>()
  return <Workspace key={tripId} />
}

function Workspace() {
  const editor = useTripEditor()
  const { tripId, dayId } = useParams<{ tripId: string; dayId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const viewer = useViewer()
  const wide = useMedia(WIDE_QUERY, true)
  const roomy = useMedia(INLINE_EDITOR_QUERY, true)
  const [dayView, setDayView] = useDayView()
  const surface: EditorSurface = roomy && dayView === "list" ? "inline" : "sheet"
  const idle = useIdle()
  // Probing for the 3D view creates a WebGL context: never on the way to first paint.
  const photorealReady = idle && photorealAvailable()
  useEffect(() => {
    if (idle && !wide && canRenderMap()) void loadMapEngine().catch(() => undefined)
  }, [idle, wide])
  const [view, setView] = useState<"list" | "map">("list")
  const [dialog, setDialog] = useState<Dialog>(null)
  /** The stop or day under the pointer, in the list or on the map. Read by the cards and pins it names, not by this page. */
  const [hot, setHot] = useState(() => liveValue<string | null>(null))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  /** Below 1024px the place card spans the foot of the map: a stop flown to lands above it. */
  const [cardInset, setCardInset] = useState(0)
  const measureCard = useCallback((card: HTMLElement | null) => {
    if (!card || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      const room = (card.offsetParent?.clientHeight ?? 0) - MAP_PADDING_NARROW.top - MIN_MAP_BAND
      // Whole 16px steps: the photo arriving moves the camera, a sub-pixel change does not.
      setCardInset(Math.max(0, Math.min(Math.ceil((card.offsetHeight + 24) / 16) * 16, room)))
    })
    observer.observe(card)
    return () => {
      observer.disconnect()
      setCardInset(0)
    }
  }, [])
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState<string | null>(null)
  /** The 3D view is open. Opening and closing it redraws only the overlay, not the itinerary under it. */
  const [fly, setFly] = useState(() => liveValue(false))
  /** An overlay failed to open. `stale`: its code is gone because a newer build is live. */
  const [overlayProblem, setOverlayProblem] = useState<{ text: string; stale: boolean } | null>(null)
  /**
   * A stop whose editor was asked for from outside its day's list (the map,
   * the 3D view, the budget, a booking added by hand); `n` changes on every
   * request so the same stop can be asked for twice.
   */
  const [edit, setEdit] = useState<{ dayId: string; id: string; n: number } | null>(null)
  const openEditor = (onDay: string, id: string) => {
    setEdit((last) => ({ dayId: onDay, id, n: (last?.n ?? 0) + 1 }))
    // A sheet opens over whatever is showing; an editor under its card needs the list.
    if (surface === "inline") setView("list")
  }
  /** Instagram import: open with these links (possibly none). */
  const [instagram, setInstagram] = useState<{ urls: string[] } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const ideaNav = useIdeaNav()
  const tab = readOverviewTab(searchParams.get("tab"))
  // A tab replaces the entry; a wishlist place open on it closes with it, its
  // own entry gone back from first, so the visit keeps one entry.
  const { replaceClosing } = ideaNav
  const setTab = useCallback(
    (next: OverviewTab) =>
      replaceClosing((params) => {
        if (next === "itinerary") params.delete("tab")
        else params.set("tab", next)
        return params
      }),
    [replaceClosing],
  )
  /** What this opening of the Instagram import has added: one undo step, one toast. */
  const igRef = useRef({ session: 0, ids: [] as string[], places: 0 })
  /** Offered after the traveller adds or changes where they sleep. */
  const [lodgingNudge, setLodgingNudge] = useState<LodgingEntry | null>(null)
  /** Every stay this trip has had while open: one coming back (an undo, a redo, a re-add) is not news. */
  const lodgingRef = useRef<{ tripId: string; entries: LodgingEntry[] } | null>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  /** Phones mount the map the first time it is asked for, then only hide it. */
  const [mapOpened, setMapOpened] = useState(false)
  if (view === "map" && !mapOpened) setMapOpened(true)
  /** Spoken confirmations (Undo, Redo) for screen readers. */
  const [announce, setAnnounce] = useState("")
  /** A short visible confirmation ("Itinerary copied"); screen readers get `announce`. */
  const [flash, setFlash] = useState<{ text: string; n: number } | null>(null)
  const confirm = useCallback((text: string) => {
    setAnnounce(text)
    setFlash((last) => ({ text, n: (last?.n ?? 0) + 1 }))
  }, [])
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(timer)
  }, [flash])
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const { trip, editable, locked } = editor
  const ai = editor.ai
  const forecast = useForecast(trip)
  const holidays = useHolidays(trip)
  // An optional overlay (the printout, the 3D view, a sheet) that fails to
  // load closes and says so in the dock; the trip itself is untouched.
  const overlayFailed = (what: string, close: () => void) => (error: Error) => {
    close()
    const stale = isChunkLoadError(error)
    setOverlayProblem({
      stale,
      text: stale
        ? `${what} needs the latest version of the app. Reload to get it; your trip is saved.`
        : `${what} couldn’t open. Your trip is fine. (${errorText(error)})`,
    })
  }
  const printer = usePrintItinerary(trip, overlayFailed("The printout", () => {}))

  // The newest undo step offers a toast when it was a destructive change.
  // An older step coming back to the top (after an Undo) does not.
  const lastStep = editor.history?.past[editor.history.past.length - 1]
  const [seenStep, setSeenStep] = useState(0)
  const [toastStep, setToastStep] = useState<number | null>(null)
  if (lastStep && lastStep.id > seenStep) {
    setSeenStep(lastStep.id)
    setToastStep(lastStep.toast ? lastStep.id : null)
  }
  const toast = lastStep && lastStep.id === toastStep && lastStep.label ? lastStep : null
  const expireToast = useCallback(() => setToastStep(null), [])

  const undoLast = useCallback(() => {
    if (!lastStep || locked) return
    editor.undo()
    setToastStep(null)
    setAnnounce(`Undone: ${lastStep.label ?? "your last edit"}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastStep, locked, editor.undo])
  const nextStep = editor.history?.future[editor.history.future.length - 1]
  const redoNext = useCallback(() => {
    if (!nextStep || locked) return
    editor.redo()
    setAnnounce(`Redone: ${nextStep.label ?? "your last edit"}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextStep, locked, editor.redo])

  // Whatever was open for one day (3D view, "Clear day", the day's AI sheet,
  // an edit request) does not follow the traveller to another day. A request
  // made on the way to a day (the budget, a booking added by hand) is for it.
  const [shownDayId, setShownDayId] = useState(dayId)
  if (shownDayId !== dayId) {
    setShownDayId(dayId)
    setFly(liveValue(false))
    if (edit && edit.dayId !== dayId) setEdit(null)
    if (dialog === "clear" || (typeof dialog === "object" && dialog !== null && dialog.ai === "day")) setDialog(null)
  }
  const dayIndex = trip && dayId ? trip.days.findIndex((d) => d.id === dayId) : -1
  const day = trip && dayIndex >= 0 ? trip.days[dayIndex] : undefined
  const basePath = trip ? `/trips/${trip.slug ?? trip.id}` : "/trips"
  useTabTitle(trip ? `${day ? `Day ${dayIndex + 1} · ` : ""}${trip.name} · Trips` : null)

  // New day (or back to the overview): nothing selected (adjusted during
  // render) and the page back at the top (the effect below).
  const viewKey = `${trip?.id ?? ""}|${dayId ?? ""}`
  const [seenViewKey, setSeenViewKey] = useState(viewKey)
  if (seenViewKey !== viewKey) {
    setSeenViewKey(viewKey)
    setActiveId(null)
    setFocusId(null)
    setHot(liveValue<string | null>(null))
  }
  useEffect(() => {
    if (wide) paneRef.current?.scrollTo({ top: 0 })
    else window.scrollTo({ top: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId, trip?.id])

  useEffect(() => {
    if (!trip) return
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target) || dialog !== null) return
      // A control that already used the key (tabs, the Itinerary/Map switch, a menu) keeps it.
      if (event.defaultPrevented || inArrowWidget(event.target)) return
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

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z. A text field keeps the keys for its own
  // undo history, and so does an open dialog. Undo steps through the plan
  // (days and dates), so it only listens where the plan is on screen: a day,
  // or the overview's Itinerary tab, never Budget or Checklist.
  const planOnScreen = Boolean(dayId) || tab === "itinerary"
  useEffect(() => {
    if (!editable || !planOnScreen) return
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "z") return
      if (typing(event.target) || dialog !== null || instagram !== null) return
      event.preventDefault()
      if (event.shiftKey) redoNext()
      else undoLast()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editable, planOnScreen, dialog, instagram, undoLast, redoNext])

  // Good news clears itself; anything that reads like a problem stays put.
  // A dock row mounts with its text, which screen readers often miss, so good
  // news also goes through the always-present announcer.
  const notice = editor.notice
  useEffect(() => {
    if (!notice || PROBLEM.test(notice)) return
    const timer = setTimeout(() => editor.setNotice(null), 9000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice])

  const tripPoints = useMemo<LngLat[]>(
    () => (trip ? trip.days.flatMap((d) => d.items.filter(isLocated).map((i) => ({ lat: i.location.lat, lng: i.location.lng }))) : []),
    [trip],
  )
  const tripCenter = useMemo<LngLat | null>(() => centroid(tripPoints) ?? trip?.center ?? null, [tripPoints, trip?.center])
  // Where place searches look: the trip's (or the day's) main group of stops,
  // so one airport or side trip cannot pull "near here" out to sea.
  const tripFocus = useMemo<LngLat | null>(() => searchCenter(tripPoints, trip?.center), [tripPoints, trip?.center])

  // Search bias for the composer and every stop's place search. Memoised on
  // the coordinates: a new object per keystroke would re-render every card.
  const nearNow = trip && day ? dayBias(trip, dayIndex, tripFocus) : tripFocus
  const nearLat = nearNow?.lat ?? null
  const nearLng = nearNow?.lng ?? null
  const near = useMemo<LngLat | null>(() => (nearLat === null || nearLng === null ? null : { lat: nearLat, lng: nearLng }), [nearLat, nearLng])
  // What "near the trip" means for those searches: any of its places or towns, so its second city counts too.
  const placesForSearch = useMemo(() => tripPlaces(trip), [trip])

  const pins = useMemo(() => (!trip ? [] : day ? dayPins(day, fresh) : tripPins(trip)), [trip, day, fresh])
  // Where the traveller wakes up and sleeps, drawn on the day map as its
  // reference point. Never in `pins`: a hotel is not counted, numbered or toured.
  const stays = useMemo(() => (trip && day ? dayStays(trip, dayIndex) : []), [trip, day, dayIndex])
  const mapPins = useMemo(() => (day ? withStays(day, stays, pins) : pins), [day, stays, pins])
  const hotelPins = useMemo(() => mapPins.filter((pin) => pin.variant === "hotel"), [mapPins])
  // The map chip counts stops as the day header does: "9 stops", or "7 of 9 stops" while some have no pin.
  const dayStops = day ? splitDay(day).planned.filter((item) => item.kind !== "section" && item.kind !== "note").length : 0
  const pinnedStops = pins.filter((pin) => pin.variant === "stop").length
  const dots = useMemo(() => (trip && !day ? tripDots(trip) : []), [trip, day])
  const tripStops = trip && !day ? trip.days.reduce((n, d) => n + d.items.filter((i) => i.kind === "place" || i.kind === "reservation").length, 0) : 0
  const routes = useMemo(() => (!trip ? [] : day ? [dayRoute(day)] : []), [trip, day])
  // Wishlist places ride their own prop, on the overview and on a day (what is
  // near the day). Never in `pins`: they must not frame, count or tour.
  const ideas = trip?.ideas
  const wishPins = useMemo(() => ideaPins({ ideas }), [ideas])
  const hasWishPins = wishPins.length > 0
  useEffect(() => {
    if (idle && hasWishPins && window.matchMedia("(hover: hover)").matches) IdeaPreview.preload()
  }, [idle, hasWishPins])
  const focusPin = focusId ? mapPins.find((p) => p.id === focusId) : undefined
  const cardCovers = !wide && focusPin !== undefined && cardInset > MAP_PADDING_NARROW.bottom
  const mapPadding = wide ? MAP_PADDING : cardCovers ? { ...MAP_PADDING_NARROW, bottom: cardInset } : MAP_PADDING_NARROW
  const frameKey = `${day?.id ?? "all"}|${mapPins.map((p) => p.id).join(",")}|${focusPin?.id ?? ""}|${cardCovers ? cardInset : ""}`
  // The day's stops, plus its hotel when it is near them (a day trip's far-off base is drawn, not framed).
  const framePoints = useMemo(
    () =>
      day
        ? [...(fresh.size > 0 ? pins : corePoints(pins)), ...framedStays(hotelPins, dayRoute(day))]
        : [...pins, ...corePoints(dots)],
    [day, fresh, pins, hotelPins, dots],
  )
  // A neighborhood from the Neighborhoods tab, drawn and framed on the overview map.
  const areaMap = useAreaOnMap(trip ?? null, editor.readToken, !day && tab === "neighborhoods")
  const { show: pickArea, area: shownArea, shape: shownShape, settled: areaSettled } = areaMap
  /** The area just picked, until its edge is told; and whether its key is to take the focus. */
  const [picked, setPicked] = useState<string | null>(null)
  const keyNode = useRef<HTMLDivElement | null>(null)
  const keyWantsFocus = useRef(false)
  // On a phone the list, with the button just pressed, goes behind the map: the map's key takes the focus.
  const areaKeyRef = useCallback((node: HTMLDivElement | null) => {
    keyNode.current = node
    if (node && keyWantsFocus.current) {
      keyWantsFocus.current = false
      node.focus()
    }
  }, [])
  const showArea = useCallback(
    (area: Neighborhood | null) => {
      pickArea(area)
      setPicked(area?.id ?? null)
      // Hidden, the area's last words go too, so showing it again is said again.
      if (!area) setAnnounce("")
      keyWantsFocus.current = area !== null && !wide
      if (area && !wide) setView("map")
    },
    [pickArea, wide],
  )
  useEffect(() => {
    if (!shownArea || !keyWantsFocus.current || !keyNode.current) return
    keyWantsFocus.current = false
    keyNode.current.focus()
  }, [shownArea])
  // Said once its edge is settled: which area, and whether the edge is OpenStreetMap's or drawn around the stops.
  if (picked && shownArea?.id === picked && areaSettled && shownShape) {
    setPicked(null)
    setAnnounce(`${shownArea.name} is on the map, ${shownShape.approximate ? "drawn around your stops" : "outlined from OpenStreetMap"}.`)
  }
  // Cleared from the map's key: the focus goes back to the card's button, or on a phone (the list behind the map) to the view switch.
  const clearArea = useCallback(() => {
    const id = shownArea?.id
    showArea(null)
    const back = wide ? paneRef.current?.querySelector<HTMLElement>(`[data-area-show="${id}"]`) : document.querySelector<HTMLElement>('[data-view][aria-checked="true"]')
    back?.focus()
  }, [showArea, shownArea, wide])
  const areaFramed = areaMap.shape !== null && !focusPin

  const activeDayIndex = trip && activeId ? trip.days.findIndex((d) => d.items.some((it) => it.id === activeId)) : -1
  const activeDay = trip && activeDayIndex >= 0 ? trip.days[activeDayIndex] : undefined
  const activeItem = activeDay?.items.find((it) => it.id === activeId)
  const active = activeDay && activeItem ? { item: activeItem, day: activeDay, dayNumber: activeDayIndex + 1 } : null
  // A hotel picked on a later day of its stay: booked on another day, so the
  // card opens that day rather than editing here.
  const activeElsewhere = active !== null && (!day || active.day.id !== day.id)
  const activeStay = active && hotelPins.some((pin) => pin.id === active.item.id) ? stays.find((stay) => stay.item.id === active.item.id) : undefined

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

  // Deep links. /day/:id#item-<id> shows that stop on the map (on a phone
  // that means switching to the map): the concierge's "Show". /day/:id#stop-<id>
  // picks the stop out in the list and leaves the view alone: the Now card's
  // "this one", read with the phone in hand. Checked once per day and hash,
  // during render, after the new-day reset above.
  const deepLinkKey = day ? `${day.id}${location.hash}` : null
  const [seenDeepLink, setSeenDeepLink] = useState<string | null>(null)
  if (deepLinkKey !== seenDeepLink) {
    setSeenDeepLink(deepLinkKey)
    const hash = location.hash
    const onMap = hash.startsWith("#item-")
    const id = day && (onMap || hash.startsWith("#stop-")) ? decodeURIComponent(hash.slice(6)) : null
    const item = id ? day?.items.find((i) => i.id === id) : undefined
    if (day && item) {
      setActiveId(item.id)
      setFocusId(item.id)
      // A stop with no pin has nothing to show on the map: it opens where it can be read.
      if (onMap && !isLocated(item)) {
        if (!wide) setView("list")
        openEditor(day.id, item.id)
      } else if (onMap && !wide) setView("map")
    }
  }

  // "I'll add stops myself" lands on a day whose only next step is its composer.
  const composeOn = day && (location.state as { compose?: unknown } | null)?.compose === true ? location.key : null
  useEffect(() => {
    if (composeOn) paneRef.current?.querySelector<HTMLElement>('input[role="combobox"]')?.focus()
  }, [composeOn])
  // A stop followed from elsewhere in the app (Neighborhoods' "Stops by day") takes the focus its link had.
  const stopLink = day && location.key !== "default" && location.hash.startsWith("#stop-") ? `${location.key}${location.hash}` : null
  useEffect(() => {
    if (!stopLink) return
    const id = decodeURIComponent(stopLink.slice(stopLink.indexOf("#stop-") + 6))
    const frame = requestAnimationFrame(() => document.getElementById(`item-${id}`)?.querySelector<HTMLElement>("[data-card-row]")?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [stopLink])

  const onAdded = useCallback((id: string) => {
    setFresh(new Set([id]))
  }, [])

  const hasItems = trip ? trip.days.some((d) => d.items.length > 0) : false

  // Deep links: ?instagram=<post link> (share sheets, bookmarks) and the old
  // ?ingest=1 both open the import; the query is dropped once handled.
  const sharedLink = searchParams.get("instagram") ?? searchParams.get("url") ?? searchParams.get("text")
  const wantsImport = sharedLink != null || searchParams.get("ingest") === "1"
  const openInstagram = useCallback((urls: string[]) => {
    igRef.current = { session: igRef.current.session + 1, ids: [], places: 0 }
    setInstagram({ urls })
  }, [])

  useEffect(() => {
    if (!trip || !editable || !wantsImport) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hand-off from the URL; this effect also strips the query, which cannot happen during render
    openInstagram(extractInstagramUrls(sharedLink ?? ""))
    const next = new URLSearchParams(searchParams)
    for (const key of ["instagram", "url", "text", "title", "ingest"]) next.delete(key)
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, editable, wantsImport])

  // Places from posts carry no time, so on a day that runs to a clock they
  // go under a "To schedule" heading instead of trailing the last timed stop.
  const addFromInstagram = useCallback(
    (toDayId: string, items: ItineraryItem[]) => {
      if (items.length === 0) return
      const added: string[] = items.map((item) => item.id)
      const ig = igRef.current
      ig.places += items.length
      editor.setDays(
        (days) =>
          days.map((d) => {
            if (d.id !== toDayId) return d
            const timed = d.items.some((item) => item.time)
            const hasHeading = d.items.some(isToSchedule)
            if (!timed || hasHeading) return { ...d, items: [...d.items, ...items] }
            const heading = makeItem("section", TO_SCHEDULE)
            added.push(heading.id)
            return { ...d, items: [...d.items, heading, ...items] }
          }),
        { label: `Added ${plural(ig.places, "place")} from Instagram`, key: `instagram:${ig.session}`, toast: true },
      )
      ig.ids = [...ig.ids, ...added]
      const ids = new Set(items.map((item) => item.id))
      editor.flashTouched(ids)
      setFresh(ids)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.setDays, editor.flashTouched],
  )

  // An overlay that fails to load or throws takes only itself down: close
  // it, keep the itinerary, and say what to do.
  const [pasting, setPasting] = useState(false)
  const [recapOpen, setRecapOpen] = useState(false)
  const addPasted = (entries: BookingEntry[]) => {
    if (entries.length === 0) return
    editor.setDays((days) => addBookings(days, entries), { label: `Added ${plural(entries.length, "booking")}`, toast: true })
    editor.flashTouched(new Set(entries.map((e) => e.item.id)))
  }
  const addBookingByHand = (dayId: string, item: ItineraryItem) => {
    editor.setDays((days) => addItem(days, dayId, item), { label: "Added a booking" })
    navigate(`${basePath}/day/${dayId}`)
    openEditor(dayId, item.id)
  }


  // Closing the import: show what landed (flash + pin drop). Its Undo is the
  // toast for the import's one undo step.
  const closeInstagram = () => {
    setInstagram(null)
    const ids = igRef.current.ids
    if (ids.length === 0 || !editor.trip) return
    const places = editor.trip.days.flatMap((d) => d.items.filter((item) => ids.includes(item.id) && item.kind !== "section"))
    if (places.length === 0) return
    const shown = new Set(places.map((item) => item.id))
    editor.flashTouched(shown)
    setFresh(shown)
    // Bring the new stops to the top of the list, clear of the toast: the
    // "To schedule" heading when there is one, else the first new stop.
    const anchor = ids.find((id) => editor.trip?.days.some((d) => d.items.some((item) => item.id === id && item.kind === "section"))) ?? places[0]!.id
    requestAnimationFrame(() => document.getElementById(`item-${anchor}`)?.scrollIntoView({ block: "start", behavior: scrollBehavior() }))
  }

  // A new or different hotel changes what a good day looks like. Offer to
  // rework the plan around it; never do it unasked. Changes made by an AI
  // run (a draft, an applied review) only update what we compare against.
  const lodgingKey = trip ? lodgingEntries(trip).map((entry) => entry.key).join("|") : ""
  const aiBusy = locked
  useEffect(() => {
    if (!trip) return
    const entries = lodgingEntries(trip)
    const known = lodgingRef.current?.tripId === trip.id ? lodgingRef.current : null
    const changed = known ? changedLodging(known.entries, entries) : null
    const seen = new Map([...(known?.entries ?? []), ...entries].map((entry) => [entry.key, entry]))
    lodgingRef.current = { tripId: trip.id, entries: [...seen.values()] }
    if (!known || aiBusy || !editable || trip === editor.aiTripRef.current) return
    const otherStops = trip.days.some((d) => d.items.some((item) => item.kind === "place" && item.id !== changed?.itemId))
    if (changed && otherStops) setLodgingNudge(changed)
    else if (lodgingNudge && !entries.some((entry) => entry.key === lodgingNudge.key)) setLodgingNudge(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lodgingKey, trip?.id])

  const draft = async (brief: DraftBrief) => {
    if (!trip) return
    const added = await editor.draft(briefToRequest(brief), hasItems)
    if (added.length > 0 && aliveRef.current) setFresh(new Set(added))
  }

  const runAi = (request: AiRequest) => {
    if (request.type === "day") {
      if (day) editor.enhanceDay(day.id, request.prompt)
      return
    }
    // A whole-trip run shows its progress and its review on the overview.
    if (dayId) navigate(basePath)
    if (request.type === "draft") void draft(request.brief)
    else void editor.runEnhance("trip", undefined, request.prompt)
  }

  // The Itinerary / Map switch is a radio group: arrow keys move the choice and focus together.
  const onViewKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
    event.preventDefault()
    const next = view === "list" ? "map" : "list"
    setView(next)
    event.currentTarget.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus()
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

  // openInstagram resets a ref; a stable wrapper keeps that out of render.
  const importFromInstagram = useLatestCallback(() => openInstagram([]))
  const copyFromPalette = useLatestCallback(() => {
    if (!trip) return
    void copyItinerary(trip).then((result) => {
      const message = COPY_MESSAGE[result]
      if (message) confirm(message)
    })
  })
  const printFromPalette = printer.print
  const paletteDay = trip ? todayIsoIn(trip.timezone) : ""
  const paletteCommands = useMemo(
    () =>
      trip
        ? tripCommands({
            trip,
            basePath,
            navigate,
            dayId: dayId ?? null,
            locked,
            actions: {
              share: () => setDialog("share"),
              ...(editable
                ? {
                    improve: () => setDialog({ ai: "trip" }),
                    details: () => setDialog("details"),
                    instagram: importFromInstagram,
                  }
                : {}),
              exportCalendar: () => exportCalendar(trip),
              print: printFromPalette,
              copyText: copyFromPalette,
              // On the overview, exactly the tab bar (an open wishlist place
              // closes with it). From a day it is a move to the overview, a
              // new entry like any other link off the day.
              openTab: (next) => (dayId ? navigate(next === "itinerary" ? basePath : `${basePath}?tab=${next}`) : setTab(next)),
            },
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `paletteDay` rebuilds the list when the trip's date turns over ("Go to today")
    [trip, basePath, navigate, dayId, editable, locked, importFromInstagram, printFromPalette, copyFromPalette, paletteDay, setTab],
  )
  useRegisterCommands("trip", paletteCommands)

  const shownAccent = trip ? resolveAccent(trip.appearance?.accent) : null
  useEffect(() => {
    if (tripId && shownAccent) rememberTripAccent(tripId, shownAccent)
  }, [tripId, shownAccent])

  if (editor.state.s === "loading") {
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

  if (editor.state.s === "loadError" || !trip) {
    if (editor.state.s === "loadError" && isMissingTripError(editor.state.message)) return <TripsNotFound />
    return (
      <div {...sx(s.content)} style={{ maxWidth: "36rem", marginInline: "auto" }}>
        <div {...sx(a.alert)} role="alert">
          <p {...sx(a.wrap)} style={{ margin: 0 }}>
            Couldn’t open this trip. Check your connection, then try again.
            {editor.state.s === "loadError" ? ` (${editor.state.message})` : ""}
          </p>
        </div>
        <div {...sx(a.rowWrap)}>
          <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={editor.reload}>
            Try again
          </button>
          <Link to="/trips" {...sx(a.btn, a.btnSecondary)}>
            Back to all trips
          </Link>
        </div>
      </div>
    )
  }

  const accent = resolveAccent(trip.appearance?.accent)
  const timing = tripTiming(trip)
  const owner = editor.access === "owner"
  const showMap = wide || view === "map"
  const sync = editor.sync
  const running = ai.k === "running" ? ai.run : null
  // A review shows on whichever panel is open, with Stop: one taken up after
  // a reload, or started on another device, can be of any part of the trip.
  const reviewRun = ai.k === "running" && ai.run !== "draft" ? ai.run : null
  const reviewing =
    ai.k === "running" && reviewRun
      ? reviewProgress(
          ai.live,
          reviewRun === "trip" ? "your trip" : (editor.dayOptions.find((d) => d.id === reviewRun.day)?.label.split(" · ")[0] ?? "the day"),
        )
      : undefined
  /** Reading the copy kept on this device: nothing that needs the server. */
  const onDevice = editor.copy !== null
  /** One save line in the page: in the header from 1024px, in the bottom bar below. */
  const saveLine = (place: "header" | "bar") =>
    editable && <SaveIndicator sync={sync} online={editor.online} locked={locked} onRetry={editor.retrySave} place={place} />

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
      ? [
          {
            label: "Add places from Instagram",
            icon: <IgGlyph size={16} />,
            disabled: locked,
            onSelect: () => openInstagram([]),
          },
        ]
      : []),
    ...(editable
      ? [{ label: "Trip details", icon: <Settings2 size={16} strokeWidth={1.75} aria-hidden />, disabled: locked, onSelect: () => setDialog("details") }]
      : []),
    calendarMenuItem(trip),
    printMenuItem(printer),
    { label: "Trip recap", icon: <BookOpen size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setRecapOpen(true) },
    copyMenuItem(trip, confirm),
    ...(onDevice
      ? []
      : [
          {
            label: "Duplicate trip",
            icon: <Copy size={16} strokeWidth={1.75} aria-hidden />,
            onSelect: () =>
              void act("duplicate", async () => {
                await editor.flush()
                const copy = await duplicateTrip(editor.readToken, editor.trip ?? trip)
                if (!aliveRef.current) return
                navigate(`/trips/${copy.slug ?? copy.id}`)
              }),
          },
        ]),
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

  // A title alone would send Directions to a search of the whole world.
  const activeMaps =
    active && (isLocated(active.item) || active.item.location?.address)
      ? externalMapsLink({
          name: active.item.location?.name ?? active.item.title,
          address: active.item.location?.address,
          lat: active.item.location?.lat,
          lng: active.item.location?.lng,
        })
      : undefined

  const page = (
    <div {...sx(s.root)} data-trip-accent={accent}>
      {/* On a phone the map covers the list: what it covers leaves the Tab order too. */}
      <div {...sx(s.pane)} ref={paneRef} inert={!wide && view === "map"}>
        {dayId ? (
          <header {...sx(s.headCompact, s.headCompactHide)}>
            <Link to={basePath} {...sx(s.compactTitle, a.truncate)} title="Back to the trip overview">
              {trip.name}
            </Link>
            <span {...sx(a.mono, a.muted, a.noShrink, s.compactDates)}>{formatRange(trip.startDate, trip.endDate)}</span>
            <span {...sx(a.grow)} />
            {wide && saveLine("header")}
            {!onDevice && (
              <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => setDialog("share")}>
                <Share2 size={14} strokeWidth={1.75} aria-hidden />
                Share
              </button>
            )}
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
                  onChange={(event) => {
                    const name = event.target.value.replace(/\s*\n\s*/g, " ")
                    editor.edit((doc) => ({ ...doc, name }))
                  }}
                />
              </>
            ) : (
              <h1 {...sx(a.display, s.title, a.wrapName)}>{trip.name}</h1>
            )}
            <div {...sx(s.headMeta)}>
              {editable ? (
                <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} style={{ marginLeft: "-0.875rem" }} disabled={locked} onClick={() => setDialog("details")}>
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
              {!onDevice && (
                <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm)} onClick={() => setDialog("share")}>
                  <Share2 size={14} strokeWidth={1.75} aria-hidden />
                  Share
                </button>
              )}
              {editable && (
                <button type="button" {...sx(a.btn, a.btnSoft, a.btnSm)} disabled={locked} onClick={() => setDialog({ ai: "trip" })}>
                  <Sparkles size={14} strokeWidth={1.75} aria-hidden />
                  {hasItems ? "Improve with AI" : "Draft with AI"}
                </button>
              )}
              {editable && (
                <button type="button" {...sx(a.btn, a.btnSecondary, a.btnSm, s.wideOnly)} disabled={locked} onClick={() => openInstagram([])}>
                  <IgGlyph size={14} />
                  From Instagram
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
              {wide && saveLine("header")}
            </div>
          </header>
        )}

        <DayRail
          trip={trip}
          basePath={basePath}
          dayId={dayId}
          end={
            dayId && (
              <span {...sx(s.railEnd)}>
                <span {...sx(s.railRule)} aria-hidden />
                <Menu
                  label="Share and trip options"
                  trigger={<MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />}
                  triggerStyle={[a.iconBtn, a.iconBtnSm]}
                  items={[
                    ...(onDevice ? [] : [{ label: "Share", icon: <Share2 size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setDialog("share") }]),
                    ...menu,
                  ]}
                />
              </span>
            )
          }
        />

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
            enhancing={reviewRun !== null}
            progress={reviewing}
            applying={ai.k === "applying"}
            run={editor.activeRun && editor.activeRun.scope === "day" && editor.activeRun.dayId === day.id ? editor.activeRun : null}
            skipReasons={editor.skipReasons}
            dayOptions={editor.dayOptions}
            recentIds={editor.recentIds}
            hot={hot}
            activeId={activeId}
            edit={edit?.dayId === day.id ? edit : null}
            dayView={dayView}
            onDayView={setDayView}
            surface={surface}
            near={near}
            onChange={editor.setDays}
            onEditTrip={editor.edit}
            onDelete={editor.deleteItem}
            onAdded={onAdded}
            onLocate={locate}
            onAskAi={(prompt) => setDialog({ ai: "day", prompt })}
            onClear={() => setDialog("clear")}
            onApplyRun={editor.applyActiveRun}
            onDismissRun={editor.dismissRun}
            onStopAi={editor.stopAi}
            onPhotoreal={photorealReady ? () => fly.set(true) : undefined}
            onInstagram={openInstagram}
            sky={daySky(day, forecast)}
            holidays={holidays.get(day.id)}
          />
        ) : (
          <OverviewTabs
            tab={tab}
            onTab={setTab}
            badges={tabBadges(trip)}
            render={(open) =>
              open === "itinerary" ? (
                      <OverviewPanel
                  trip={trip}
                  forecast={forecast.byDay}
                  typical={forecast.typical}
                  basePath={basePath}
                  editable={editable}
                  locked={locked}
                  drafting={running === "draft"}
                  enhancing={reviewRun !== null}
                  progress={reviewing}
                  applying={ai.k === "applying"}
                  run={editor.activeRun && editor.activeRun.scope === "trip" ? editor.activeRun : null}
                  skipReasons={editor.skipReasons}
                  dayOptions={editor.dayOptions}
                  onDraft={(brief) => void draft(brief)}
                  onHoverDay={(id) => hot.set(id ? `${DAY_PIN}${id}` : null)}
                  onApplyRun={editor.applyActiveRun}
                  onDismissRun={editor.dismissRun}
                  onStopAi={editor.stopAi}
                  onAddBooking={addBookingByHand}
                  onPasteBookings={() => setPasting(true)}
                  onUpdateDay={(dayId, change, undo) => editor.setDays((days) => days.map((d) => (d.id === dayId ? change(d) : d)), undo)}
                  onOpenRecap={() => setRecapOpen(true)}
                />
              ) : (
                <OverlayBoundary onError={overlayFailed(`The ${tabLabel(open)} tab`, () => setTab("itinerary"))}>
                  <Suspense fallback={<PanelLoading />}>
                    <div {...sx(s.content)}>
                      {open === "budget" && (
                        <BudgetPanel
                          trip={trip}
                          editable={editable}
                          locked={locked}
                          viewer={viewer}
                          onEdit={editor.edit}
                          onOpenItem={(itemDayId, itemId) => {
                            navigate(`${basePath}/day/${itemDayId}`)
                            openEditor(itemDayId, itemId)
                          }}
                        />
                      )}
                      {open === "checklist" && (
                        <ChecklistPanel trip={trip} editable={editable} locked={locked} people={trip.party} onEdit={editor.edit} />
                      )}
                      {open === "essentials" && <EssentialsPanel trip={trip} />}
                      {open === "neighborhoods" && (
                        <AreasPanel trip={trip} basePath={basePath} getToken={editor.readToken} shownId={areaMap.area?.id ?? null} onShow={showArea} />
                      )}
                      {open === "wishlist" && <IdeasPanel trip={trip} basePath={basePath} editable={editable} locked={locked} near={near} onEdit={editor.edit} />}
                    </div>
                  </Suspense>
                </OverlayBoundary>
              )
            }
          />
        )}
      </div>

      <p {...sx(a.srOnly)} role="status" aria-live="polite">
        {editor.notice && !PROBLEM.test(editor.notice) ? editor.notice : announce}
      </p>
      {printer.node}
      {(toast || flash || sync.k === "conflict" || editor.notice || lodgingNudge || overlayProblem) && (
        <div {...sx(s.dock)}>
          {toast && <UndoToast key={toast.id} entry={toast} hold={locked || instagram !== null} onUndo={undoLast} onExpire={expireToast} />}
          {sync.k === "conflict" && (
            <div {...sx(s.dockItem)} role="alert">
              <span {...sx(a.grow, a.wrap)}>
                Someone else changed the same part of this trip while you were editing. Which version should stay?
              </span>
              <button type="button" {...sx(s.dockBtn)} onClick={() => editor.resolveConflict("mine")}>
                Keep mine
              </button>
              <button type="button" {...sx(s.dockBtn)} onClick={() => editor.resolveConflict("theirs")}>
                Use theirs
              </button>
            </div>
          )}
          {lodgingNudge && (
            <div {...sx(s.dockItem)} role="status">
              <span {...sx(a.grow, a.wrap)}>Staying at {lodgingNudge.name}. Rework the plan around it?</span>
              <button
                type="button"
                {...sx(s.dockBtn)}
                disabled={locked}
                onClick={() => {
                  const name = lodgingNudge.name
                  setLodgingNudge(null)
                  navigate(basePath)
                  void editor.runEnhance("trip", undefined, lodgingBrief(name))
                }}
              >
                Adjust plan
              </button>
              <button type="button" {...sx(s.dockBtn)} onClick={() => setLodgingNudge(null)}>
                Not now
              </button>
            </div>
          )}
          {overlayProblem && (
            <div {...sx(s.dockItem)} role="alert">
              <span {...sx(a.grow, a.wrap)}>{overlayProblem.text}</span>
              {overlayProblem.stale && (
                <button type="button" {...sx(s.dockBtn)} onClick={() => window.location.reload()}>
                  Reload
                </button>
              )}
              <button type="button" {...sx(s.dockBtn)} onClick={() => setOverlayProblem(null)}>
                Dismiss
              </button>
            </div>
          )}
          {flash && (
            <div key={flash.n} {...sx(s.dockItem)} aria-hidden>
              <span {...sx(a.grow, a.wrap)}>{flash.text}</span>
            </div>
          )}
          {editor.notice && (
            <div {...sx(s.dockItem)} role={PROBLEM.test(editor.notice) ? "alert" : undefined}>
              <span {...sx(a.grow, a.wrap)}>{editor.notice}</span>
              <button type="button" {...sx(s.dockBtn)} onClick={() => editor.setNotice(null)}>
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {(wide || mapOpened) && (
        <div {...sx(s.mapPane, "trips-glass-map")} hidden={!showMap}>
          <HotMap
            hot={hot}
            pins={mapPins}
            routes={routes}
            frameKey={areaFramed ? areaMap.frameKey : frameKey}
            framePoints={focusPin ? [focusPin] : areaFramed ? areaMap.framePoints : framePoints}
            area={areaMap.shape}
            restCenter={tripCenter ?? undefined}
            restZoom={tripCenter ? 10.5 : 1.4}
            maxZoom={focusPin ? 16.2 : undefined}
            padding={areaFramed && !wide ? AREA_PADDING_NARROW : mapPadding}
            activeId={activeId}
            dots={dots}
            onSelect={(id) => {
              if (id.startsWith(DAY_PIN)) {
                navigate(`${basePath}/day/${id.slice(DAY_PIN.length)}`)
                return
              }
              setActiveId(id)
              setFocusId(null)
            }}
            // A drawn neighborhood is the map's one subject: the wishlist steps aside until it is cleared.
            ideaPins={areaMap.shape ? NO_PINS : wishPins}
            // One history entry per opening: Back closes the wishlist place again.
            onSelectIdea={(ideaId) => ideaNav.open(ideaId, "map")}
            ideaPreview={(ideaId, via) => {
              const idea = trip.ideas?.find((i) => i.id === ideaId)
              return idea ? <IdeaPreview idea={idea} trip={trip} via={via} /> : null
            }}
            label={
              day
                ? [`Map of day ${dayIndex + 1} with ${plural(pins.length, "pinned stop")}`, ...hotelPins.map((pin) => pin.title)].join(". ")
                : `Map of the whole trip with ${plural(pins.length, "pinned place")}`
            }
          >
            {areaMap.area && areaMap.shape ? (
              <AreaKey ref={areaKeyRef} name={areaMap.area.name} shape={areaMap.shape} onClear={clearArea} />
            ) : (
              <p {...sx(s.mapChip, "trips-glass-pill")}>
                <span {...sx(a.truncate)}>
                  {[
                    day ? `Day ${dayIndex + 1}` : "All days",
                    day?.city,
                    !day ? (dots.length < tripStops ? `${dots.length} of ${plural(tripStops, "place")}` : plural(tripStops, "place")) : dayStops === 0 ? null : pinnedStops < dayStops ? `${pinnedStops} of ${plural(dayStops, "stop")}` : plural(dayStops, "stop"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </p>
            )}
            {day && photorealReady && pins.length > 0 && (
              <button type="button" {...sx(s.flyBtn)} onClick={() => fly.set(true)} title="Fly through this day in photoreal 3D">
                <Orbit size={15} strokeWidth={1.75} aria-hidden />
                Fly in 3D
              </button>
            )}
            {active && (
              <aside ref={measureCard} {...sx(s.placeCard, "trips-glass-sheet")} aria-label="Selected place">
                <PlacePhoto key={active.item.id} item={active.item} city={active.day.city ?? trip.destinations[0] ?? ""} />
                <div {...sx(a.between)} style={{ alignItems: "flex-start" }}>
                  <div {...sx(a.stack)} style={{ gap: "0.25rem" }}>
                    <p {...sx(a.eyebrow)}>
                      <PlaceEyebrow
                        lead={
                          activeStay
                            ? [STAY_LEAD[activeStay.role]]
                            : [tour ? `Stop ${tour.at + 1} of ${tour.ids.length}` : `Day ${active.dayNumber}`, active.item.time ? formatClock(active.item.time) : null]
                        }
                        category={active.item.location?.category ? titleCase(active.item.location.category) : null}
                      />
                    </p>
                    <h3 {...sx(a.display, s.placeTitle, a.wrapName)}>{active.item.title || active.item.location?.name}</h3>
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
                  {activeElsewhere && (
                    <Link to={`${basePath}/day/${active.day.id}#item-${active.item.id}`} {...sx(a.btn, a.btnSecondary, a.btnSm)}>
                      Open day {active.dayNumber}
                    </Link>
                  )}
                  {!activeElsewhere && editable && (
                    <button
                      type="button"
                      {...sx(a.btn, a.btnSecondary, a.btnSm)}
                      onClick={() => openEditor(active.day.id, active.item.id)}
                    >
                      Edit stop
                    </button>
                  )}
                  {tour && tour.ids.length > 1 && (
                    <span {...sx(a.row)} style={{ marginLeft: "auto", gap: "0.5rem" }}>
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
          </HotMap>
        </div>
      )}

      <div {...sx(s.bar, "trips-glass-bar trips-glass-dock")}>
        {!wide && saveLine("bar")}
        <div {...sx(share.segment, s.barSegment, "trips-glass-segment")} role="radiogroup" aria-label="View" onKeyDown={onViewKey}>
          <button
            type="button"
            role="radio"
            aria-checked={view === "list"}
            tabIndex={view === "list" ? 0 : -1}
            data-view="list"
            {...sx(share.segmentBtn, s.barBtn, view === "list" && share.segmentOn)}
            onClick={() => setView("list")}
          >
            <List size={16} strokeWidth={1.75} aria-hidden />
            {/* The overview's other tabs are lists too, not the itinerary. */}
            {dayId || tab === "itinerary" ? "Itinerary" : "List"}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={view === "map"}
            tabIndex={view === "map" ? 0 : -1}
            data-view="map"
            {...sx(share.segmentBtn, s.barBtn, view === "map" && share.segmentOn)}
            onClick={() => setView("map")}
          >
            <MapIcon size={16} strokeWidth={1.75} aria-hidden />
            Map
          </button>
        </div>
      </div>

      <Presence when={dialog === "share"}>{() => (
        <ShareDialog
          open
          tripId={trip.id}
          getToken={editor.readToken}
          viewerId={viewer.id}
          onClose={() => setDialog(null)}
          onChanged={(next) => editor.setCollaborators(next.collaborators)}
          onLeft={() => navigate("/trips")}
        />
      )}</Presence>
      {editable && (
        <DetailsDialog
          trip={trip}
          open={dialog === "details" && !locked}
          onClose={() => setDialog(null)}
          onApply={(patch) => {
            // Only what the dialog changed lands, on the trip as it is now.
            editor.edit((doc) => applyDetailsPatch(doc, patch), detailsUndo(trip, patch))
            const next = applyDetailsPatch(trip, patch)
            if (dayId && !next.days.some((d: TripDay) => d.id === dayId)) navigate(basePath)
          }}
        />
      )}
      <AiSheet
        open={typeof dialog === "object" && dialog !== null}
        scope={typeof dialog === "object" && dialog !== null ? dialog.ai : "trip"}
        prompt={typeof dialog === "object" && dialog !== null ? dialog.prompt : undefined}
        dayLabel={day ? day.title || formatTripDate(day.date, trip.timezone, { weekday: "long" }) : undefined}
        hasItems={hasItems}
        onClose={() => setDialog(null)}
        onRun={runAi}
      />
      <Presence when={editable && instagram}>{(instagram) => (
        <OverlayBoundary onError={overlayFailed("Instagram import", () => setInstagram(null))}>
        <Suspense fallback={null}>
          <InstagramSheet
            open
            trip={trip}
            dayId={day?.id}
            initialUrls={instagram.urls}
            getToken={editor.readToken}
            onClose={closeInstagram}
            onAdd={addFromInstagram}
          />
        </Suspense>
        </OverlayBoundary>
      )}</Presence>
      <Presence when={editor.changes}>{(changes) => (
        <OverlayBoundary onError={overlayFailed("The summary of changes", editor.closeChanges)}>
          <Suspense fallback={null}>
            <ChangesSheet changes={changes} basePath={basePath} accent={accent} reduce={editor.reduce ?? false} onClose={editor.closeChanges} />
          </Suspense>
        </OverlayBoundary>
      )}</Presence>
      <Presence when={recapOpen}>{() => (
        <OverlayBoundary onError={overlayFailed("The recap", () => setRecapOpen(false))}>
          <Suspense fallback={null}>
            <TripRecap open trip={trip} onClose={() => setRecapOpen(false)} />
          </Suspense>
        </OverlayBoundary>
      )}</Presence>
      <Presence when={searchParams.has(IDEA_PARAM)}>{() => (
        <OverlayBoundary onError={overlayFailed("The wishlist place", ideaNav.close)}>
          <Suspense fallback={null}>
            <IdeaOverlay trip={trip} editable={editable} locked={locked} getToken={editor.readToken} onEdit={editor.edit} />
          </Suspense>
        </OverlayBoundary>
      )}</Presence>
      <Presence when={editable && pasting}>{() => (
        <OverlayBoundary onError={overlayFailed("Paste a confirmation", () => setPasting(false))}>
          <Suspense fallback={null}>
            <PasteBookingsSheet trip={trip} getToken={editor.readToken} onClose={() => setPasting(false)} onAdd={addPasted} />
          </Suspense>
        </OverlayBoundary>
      )}</Presence>
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
                  // Unsaved edits are dropped only once the trip is really gone;
                  // a failed delete leaves them to save as usual.
                  await deleteTrip(editor.readToken, trip.id)
                  editor.discard()
                  if (!aliveRef.current) return
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
                if (day) {
                  editor.setDays((days) => days.map((d) => (d.id === day.id ? { ...d, items: [] as ItineraryItem[] } : d)), {
                    label: `Cleared day ${dayIndex + 1}`,
                    toast: true,
                  })
                }
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

      {day && (
        <WhenOn value={fly}>
          <OverlayBoundary onError={overlayFailed("The 3D view", () => fly.set(false))}>
            <Suspense fallback={null}>
              <PhotorealOverlay
                key={day.id}
                trip={trip}
                day={day}
                dayNumber={dayIndex + 1}
                initialStopId={activeId ?? undefined}
                onClose={() => fly.set(false)}
                onEditStop={
                  editable
                    ? (itemId) => {
                        fly.set(false)
                        openEditor(day.id, itemId)
                      }
                    : undefined
                }
              />
            </Suspense>
          </OverlayBoundary>
        </WhenOn>
      )}
    </div>
  )
  return <TripPlacesContext.Provider value={placesForSearch}>{page}</TripPlacesContext.Provider>
}

/** The map reads the hovered stop itself: a hover lights a pin without redrawing the page. */
function HotMap({ hot, ...props }: Omit<AtlasMapProps, "hotId" | "onHover"> & { hot: LiveValue<string | null> }) {
  return <AtlasMap {...props} hotId={useLiveValue(hot)} onHover={hot.set} />
}

/** `children` while `value` is on. Mounted and unmounted here, so the page that holds it doesn't redraw. */
function WhenOn({ value, children }: { value: LiveValue<boolean>; children: ReactNode }) {
  return useLiveValue(value) ? children : null
}

/** The count of unticked things beside Checklist, read as "3 left". */
function tabBadges(trip: Trip): Partial<Record<OverviewTab, TabBadge>> {
  const badges: Partial<Record<OverviewTab, TabBadge>> = {}
  const open = (trip.checklist ?? []).filter((item) => !item.done).length
  if (open > 0) badges.checklist = { text: String(open), label: `${open} left` }
  const saved = trip.ideas?.length ?? 0
  if (saved > 0) badges.wishlist = { text: String(saved), label: `${saved} on the wishlist` }
  return badges
}

const tabLabel = (tab: OverviewTab) => OVERVIEW_TABS.find((t) => t.id === tab)?.label.toLowerCase() ?? tab

function PanelLoading() {
  return (
    <div {...sx(s.content)} role="status" aria-label="Loading">
      <Spinner />
    </div>
  )
}

/**
 * "STOP 5 OF 9 · 3:30 PM · NEIGHBORHOOD" on a wide card; on a phone the
 * category takes its own line, with no separator left at the break.
 */
function PlaceEyebrow({ lead, category }: { lead: Array<string | null>; category: string | null }) {
  // The card is narrow at every width: the category always takes a line of its own.
  return (
    <>
      <Parts parts={lead} />
      {category && (
        <>
          {" "}
          <span {...sx(s.placeCategory)}>{category}</span>
        </>
      )}
    </>
  )
}
