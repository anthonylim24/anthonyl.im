import { TonightLine } from "../bookings/TonightLine"
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Reorder, useDragControls } from "motion/react"
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarMinus,
  CalendarPlus,
  ChevronsLeft,
  ChevronsRight,
  CopyPlus,
  Eraser,
  Heart,
  Lightbulb,
  List,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  Orbit,
  Sparkles,
  TimerOff,
} from "lucide-react"
import { sx } from "@/styles/merge"
import { formatClock, formatTripDate, plural, todayIsoIn } from "../meta"
import { dayRoute, isLocated, isToSchedule, routeMeters, splitDay, type LngLat } from "../map/geo"
import { dayZone } from "../dayClock"
import { LIMITS } from "../limits"
import { formatDistance } from "../reservationView"
import { addItem, ideasFull, saveForLater } from "../tripEdits"
import { Modal } from "../components/kit"
import { canAddDay, dayAfterDelete, deleteDay, duplicateDay, insertDayAfter, moveDay, outOfOrder, sortByTime, type DayPlan } from "./dayOps"
import { composing } from "./ime"
import type { EnhancementRun, ItineraryItem, Trip, TripDay } from "../types"
import type { DayOption } from "../useTripEditor"
import type { UndoMark } from "../editorMachine"
import { useLatestCallback } from "@/hooks/useLatestCallback"
import { a } from "../atlas.stylex"
import { share, ws as s } from "../workspace.stylex"
import { Menu, type MenuItem } from "../components/kit"
import { calendarMenuItem } from "../calendar/calendarMenu"
import { DaySky } from "./DaySky"
import { weatherKind, wetDuring, wetSpells, type DaySky as Sky, type WetSpell } from "../forecast"
import { NowLine } from "../live/NowLine"
import { clockIn, nowSlot } from "../live/liveTrip"
import { useNow } from "../live/useNow"
import { DayTimeline, ModeIcon } from "../timeline/DayTimeline"
import { DoneFold } from "../timeline/DoneFold"
import { clockMinutes, stopTitle } from "../timeline/timeline"
import { useDayView } from "./dayView"
import { defaultCurrency } from "../budget/budget"
import { AddStop } from "./AddStop"
import { AiBusy, SuggestionsReview } from "./AiPanels"
import { ItemCard, type CardConflict, type ItemCardProps } from "./ItemCard"
import { dayList, type Leg } from "./dayList"
import { Parts } from "./Parts"
import { rainBrief, stopAlerts } from "./stopAlerts"

export interface DayPanelProps {
  trip: Trip
  day: TripDay
  dayIndex: number
  basePath: string
  editable: boolean
  locked: boolean
  enhancing: boolean
  applying: boolean
  run: EnhancementRun | null
  dayOptions: DayOption[]
  recentIds: ReadonlySet<string>
  hotId: string | null
  activeId: string | null
  /** Stop whose editor should open (from the map's "Edit stop"); `n` is new for each request. */
  edit: { id: string; n: number } | null
  near: LngLat | null
  onChange: (fn: (days: TripDay[]) => TripDay[], undo?: UndoMark) => void
  /**
   * Edits the whole trip document (`editor.edit`): day operations change the
   * dates, and "Save for later" moves a stop into `trip.ideas`. Without it
   * those actions are not offered.
   */
  onEditTrip?: (fn: (doc: Trip) => Trip, undo?: UndoMark) => void
  onDelete: (dayId: string, item: ItineraryItem) => void
  onAdded: (id: string) => void
  onHover: (id: string | null) => void
  onLocate: (id: string) => void
  /** Opens "Ideas for this day", with a brief already written when one is given. */
  onAskAi: (prompt?: string) => void
  onClear: () => void
  onApplyRun: (ids: string[]) => void
  onDismissRun: () => void
  onStopAi: () => void
  /** Present when the photoreal 3D view can open in this build. */
  onPhotoreal?: () => void
  /** Opens the Instagram import with these post links. */
  onInstagram?: (urls: string[]) => void
  /** The day's weather: the live forecast, the AI's, a held place while loading, or none. */
  sky: Sky
}

type SortableProps = ItemCardProps & { leg: Leg | null; legWet: number | null }

/** Rebuilt with every edit to the day, so compared by their words, not by identity. */
const BY_VALUE = new Set<keyof SortableProps>(["leg", "conflict"])
const sameProps = (prev: SortableProps, next: SortableProps) =>
  (Object.keys(next) as (keyof SortableProps)[]).every(
    (key) => Object.is(prev[key], next[key]) || (BY_VALUE.has(key) && JSON.stringify(prev[key]) === JSON.stringify(next[key])),
  )

/** Memoised: typing in one stop re-renders that stop, not the whole day. Every prop must be stable. */
const Sortable = memo(function Sortable(props: SortableProps) {
  const controls = useDragControls()
  const { leg, legWet, ...card } = props
  const onGrip = useCallback((event: ReactPointerEvent) => controls.start(event), [controls])
  return (
    <Reorder.Item
      as="li"
      value={props.item}
      dragListener={false}
      dragControls={controls}
      style={{ position: "relative", listStyle: "none" }}
      whileDrag={{ scale: 1.02, zIndex: 5 }}
    >
      {leg && <LegRow leg={leg} wet={legWet} />}
      <ItemCard {...card} onGrip={onGrip} />
    </Reorder.Item>
  )
}, sameProps)

/**
 * The way into a stop: "940 m · 12 min walk · 1 h 08 free", then "Leave by
 * 3:18 PM" on its own line. `wet`: the WMO code of what falls on the way, drawn
 * after the journey as on the timeline.
 */
function LegRow({ leg, wet }: { leg: Leg; wet: number | null }) {
  const Wet = wet === null ? null : weatherKind(wet).icon
  return (
    <div {...sx(s.item)} aria-hidden>
      <div {...sx(s.gutter)} style={{ paddingTop: 0 }}>
        <span {...sx(s.gutterLine)} />
      </div>
      <p {...sx(s.leg)}>
        {leg.mode === "overlap" ? <TimerOff size={12} strokeWidth={2} aria-hidden /> : <ModeIcon mode={leg.mode} />}
        <span>
          <Parts
            parts={[
              leg.distance,
              <>
                {leg.travel}
                {Wet && (
                  <>
                    {" "}
                    <Wet size={12} strokeWidth={1.75} aria-hidden {...sx(s.legWet)} />
                  </>
                )}
              </>,
              leg.free,
            ]}
          />
        </span>
        {leg.leave && <span {...sx(s.legLeave)}>{leg.leave}</span>}
      </p>
    </div>
  )
}

/** Focus target after a stop leaves the list: the next stop, else the one before, else the composer. */
const COMPOSER = "composer"

export function DayPanel({
  trip,
  day,
  dayIndex,
  basePath,
  editable,
  locked,
  enhancing,
  applying,
  run,
  dayOptions,
  recentIds,
  hotId,
  activeId,
  edit,
  near,
  onChange,
  onEditTrip,
  onDelete,
  onAdded,
  onHover,
  onLocate,
  onAskAi,
  onClear,
  onApplyRun,
  onDismissRun,
  onStopAi,
  onPhotoreal,
  onInstagram,
  sky,
}: DayPanelProps) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [spoken, setSpoken] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  /** Where keyboard focus goes once the list has re-rendered without a stop. */
  const focusNext = useRef<string | null>(null)
  const isToday = day.date === todayIsoIn(trip.timezone)
  // Today or already over, where the day is lived: stops can be marked Done,
  // Skipped or Loved, and the journal opens.
  const lived = day.date <= todayIsoIn(dayZone(trip, day))
  const now = useNow(60_000, isToday)
  const clock = isToday ? clockIn(trip.timezone, now) : null
  const list = useMemo(() => dayList(day, clockMinutes(clock ?? undefined)), [day, clock])
  const slot = isToday ? nowSlot(day, trip, now) : null
  const nowLine = slot === null || clock === null ? null : <NowLine key="now-line" time={formatClock(clock)} />
  const prev = dayIndex > 0 ? trip.days[dayIndex - 1] : undefined
  const next = dayIndex < trip.days.length - 1 ? trip.days[dayIndex + 1] : undefined
  const route = useMemo(() => dayRoute(day), [day])
  const { planned, parked } = useMemo(() => splitDay(day), [day])
  const stops = planned.filter((i) => i.kind !== "section" && i.kind !== "note").length
  const toSchedule = parked.filter((i) => i.kind !== "section" && i.kind !== "note").length
  const meters = routeMeters(route)

  const [dayView, setDayView] = useDayView()
  const currency = defaultCurrency(trip)
  const forecast = sky.status === "forecast" ? sky.forecast : undefined
  const alerts = useMemo(() => stopAlerts(day, forecast?.hours), [day, forecast])
  const spells = useMemo(() => wetSpells(forecast?.hours ?? []), [forecast])
  const legWet = (leg: Leg | undefined) => (leg?.on ? (wetDuring(spells, leg.on.from, leg.on.to)?.code ?? null) : null)
  const summary =
    [stops > 0 ? plural(stops, "stop") : null, meters > 100 ? formatDistance(meters) : null, toSchedule > 0 ? `${toSchedule} to schedule` : null]
      .filter(Boolean)
      // An empty day's card already says "Nothing planned yet"; the header does not echo it.
      .join(" · ") || (day.items.length === 0 ? null : "Nothing planned")

  const unsorted = useMemo(() => outOfOrder(day.items), [day.items])
  const parkedAt = day.items.findIndex(isToSchedule)

  const patchDay = (patch: Partial<TripDay>, undo?: UndoMark) =>
    onChange((days) => days.map((d) => (d.id === day.id ? { ...d, ...patch } : d)), undo)

  // Whole-day edits change the dates, so they go through the trip document.
  const editPlan = (op: (plan: DayPlan) => DayPlan | null, undo: UndoMark) =>
    onEditTrip?.((doc) => {
      const plan = op(doc)
      return plan ? { ...doc, ...plan } : doc
    }, undo)
  const dayName = `day ${dayIndex + 1}`
  const removeDay = () => {
    setConfirmDelete(false)
    const after = dayAfterDelete(trip.days, day.id)
    if (!after) return
    editPlan((plan) => deleteDay(plan, day.id), { label: `Deleted ${dayName}`, toast: true })
    // This page's day is gone: show the one that took its place.
    navigate(`${basePath}/day/${after.id}`, { replace: true })
  }
  const dayHasContent = day.items.length > 0 || !!day.notes || !!day.journal

  // The card names the other stop in a clash by its number on the map, as the pins do.
  const conflicts = useMemo(() => {
    const byId = new Map(day.items.map((item) => [item.id, item]))
    const named = new Map<string, CardConflict>()
    for (const [id, { conflict }] of alerts) {
      if (!conflict) continue
      const other = byId.get(conflict.otherId)
      const label = list.labels.get(conflict.otherId)
      named.set(id, { ...conflict, otherNumber: label ? Number(label) : null, otherTitle: other ? stopTitle(other) : "another stop" })
    }
    return named
  }, [alerts, list, day.items])

  // On today the finished head of the list folds into one row, open or shut in
  // both layouts. A stop in it that is selected (on the map, by a deep link),
  // opened for editing from the map, or holding focus (its editor in use) opens it.
  const [foldOpen, setFoldOpen] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const reveal = list.done?.stops.find((id) => id === activeId || id === edit?.id || id === focused) ?? null
  const revealKey = reveal && `${reveal}:${edit?.id === reveal ? edit.n : 0}`
  const [revealed, setRevealed] = useState<string | null>(null)
  if (revealKey !== revealed) {
    setRevealed(revealKey)
    if (revealKey) setFoldOpen(true)
  }
  const toggleFold = () => setFoldOpen((open) => !open)
  const hidden = list.done && !foldOpen ? list.done.length : 0
  const shown = hidden > 0 ? day.items.slice(hidden) : day.items

  const rework = useLatestCallback((spell: WetSpell) => onAskAi(rainBrief(spell)))
  // A pinned stop opens on the map; an unpinned one in the list, where it can be edited.
  const findStop = useLatestCallback((id: string) => {
    const item = day.items.find((i) => i.id === id)
    if (item && isLocated(item)) onLocate(id)
    else {
      setDayView("list")
      onHover(id)
    }
  })

  // A deleted or moved stop takes focus with it; hand it to its neighbour
  // so a keyboard user carries on from where they were.
  const leave = useLatestCallback((index: number) => {
    const after = day.items[index + 1] ?? day.items[index - 1]
    focusNext.current = after?.id ?? COMPOSER
  })
  const removeStop = useCallback(
    (dayId: string, item: ItineraryItem, index: number) => {
      leave(index)
      onDelete(dayId, item)
    },
    [leave, onDelete],
  )
  // Stable for the memoised cards; absent (not offered) until the trip can be edited as a whole.
  const keepForLater = useLatestCallback((dayId: string, item: ItineraryItem, index: number) => {
    leave(index)
    onEditTrip?.((doc) => saveForLater(doc, dayId, item.id), { label: `Saved “${item.title || "Untitled"}” for later`, toast: true })
    setSpoken(`${item.title || "Stop"} saved for later, in the trip’s ideas.`)
  })
  const onSaveForLater = onEditTrip ? keepForLater : undefined
  const noRoomForIdeas = ideasFull(trip)
  // The edit that removed the stop re-renders this panel; focus moves once it has.
  useLayoutEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    const row = target === COMPOSER ? null : document.getElementById(`item-${target}`)?.querySelector<HTMLElement>("[data-card-row]")
    ;(row ?? rootRef.current?.querySelector<HTMLElement>('input[role="combobox"]'))?.focus()
  })

  const menu: MenuItem[] = [
    ...(editable
      ? [{ label: day.notes ? "Edit day notes" : "Add day notes", icon: <NotebookPen size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setNotesOpen(true) }]
      : []),
    ...(editable && unsorted
      ? [
          {
            label: "Sort stops by time",
            icon: <ArrowDownUp size={16} strokeWidth={1.75} aria-hidden />,
            disabled: locked,
            onSelect: () => patchDay({ items: sortByTime(day.items) }, { label: `Sorted day ${dayIndex + 1} by time`, toast: true }),
          },
        ]
      : []),
    ...(onPhotoreal && route.length > 0
      ? [{ label: "Fly the day in 3D", icon: <Orbit size={16} strokeWidth={1.75} aria-hidden />, onSelect: onPhotoreal }]
      : []),
    calendarMenuItem(trip, day),
    ...(editable && onEditTrip
      ? [
          {
            label: "Add a day after this one",
            icon: <CalendarPlus size={16} strokeWidth={1.75} aria-hidden />,
            separated: true,
            disabled: locked || !canAddDay(trip),
            onSelect: () => {
              editPlan((plan) => insertDayAfter(plan, day.id), { label: `Added a day after ${dayName}` })
              setSpoken(`Added day ${dayIndex + 2}. Later days moved a date on.`)
            },
          },
          {
            label: "Duplicate this day",
            icon: <CopyPlus size={16} strokeWidth={1.75} aria-hidden />,
            disabled: locked || !canAddDay(trip),
            onSelect: () => {
              editPlan((plan) => duplicateDay(plan, day.id), { label: `Duplicated ${dayName}` })
              setSpoken(`Day ${dayIndex + 2} is a copy of this day. Later days moved a date on.`)
            },
          },
          {
            label: "Move a day earlier",
            icon: <ChevronsLeft size={16} strokeWidth={1.75} aria-hidden />,
            disabled: locked || dayIndex === 0,
            onSelect: () => {
              editPlan((plan) => moveDay(plan, day.id, -1), { label: `Moved ${dayName} earlier`, toast: true })
              setSpoken(`This plan is day ${dayIndex} now.`)
            },
          },
          {
            label: "Move a day later",
            icon: <ChevronsRight size={16} strokeWidth={1.75} aria-hidden />,
            disabled: locked || dayIndex === trip.days.length - 1,
            onSelect: () => {
              editPlan((plan) => moveDay(plan, day.id, 1), { label: `Moved ${dayName} later`, toast: true })
              setSpoken(`This plan is day ${dayIndex + 2} now.`)
            },
          },
        ]
      : []),
    ...(editable && day.items.length > 0
      ? [
          {
            label: "Clear this day",
            icon: <Eraser size={16} strokeWidth={1.75} aria-hidden />,
            danger: true,
            separated: true,
            disabled: locked,
            onSelect: onClear,
          },
        ]
      : []),
    ...(editable && onEditTrip
      ? [
          {
            label: "Delete this day",
            icon: <CalendarMinus size={16} strokeWidth={1.75} aria-hidden />,
            danger: true,
            separated: day.items.length === 0,
            disabled: locked || trip.days.length <= 1,
            onSelect: () => (dayHasContent ? setConfirmDelete(true) : removeDay()),
          },
        ]
      : []),
  ]

  return (
    <div {...sx(s.content)} key={day.id} ref={rootRef}>
      <header {...sx(s.dayHead)}>
        {/* "·" + a no-break space: a wrapped line never ends on a separator. */}
        <p {...sx(a.eyebrow, s.dayEyebrow)}>
          <Link to={basePath} {...sx(s.eyebrowTrip, a.truncate)} aria-label={`${trip.name || "Trip"}, trip overview`}>
            {trip.name || "Trip"}
          </Link>
          <span {...sx(s.dayEyebrowPart)}>
            <span {...sx(s.phoneOnly)} aria-hidden>
              {"·\u00a0"}
            </span>
            Day {dayIndex + 1} of {trip.days.length}
          </span>
          <span {...sx(s.dayEyebrowPart, s.wideOnlyPart)}>
            {" ·\u00a0"}
            {formatTripDate(day.date, trip.timezone, { weekday: "long", month: "long" })}
          </span>
          {isToday && <span {...sx(s.dayEyebrowPart, s.tripText)}>{" ·\u00a0"}Today</span>}
        </p>
        <div {...sx(s.dayHeadTop)}>
          <div {...sx(s.dayHeadMain)}>
            {editable ? (
              <textarea
                rows={1}
                aria-label="Day title"
                value={day.title ?? ""}
                placeholder={`Name day ${dayIndex + 1}`}
                disabled={locked}
                maxLength={LIMITS.dayTitle}
                {...sx(s.titleInput, s.dayTitle, "trips-day-title-input")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !composing(event)) {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
                onChange={(event) => patchDay({ title: event.target.value.replace(/\s*\n\s*/g, " ") || undefined })}
              />
            ) : (
              <h2 {...sx(a.display, s.dayTitle, a.wrap)}>{day.title || `Day ${dayIndex + 1}`}</h2>
            )}
            <div {...sx(a.rowWrap)} style={{ columnGap: "0.875rem" }}>
              <span {...sx(a.row, a.small)} style={{ gap: "0.25rem" }}>
                <MapPin size={14} strokeWidth={1.75} aria-hidden />
                {editable ? (
                  <input
                    aria-label="City for this day"
                    value={day.city ?? ""}
                    placeholder="City"
                    disabled={locked}
                    maxLength={LIMITS.dayCity}
                    {...sx(s.inlineInput)}
                    onChange={(event) => patchDay({ city: event.target.value || undefined })}
                  />
                ) : (
                  (day.city ?? trip.destinations[0])
                )}
              </span>
              {summary && <span {...sx(a.small)}>{summary}</span>}
            </div>
            <TonightLine trip={trip} day={day} />
          </div>
          <DaySky
            sky={sky}
            day={day}
            now={clock === null ? null : clockMinutes(clock)}
            onStop={findStop}
            onRework={editable && !locked ? rework : undefined}
          />
        </div>
        <div {...sx(a.rowWrap)} style={{ columnGap: "0.875rem" }}>
          {day.items.length > 0 && <DayViewSwitch view={dayView} onChange={setDayView} />}
          {editable && (
            <button type="button" {...sx(a.btn, a.btnSm, s.ideasBtn)} disabled={locked} onClick={() => onAskAi()}>
              {day.items.length === 0 ? <Sparkles size={14} strokeWidth={1.75} aria-hidden /> : <Lightbulb size={14} strokeWidth={1.75} aria-hidden />}
              {day.items.length === 0 ? "Plan this day with AI" : <span>Ideas<span {...sx(s.wideOnly)}> for this day</span></span>}
            </button>
          )}
          {menu.length > 0 && (
            <Menu
              label={`More for day ${dayIndex + 1}`}
              trigger={<MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />}
              triggerStyle={[a.iconBtn, a.iconBtnSm]}
              items={menu}
            />
          )}
        </div>
      </header>

      {(notesOpen || day.notes) &&
        (editable ? (
          <textarea
            aria-label="Day notes"
            value={day.notes ?? ""}
            placeholder="Notes for the day"
            disabled={locked}
            maxLength={LIMITS.dayNotes}
            autoFocus={notesOpen && !day.notes}
            {...sx(s.notes)}
            onBlur={() => !day.notes && setNotesOpen(false)}
            onChange={(event) => patchDay({ notes: event.target.value || undefined })}
          />
        ) : (
          <p {...sx(a.body, a.wrap)} style={{ whiteSpace: "pre-wrap" }}>
            {day.notes}
          </p>
        ))}

      {day.callouts?.map((callout, i) => (
        <div key={i} {...sx(s.callout)}>
          <span aria-hidden>{callout.icon}</span>
          <p {...sx(a.wrap)} style={{ margin: 0 }}>
            {callout.body}
          </p>
        </div>
      ))}

      {enhancing && (
        <AiBusy steps={["Reading what’s already planned…", "Scouting places near your route…", "Checking they fit the day…", "Pinning the best ones…"]} onStop={onStopAi} />
      )}
      {run && !enhancing && (
        <SuggestionsReview run={run} dayOptions={dayOptions} applying={applying} onApply={onApplyRun} onDismiss={onDismissRun} />
      )}

      <p {...sx(a.srOnly)} role="status" aria-live="polite">
        {spoken}
      </p>
      <section aria-label={`Day ${dayIndex + 1} plan`}>
        {day.items.length === 0 ? (
          <div {...sx(s.emptyDay)}>
            <p {...sx(a.body, a.ink)} style={{ fontWeight: 600 }}>
              Nothing planned yet
            </p>
            <p {...sx(a.small)}>
              {editable
                ? "Search for a place below and it drops onto the map, or let AI sketch the day."
                : "Whoever’s planning hasn’t added anything to this day."}
            </p>
          </div>
        ) : dayView === "timeline" ? (
          <DayTimeline
            trip={trip}
            day={day}
            activeId={activeId}
            hotId={hotId}
            onHover={onHover}
            now={isToday ? clockIn(trip.timezone, now) : undefined}
            forecast={forecast}
            fold={{ open: foldOpen, onToggle: toggleFold }}
            onSelect={findStop}
          />
        ) : (
          <Reorder.Group
            as="ol"
            axis="y"
            values={shown}
            // The folded head keeps its place: only what is shown can be dragged.
            onReorder={(items) => !locked && patchDay({ items: [...day.items.slice(0, hidden), ...items] }, { label: `Reordered day ${dayIndex + 1}`, key: `reorder:${day.id}` })}
            onFocus={(event) => setFocused(event.target.closest<HTMLElement>("[id^='item-']")?.id.slice(5) ?? null)}
            onBlur={() => setFocused(null)}
            {...sx(s.timeline)}
          >
            {list.done && (
              <li key="done" {...sx(s.item, s.foldRow)}>
                <div {...sx(s.gutter)} style={{ paddingTop: 0 }} aria-hidden>
                  <span {...sx(s.gutterLine)} />
                </div>
                <DoneFold count={list.done.stops.length} from={list.done.from} to={list.done.to} open={foldOpen} onToggle={toggleFold} />
              </li>
            )}
            {shown.flatMap((item, at) => {
              const index = hidden + at
              return [
                ...(slot === index && nowLine ? [nowLine] : []),
                ...(list.anytimeAt === index
                  ? [
                      <li key="anytime" {...sx(s.sectionRow)}>
                        <h3 {...sx(a.eyebrow)}>Anytime</h3>
                      </li>,
                    ]
                  : []),
                <Sortable
                  key={item.id}
                  item={item}
                  trip={item.kind === "reservation" ? trip : undefined}
                  day={item.kind === "reservation" ? day : undefined}
                  dayId={day.id}
                  index={index}
                  count={day.items.length}
                  pinLabel={list.labels.get(item.id) ?? null}
                  conflict={conflicts.get(item.id) ?? null}
                  rain={alerts.get(item.id)?.rain?.text ?? null}
                  rainHeavy={alerts.get(item.id)?.rain?.heavy ?? false}
                  rainCode={alerts.get(item.id)?.rain?.spell.code ?? null}
                  past={list.past.has(item.id)}
                  lived={lived}
                  parked={parkedAt >= 0 && index > parkedAt}
                  onSaveForLater={onSaveForLater}
                  ideasFull={noRoomForIdeas}
                  leg={list.legs.get(item.id) ?? null}
                  legWet={legWet(list.legs.get(item.id))}
                  editable={editable}
                  locked={locked}
                  hot={hotId === item.id}
                  active={activeId === item.id}
                  expand={edit?.id === item.id ? edit.n : 0}
                  flash={recentIds.has(item.id)}
                  near={near}
                  dayOptions={dayOptions}
                  currency={currency}
                  onChange={onChange}
                  onDelete={removeStop}
                  onGone={leave}
                  onHover={onHover}
                  onLocate={onLocate}
                  onAnnounce={setSpoken}
                />,
              ]
            })}
            {slot === day.items.length && nowLine}
          </Reorder.Group>
        )}
      </section>

      {editable && (
        <AddStop
          near={near}
          disabled={locked}
          onInstagram={onInstagram}
          onAdd={(item) => {
            onChange((days) => addItem(days, day.id, item), { label: `Added “${item.title || "Untitled"}”` })
            onAdded(item.id)
          }}
        />
      )}

      {lived && (
        <DayJournal
          day={day}
          today={isToday}
          editable={editable}
          locked={locked}
          onChange={(journal) => patchDay({ journal })}
        />
      )}

      {confirmDelete && (
        <Modal
          open
          onClose={() => setConfirmDelete(false)}
          title={`Delete day ${dayIndex + 1}?`}
          description={deleteWords(day)}
          footer={
            <>
              <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={() => setConfirmDelete(false)}>
                Keep the day
              </button>
              <button type="button" {...sx(a.btn, a.btnDanger)} disabled={locked} onClick={removeDay}>
                Delete day
              </button>
            </>
          }
        >
          <p {...sx(a.body)}>
            The days after it move a date earlier, so the trip ends a day sooner. You can undo this straight after.
          </p>
        </Modal>
      )}

      <nav {...sx(s.pager)} aria-label="Other days">
        {prev && (
          <Link to={`${basePath}/day/${prev.id}`} rel="prev" {...sx(s.pagerLink)}>
            <span {...sx(a.eyebrow)}>
              <ArrowLeft size={11} strokeWidth={2} aria-hidden style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
              Day {dayIndex}
            </span>
            <span {...sx(a.truncate, s.dayRowTitle)}>{prev.title || formatTripDate(prev.date, trip.timezone)}</span>
          </Link>
        )}
        {next && (
          <Link to={`${basePath}/day/${next.id}`} rel="next" {...sx(s.pagerLink, s.pagerNext)}>
            <span {...sx(a.eyebrow)}>
              Day {dayIndex + 2}
              <ArrowRight size={11} strokeWidth={2} aria-hidden style={{ display: "inline", verticalAlign: "-1px", marginLeft: 4 }} />
            </span>
            <span {...sx(a.truncate, s.dayRowTitle)}>{next.title || formatTripDate(next.date, trip.timezone)}</span>
          </Link>
        )}
      </nav>
    </div>
  )
}

/** "Its 5 stops and notes go with it." */
function deleteWords(day: Pick<TripDay, "items" | "notes" | "journal">): string {
  const stops = day.items.filter((i) => i.kind !== "section").length
  const parts = [stops > 0 ? plural(stops, "stop") : null, day.notes ? "notes" : null, day.journal ? "journal" : null].filter((p): p is string => !!p)
  if (parts.length === 0) return "Everything on it goes with it."
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]
  const one = parts.length === 1 && (parts[0] === "1 stop" || parts[0] === "journal")
  return `Its ${list} ${one ? "goes" : "go"} with it.`
}

/**
 * Today's and past days: the stops the traveller loved, then what they wrote.
 * Ruled paper, not a chat box; it saves as it is typed, like the day notes.
 */
function DayJournal({
  day,
  today,
  editable,
  locked,
  onChange,
}: {
  day: TripDay
  today: boolean
  editable: boolean
  locked: boolean
  onChange: (journal: string | undefined) => void
}) {
  const headingId = `journal-${day.id}`
  const loved = day.items.filter((item) => item.highlight)
  if (!editable && !day.journal && loved.length === 0) return null
  return (
    <section {...sx(s.journal)} aria-labelledby={headingId}>
      <h3 id={headingId} {...sx(a.eyebrow)}>
        Journal
      </h3>
      {loved.length > 0 && (
        <ul {...sx(s.journalLoved)} aria-label="Loved it">
          {loved.map((item) => (
            <li key={item.id} {...sx(s.journalLovedItem)}>
              <Heart size={14} strokeWidth={2} fill="currentColor" aria-hidden {...sx(s.journalHeart)} />
              <span {...sx(a.wrap)}>{stopTitle(item)}</span>
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <textarea
          aria-labelledby={headingId}
          value={day.journal ?? ""}
          maxLength={LIMITS.journal}
          disabled={locked}
          placeholder={today ? "How is the day going? What do you want to remember?" : "What do you want to remember about this day?"}
          {...sx(s.journalText)}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      ) : (
        day.journal && <p {...sx(s.journalRead, a.wrap)}>{day.journal}</p>
      )}
    </section>
  )
}

const VIEWS = [
  { id: "list", label: "List", icon: List },
  { id: "timeline", label: "Timeline", icon: CalendarClock },
] as const

/** List or Timeline: a two-way radio group, arrow keys move between them. */
function DayViewSwitch({ view, onChange }: { view: "list" | "timeline"; onChange: (view: "list" | "timeline") => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Day layout"
      {...sx(share.segment, s.viewSwitch)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return
        // Keep the workspace's ←/→ day keys from also firing.
        event.preventDefault()
        event.stopPropagation()
        const next = view === "list" ? "timeline" : "list"
        onChange(next)
        event.currentTarget.querySelector<HTMLElement>(`[data-day-view="${next}"]`)?.focus()
      }}
    >
      {VIEWS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          data-day-view={id}
          aria-checked={view === id}
          tabIndex={view === id ? 0 : -1}
          onClick={() => onChange(id)}
          {...sx(share.segmentBtn, s.viewSwitchBtn, view === id && share.segmentOn)}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
