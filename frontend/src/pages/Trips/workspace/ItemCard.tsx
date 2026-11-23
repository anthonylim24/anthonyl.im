import { memo, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { isToSchedule, TO_SCHEDULE } from "../map/geo"
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  CloudRain,
  Copy,
  ExternalLink,
  GripVertical,
  Heart,
  ListPlus,
  MapPin,
  MapPinOff,
  MoreHorizontal,
  SkipForward,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react"
import { sx } from "@/styles/merge"
import { externalMapsLink } from "@/lib/externalMaps"
import { formatClock, parseClock, STATUS_LABEL, titleCase } from "../meta"
import type { LngLat } from "../map/geo"
import { LIMITS } from "../limits"
import { duplicateItem, moveItem, moveItemToDay, setItemTime, toggledStatus, unparkDay, updateItem } from "../tripEdits"
import { Menu, type MenuItem } from "../components/kit"
import { Presence } from "../components/presence"
import { DayPicker } from "./DayPicker"
import { composing } from "../ime"
import { normalizeLink, stopLink, withLink } from "./stopLinks"
import { LinkChip } from "./LinkChip"
import { clockMinutes, clockRange } from "../timeline/timeline"
import { CostField } from "../budget/CostField"
import type { ItemStatus, ItineraryItem, Trip, TripDay } from "../types"
import { BookingFields } from "./BookingFields"
import { BookingSummary } from "../bookings/BookingSummary"
import { bookingTypeLabel } from "../bookings/kinds"
import type { DayOption } from "../useTripEditor"
import type { UndoMark } from "../editorMachine"
import { scrollBehavior } from "./scroll"
import type { ConflictAlert } from "./stopAlerts"
import { StopRef } from "../timeline/StopRef"
import { Parts } from "./Parts"
import { a } from "../atlas.stylex"
import { Select } from "../components/Select"
import { ws as s } from "../workspace.stylex"
import { usePlaceSearch } from "./AddStop"
import { ItemIcon } from "../ItemIcon"
import { weatherKind } from "../forecast"

/** A clash with an earlier stop, and that stop's map number (else its title) to name it by: "Overlaps ②". */
export type CardConflict = ConflictAlert & { otherNumber: number | null; otherTitle: string }

export interface ItemCardProps {
  item: ItineraryItem
  /** The trip and day, passed for bookings only (their editor and read lines need them). */
  trip?: Trip
  day?: TripDay
  dayId: string
  index: number
  count: number
  /** Number shown on the map pin, when the item has coordinates. */
  pinLabel: string | null
  /** This stop collides with an earlier one (`stopAlerts`). */
  conflict: CardConflict | null
  /** "Showers until 5 PM · 60%": rain is likely while it is on. */
  rain: string | null
  /** The rain is 70% likely or more, or a storm. */
  rainHeavy: boolean
  /** The WMO code of what falls: its glyph, the same as the timeline's. */
  rainCode: number | null
  /** Over by now (today only): set back in secondary ink. */
  past: boolean
  /** The day is today or already over: Done, Skip and Loved it show on the card. */
  lived: boolean
  /** Parked under "To schedule": giving it a time puts it on the route. */
  parked: boolean
  /** Takes the stop off its day into the trip's ideas; absent where that can't be done. */
  onSaveForLater?: (dayId: string, item: ItineraryItem, index: number) => void
  /** The ideas list is at its limit. */
  ideasFull?: boolean
  editable: boolean
  locked: boolean
  hot: boolean
  active: boolean
  /** Open the editor (requested from the map). Non-zero, and new for each request. */
  expand?: number
  flash: boolean
  near: LngLat | null
  dayOptions: DayOption[]
  /** Currency a new cost starts in (the trip's budget, else its local money). */
  currency: string
  onChange: (fn: (days: TripDay[]) => TripDay[], undo?: UndoMark) => void
  onDelete: (dayId: string, item: ItineraryItem, index: number) => void
  /** The item left this day (moved to another): the list moves focus on. */
  onGone?: (index: number) => void
  onHover: (id: string | null) => void
  onLocate: (id: string) => void
  onGrip?: (event: ReactPointerEvent) => void
  /** Spoken confirmation after a keyboard reorder. */
  onAnnounce?: (message: string) => void
}

const STATUSES: ItemStatus[] = ["none", "booked", "optional", "needs_review", "completed", "skipped"]

function firstLine(text?: string): string {
  return (text ?? "").split("\n").find((line) => line.trim().length > 0)?.trim() ?? ""
}

/** A two-state button on the card: Done, Skip, Loved it. */
function QuickToggle({ on, icon: Icon, label, disabled, onPress }: { on: boolean; icon: LucideIcon; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} {...sx(s.quickBtn, on && s.quickOn)} onClick={onPress}>
      <Icon size={13} strokeWidth={2} aria-hidden fill={on && Icon === Heart ? "currentColor" : "none"} />
      {label}
    </button>
  )
}

export const ItemCard = memo(function ItemCard({
  item,
  trip,
  day,
  dayId,
  index,
  count,
  pinLabel,
  conflict,
  rain,
  rainHeavy,
  rainCode,
  past,
  lived,
  parked,
  onSaveForLater,
  ideasFull = false,
  editable,
  locked,
  hot,
  active,
  expand,
  flash,
  near,
  dayOptions,
  currency,
  onChange,
  onDelete,
  onHover,
  onLocate,
  onGrip,
  onAnnounce,
  onGone,
}: ItemCardProps) {
  // A just-added, untitled item opens ready to type; later edits must not
  // re-open a card the user closed, so this is decided once, on mount.
  const [open, setOpen] = useState(() => !!expand || (editable && !item.title && item.kind !== "section"))
  // Each new `expand` request opens the card (adjusted during render, not in an effect).
  const [seenExpand, setSeenExpand] = useState(expand)
  if (expand !== seenExpand) {
    setSeenExpand(expand)
    if (expand) setOpen(true)
  }
  const [endOpen, setEndOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const panelId = useId()
  const rowRef = useRef<HTMLDivElement>(null)
  const patch = (p: Partial<Omit<ItineraryItem, "id">>) => onChange((days) => updateItem(days, dayId, item.id, p))
  const canEdit = editable && !locked
  const RainIcon = rainCode === null ? CloudRain : weatherKind(rainCode).icon
  const name = `“${item.title || "Untitled"}”`
  const move = (step: -1 | 1) => onChange((days) => moveItem(days, dayId, item.id, step), { label: `Moved ${name}`, key: `move:${item.id}` })
  const moveTo = (to: string) => {
    const label = dayOptions.find((option) => option.id === to)?.label.split(" · ")[0] ?? "another day"
    onChange((days) => moveItemToDay(days, dayId, item.id, to), { label: `Moved ${name} to ${label}`, toast: true })
    onGone?.(index)
  }
  const setTime = (time: string | undefined) => {
    onChange((days) => setItemTime(days, dayId, item.id, time))
    if (parked && time) onAnnounce?.(`${item.title || "Stop"} is on the route at ${formatClock(time)}.`)
  }
  const isStop = item.kind === "place" || item.kind === "reservation"
  const skipped = item.status === "skipped"
  // How the day went is marked on its stops once the day has come (held, not hidden, during an AI run).
  const quick = editable && lived && isStop
  const setStatus = (status: "completed" | "skipped") => {
    const next = toggledStatus(item, status)
    patch({ status: next })
    onAnnounce?.(`${item.title || "Stop"}: ${next === status ? STATUS_LABEL[status].toLowerCase() : "back on the plan"}.`)
  }
  const cardMenu: MenuItem[] = [
    ...(dayOptions.length > 1
      ? [{ label: "Move to another day…", icon: <CalendarDays size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setPicking(true) }]
      : []),
    ...(onSaveForLater && isStop
      ? [
          {
            label: ideasFull ? "Save for later (ideas list is full)" : "Save for later",
            icon: <Bookmark size={16} strokeWidth={1.75} aria-hidden />,
            disabled: ideasFull,
            onSelect: () => onSaveForLater(dayId, item, index),
          },
        ]
      : []),
  ]

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() })
  }, [active])

  useEffect(() => {
    if (expand) rowRef.current?.scrollIntoView({ block: "center", behavior: scrollBehavior() })
  }, [expand])

  // "To schedule" is the planner's own divider: a plain header, not a row to edit.
  if (isToSchedule(item)) {
    return (
      <div {...sx(s.sectionRow, s.parkHead)} id={`item-${item.id}`}>
        <h3 {...sx(a.eyebrow, s.parkTitle)}>{TO_SCHEDULE}</h3>
        {canEdit && (
          <button
            type="button"
            data-card-row=""
            {...sx(a.btn, a.btnGhost, a.btnSm)}
            onClick={() => {
              onChange((days) => unparkDay(days, dayId), { label: "Added the places to schedule to the route", toast: true })
              onGone?.(index)
              onAnnounce?.("The places to schedule are on the route now.")
            }}
          >
            <ListPlus size={14} strokeWidth={1.75} aria-hidden />
            Add all to route
          </button>
        )}
        {editable && <span {...sx(a.small, s.parkHint)}>Give one a time, or drag it up, to add it to the route</span>}
      </div>
    )
  }
  if (item.kind === "section") {
    return (
      <div {...sx(s.sectionRow, "trips-section-row")} id={`item-${item.id}`}>
        {editable && onGrip && (
          <button type="button" {...sx(s.grip, "trips-grip")} aria-label="Drag to reorder" onPointerDown={onGrip} tabIndex={-1}>
            <GripVertical size={14} aria-hidden />
          </button>
        )}
        {editable ? (
          <input
            aria-label="Heading"
            data-card-row=""
            value={item.title}
            placeholder="Heading"
            maxLength={LIMITS.itemTitle}
            disabled={locked}
            {...sx(s.sectionInput)}
            onChange={(event) => patch({ title: event.target.value })}
          />
        ) : (
          <h3 {...sx(a.eyebrow, a.grow)}>{item.title}</h3>
        )}
        {item.time && <span {...sx(a.mono, a.muted)}>{formatClock(item.time)}</span>}
        {canEdit && (
          <button
            type="button"
            {...sx(a.iconBtn, a.iconBtnSm, "trips-row-action")}
            aria-label={`Delete heading ${item.title || ""}`}
            onClick={() => onDelete(dayId, item, index)}
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
    )
  }

  const pinned = pinLabel !== null
  const [start, end] = [clockMinutes(item.time), clockMinutes(item.endTime)]
  const sub = item.location?.address || firstLine(item.notes)
  const category = item.kind === "reservation" ? bookingTypeLabel(item.reservation?.type) : item.location?.category ? titleCase(item.location.category) : null
  const maps = pinned || item.location?.address ? externalMapsLink({ name: item.location?.name ?? item.title, address: item.location?.address, lat: item.location?.lat, lng: item.location?.lng }) : null
  const links = (item.links ?? []).map(stopLink).filter((link): link is NonNullable<typeof link> => link !== null)
  // Where Done / Skip / Loved it are on the card, the chip and the heart would only say it twice.
  const shownStatus = item.status === "none" || (quick && (item.status === "completed" || item.status === "skipped")) ? null : item.status
  const lovedMark = !!item.highlight && !quick

  return (
    <div {...sx(s.item)} id={`item-${item.id}`} ref={rowRef}>
      <div {...sx(s.gutter)}>
        <span {...sx(s.gutterLine)} aria-hidden />
        {pinned ? (
          <button
            type="button"
            {...sx(s.marker, s.markerPinned, past && s.markerPast, active && s.markerActive)}
            aria-label={`Show ${item.title || "this stop"} on the map`}
            onClick={() => onLocate(item.id)}
          >
            {pinLabel}
          </button>
        ) : (
          <span {...sx(s.marker)} aria-hidden>
            <ItemIcon kind={item.kind} category={item.location?.category} reservationType={item.reservation?.type} size={13} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div
        {...sx(s.card, "trips-card", item.kind === "note" && s.cardNote, (hot || active) && s.cardHot, flash && s.cardFlash)}
        onMouseEnter={() => pinned && onHover(item.id)}
        onMouseLeave={() => pinned && onHover(null)}
      >
        <div {...sx(s.cardHead)}>
          <button
            type="button"
            {...sx(s.cardRow, s.cardHeadRow)}
            data-card-row=""
            aria-expanded={open}
            aria-controls={panelId}
            aria-keyshortcuts={editable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
            onClick={() => setOpen((v) => !v)}
            onKeyDown={(event) => {
              if (!editable || locked || !event.altKey) return
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
              event.preventDefault()
              const step = event.key === "ArrowUp" ? -1 : 1
              if (index + step < 0 || index + step >= count) return
              move(step)
              onAnnounce?.(`${item.title || "Stop"} moved ${step < 0 ? "up" : "down"}, now ${index + step + 1} of ${count}.`)
            }}
          >
            {/* Empty for an Anytime stop, so every title keeps one indent. */}
            <span {...sx(s.cardTimeCol)}>
              {item.time && (
                <>
                  <span {...sx(s.cardTime, past && s.cardTimePast, skipped && s.cardTimeSkipped)}>{formatClock(item.time)}</span>
                  {item.endTime && <span {...sx(s.cardTimeEnd)}>{formatClock(item.endTime)}</span>}
                </>
              )}
            </span>
            <span {...sx(s.cardText)}>
              {item.time && (
                <span {...sx(s.cardTimeTop, skipped && s.cardTimeSkipped)}>
                  {start !== null && end !== null && end !== start ? clockRange(start, end) : formatClock(item.time)}
                </span>
              )}
              <span {...sx(s.cardTitle, a.wrap, past && s.cardTitlePast, !item.title && s.cardTitleEmpty, skipped && s.cardTitleSkipped)}>
                {item.title || (item.kind === "note" ? "Empty note" : "Untitled stop")}
              </span>
              {(category || sub || shownStatus || lovedMark) && (
                <span {...sx(s.cardSub)}>
                  {category && <span>{category}</span>}
                  {shownStatus && <span {...sx(a.chip, a.chipOutline, a.chipMono, s.cardStatus)}>{STATUS_LABEL[shownStatus]}</span>}
                  {lovedMark && (
                    <span {...sx(s.loved)}>
                      <Heart size={12} strokeWidth={2} fill="currentColor" aria-hidden />
                      Loved it
                    </span>
                  )}
                  {sub && (
                    <span {...sx(a.truncate)} style={{ flexBasis: "100%" }}>
                      {sub}
                    </span>
                  )}
                </span>
              )}
              {conflict && (
                <span {...sx(s.cardAlert)}>
                  <TriangleAlert size={12} strokeWidth={2} aria-hidden {...sx(s.cardAlertIcon)} />
                  <span {...sx(a.wrap)}>
                    <Parts
                      parts={[
                        <>
                          {conflict.kind === "overlap" ? "Overlaps" : "Tight after"} <StopRef number={conflict.otherNumber} title={conflict.otherTitle} />
                        </>,
                        conflict.detail,
                        conflict.more > 0 && `+${conflict.more}`,
                      ]}
                    />
                  </span>
                </span>
              )}
              {rain && (
                <span {...sx(s.cardAlert, s.cardRain, rainHeavy && s.cardRainHeavy)}>
                  <RainIcon size={12} strokeWidth={1.75} aria-hidden {...sx(s.cardAlertIcon)} />
                  <span {...sx(a.wrap)}>
                    <Parts parts={rain.split(" · ")} />
                  </span>
                </span>
              )}
            </span>
            {editable && onGrip && (
              <span
                {...sx(s.grip, s.gripRow, "trips-grip")}
                role="presentation"
                title="Drag to reorder (or Alt + ↑ / ↓)"
                onPointerDown={(event) => {
                  event.stopPropagation()
                  onGrip(event)
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <GripVertical size={14} aria-hidden />
              </span>
            )}
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden {...sx(s.chevron, open && s.chevronOpen)} />
          </button>
          {canEdit && cardMenu.length > 0 && (
            <Menu
              label={`More for ${item.title.trim() || "this stop"}`}
              trigger={<MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />}
              triggerStyle={[a.iconBtn, a.iconBtnSm, s.cardMore]}
              items={cardMenu}
            />
          )}
        </div>

        {quick && (
          <div {...sx(s.cardFoot, s.quick)} role="group" aria-label={`How ${item.title || "this stop"} went`}>
            <QuickToggle on={item.status === "completed"} icon={Check} label="Done" disabled={locked} onPress={() => setStatus("completed")} />
            <QuickToggle on={skipped} icon={SkipForward} label="Skip" disabled={locked} onPress={() => setStatus("skipped")} />
            <QuickToggle
              on={!!item.highlight}
              icon={Heart}
              label="Loved it"
              disabled={locked}
              onPress={() => patch({ highlight: item.highlight ? undefined : true })}
            />
          </div>
        )}

        <Presence when={picking}>{() => (
          <DayPicker
            title={`Move ${name}`}
            description="It goes last on that day’s route."
            choices={dayOptions.map((option) => ({ id: option.id, label: option.label, off: option.id === dayId ? "This day" : undefined }))}
            onPick={moveTo}
            onClose={() => setPicking(false)}
          />
        )}</Presence>

        {open && (
          <div id={panelId} {...sx(s.editor)}>
            {editable ? (
              <>
                <label {...sx(s.span2)}>
                  <span {...sx(s.miniLabel)}>{item.kind === "note" ? "Note" : "Name"}</span>
                  <input
                    value={item.title}
                    disabled={locked}
                    placeholder={item.kind === "note" ? "What to remember" : "Name this stop"}
                    autoFocus={!item.title}
                    maxLength={LIMITS.itemTitle}
                    {...sx(a.field)}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                </label>
                {item.kind !== "reservation" && (
                  <>
                <TimeField label="Starts" value={item.time} disabled={locked} onChange={setTime} />
                {item.endTime || endOpen ? (
                  <TimeField
                    label="Ends"
                    value={item.endTime}
                    disabled={locked}
                    autoFocus={endOpen && !item.endTime}
                    onChange={(endTime) => {
                      patch({ endTime })
                      if (!endTime) setEndOpen(false)
                    }}
                  />
                ) : (
                  <div {...sx(s.addEnd)}>
                    <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} disabled={locked} onClick={() => setEndOpen(true)}>
                      Add end time
                    </button>
                  </div>
                )}
                  </>
                )}
                {item.kind !== "note" && (
                  <div {...sx(s.span2)}>
                    <span {...sx(s.miniLabel)}>Location</span>
                    <LocationField item={item} near={near} locked={locked} onChange={patch} />
                  </div>
                )}
                {item.kind === "reservation" && trip && day && (
                  <BookingFields item={item} trip={trip} day={day} disabled={locked} onChange={patch} />
                )}
                <label {...sx(s.span2)}>
                  <span {...sx(s.miniLabel)}>Notes</span>
                  <textarea
                    value={item.notes ?? ""}
                    disabled={locked}
                    rows={2}
                    maxLength={LIMITS.notes}
                    placeholder="Opening hours, what to order, who recommended it…"
                    {...sx(a.field, a.textarea)}
                    onChange={(event) => patch({ notes: event.target.value || undefined })}
                  />
                </label>
                <LinksField links={item.links} disabled={locked} onChange={(links) => patch({ links: links.length > 0 ? links : undefined })} />
                {item.kind !== "note" && (
                  <label>
                    <span {...sx(s.miniLabel)}>Status</span>
                    <Select
                      label="Status"
                      value={item.status}
                      disabled={locked}
                      options={STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
                      onChange={(status) => patch({ status })}
                    />
                  </label>
                )}
                {item.kind !== "note" && (
                  <CostField value={item.cost} defaultCurrency={currency} disabled={locked} onChange={(cost) => patch({ cost })} />
                )}
                {dayOptions.length > 1 && (
                  <label>
                    <span {...sx(s.miniLabel)}>Day</span>
                    <Select
                      label="Day"
                      value={dayId}
                      disabled={locked}
                      options={dayOptions.map((option) => ({ value: option.id, label: option.label }))}
                      onChange={moveTo}
                    />
                  </label>
                )}
                <div {...sx(s.editorActions)}>
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    aria-label="Move up"
                    disabled={locked || index === 0}
                    onClick={() => move(-1)}
                  >
                    <ArrowUp size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    aria-label="Move down"
                    disabled={locked || index === count - 1}
                    onClick={() => move(1)}
                  >
                    <ArrowDown size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    aria-label="Duplicate"
                    disabled={locked}
                    onClick={() => onChange((days) => duplicateItem(days, dayId, item.id), { label: `Duplicated ${name}` })}
                  >
                    <Copy size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  {maps && (
                    <a href={maps.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnGhost, a.btnSm)}>
                      <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                      {maps.label}
                    </a>
                  )}
                  <span {...sx(a.grow)} />
                  <button
                    type="button"
                    {...sx(a.btn, a.btnGhost, a.btnSm)}
                    disabled={locked}
                    onClick={() => onDelete(dayId, item, index)}
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden />
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <div {...sx(s.span2, a.stack)}>
                {item.location?.address && <p {...sx(a.small, a.wrap)}>{item.location.address}</p>}
                {item.notes && <p {...sx(a.body, a.wrap)} style={{ whiteSpace: "pre-wrap" }}>{item.notes}</p>}
                {item.kind === "reservation" && trip && day ? (
                  <BookingSummary item={item} trip={trip} day={day} />
                ) : (
                  item.reservation?.confirmation && <p {...sx(a.mono)}>Confirmation {item.reservation.confirmation}</p>
                )}
                {maps && (
                  <a href={maps.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnSecondary, a.btnSm)} style={{ alignSelf: "flex-start" }}>
                    <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                    {maps.label}
                  </a>
                )}
                {links.length > 0 && (
                  <ul {...sx(s.links)} aria-label="Links">
                    {links.map((link) => (
                      <li key={link.href} style={{ minWidth: 0, maxWidth: "100%" }}>
                        <LinkChip link={link} />
                      </li>
                    ))}
                  </ul>
                )}
                {!item.location?.address && !item.notes && !maps && links.length === 0 && <p {...sx(a.small)}>No details yet.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

/** Type a time the way you'd say it ("8:30a", "2 pm", "14:00"); it tidies itself on blur. */
function TimeField({
  label,
  value,
  disabled,
  autoFocus,
  onChange,
}: {
  label: string
  value: string | undefined
  disabled?: boolean
  autoFocus?: boolean
  onChange: (value: string | undefined) => void
}) {
  const id = useId()
  const [text, setText] = useState(() => formatClock(value))
  const [bad, setBad] = useState(false)
  // A new value from outside (undo, another editor) replaces the draft.
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    setText(formatClock(value))
    setBad(false)
  }
  const commit = () => {
    if (!text.trim()) {
      setBad(false)
      if (value) onChange(undefined)
      return
    }
    const parsed = parseClock(text)
    if (!parsed) {
      setBad(true)
      return
    }
    setBad(false)
    setText(formatClock(parsed))
    if (parsed !== value) onChange(parsed)
  }
  return (
    <div>
      <label htmlFor={id} {...sx(s.miniLabel)}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder="e.g. 9:30 AM"
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-error` : undefined}
        {...sx(a.field)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !composing(event)) {
            event.preventDefault()
            commit()
          }
        }}
      />
      {bad && (
        <span id={`${id}-error`} {...sx(a.errorText)} role="alert" style={{ display: "block" }}>
          Try a time like 9:30 AM or 14:00.
        </span>
      )}
    </div>
  )
}

function LocationField({
  item,
  near,
  locked,
  onChange,
}: {
  item: ItineraryItem
  near: LngLat | null
  locked: boolean
  onChange: (patch: Partial<Omit<ItineraryItem, "id">>) => void
}) {
  const pinned = typeof item.location?.lat === "number" && typeof item.location?.lng === "number"
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const { results, loading } = usePlaceSearch(searching ? query : "", near)

  if (pinned && !searching) {
    return (
      <div {...sx(s.pinnedBox)}>
        <MapPin size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, s.tripText)} />
        <span {...sx(a.grow, a.wrap)}>{item.location?.address || item.location?.name || "Pinned on the map"}</span>
        <button
          type="button"
          {...sx(a.btn, a.btnGhost, a.btnSm)}
          disabled={locked}
          onClick={() => {
            setQuery(item.location?.name ?? item.title)
            setSearching(true)
          }}
        >
          Change
        </button>
        <button
          type="button"
          {...sx(a.iconBtn, a.iconBtnSm)}
          aria-label="Remove pin"
          disabled={locked}
          onClick={() =>
            onChange({ location: { name: item.location?.name ?? item.title, source: item.location?.source ?? "user" } })
          }
        >
          <MapPinOff size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div {...sx(a.stack)} style={{ gap: "0.375rem" }}>
      <input
        value={searching ? query : ""}
        disabled={locked}
        placeholder={pinned ? "Search for a different place" : "Search to pin this on the map"}
        aria-label="Search for a place to pin"
        maxLength={LIMITS.locationName}
        {...sx(a.field)}
        onFocus={() => {
          if (!searching) {
            setQuery(item.location?.name || item.title)
            setSearching(true)
          }
        }}
        onChange={(event) => {
          setSearching(true)
          setQuery(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && searching) {
            event.stopPropagation()
            setSearching(false)
          }
        }}
      />
      {searching && (loading || results.length > 0 || query.trim().length >= 2) && (
        <ul {...sx(a.stack)} style={{ gap: 0, listStyle: "none", margin: 0, padding: 0 }} aria-label="Matching places">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                {...sx(s.result)}
                onClick={() => {
                  onChange({
                    title: item.title || place.name,
                    location: {
                      name: place.name,
                      address: place.address,
                      lat: place.lat,
                      lng: place.lng,
                      category: place.category ?? item.location?.category,
                      ...(place.placeId ? { placeId: place.placeId } : {}),
                      source: "user",
                      confidence: "high",
                    },
                  })
                  setSearching(false)
                }}
              >
                <MapPin size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.accentText)} />
                <span {...sx(a.grow)}>
                  <span {...sx(a.wrap)}>{place.name}</span>
                  {place.context && <span {...sx(a.small, a.truncate)} style={{ display: "block" }}>{place.context}</span>}
                </span>
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <li {...sx(a.small)} style={{ padding: "0.375rem 0.625rem" }}>
              No places match. Try a more specific name or add the city.
            </li>
          )}
          {loading && results.length === 0 && (
            <li {...sx(a.small)} style={{ padding: "0.375rem 0.625rem" }}>
              Searching…
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** The stop's links: each by its site with a remove button, then a field to paste another. */
function LinksField({ links, disabled, onChange }: { links: string[] | undefined; disabled: boolean; onChange: (links: string[]) => void }) {
  const id = useId()
  const [draft, setDraft] = useState("")
  const [bad, setBad] = useState(false)
  const saved = links ?? []
  const full = saved.length >= LIMITS.links
  const add = () => {
    if (!draft.trim()) return
    const link = normalizeLink(draft)
    if (!link) {
      setBad(true)
      return
    }
    setBad(false)
    setDraft("")
    onChange(withLink(saved, link))
  }
  return (
    <div {...sx(s.span2, a.stack)} style={{ gap: "0.375rem" }}>
      <label htmlFor={id} {...sx(s.miniLabel)} style={{ marginBottom: 0 }}>
        Links
      </label>
      {saved.length > 0 && (
        <ul {...sx(s.links)} aria-label="Links">
          {saved.map((raw) => {
            const link = stopLink(raw)
            return (
              <li key={raw} {...sx(s.linkRow)}>
                {link ? <LinkChip link={link} /> : <span {...sx(a.small, s.linkText)} title={raw}>{raw}</span>}
                <button
                  type="button"
                  {...sx(a.iconBtn, a.iconBtnSm)}
                  aria-label={`Remove link ${link?.label ?? raw}`}
                  disabled={disabled}
                  onClick={() => onChange(saved.filter((other) => other !== raw))}
                >
                  <X size={14} strokeWidth={1.75} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div {...sx(s.linkAdd)}>
        <input
          id={id}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={draft}
          disabled={disabled || full}
          maxLength={LIMITS.link}
          placeholder={full ? `${LIMITS.links} links is the most a stop holds` : "Paste a link"}
          aria-invalid={bad || undefined}
          aria-describedby={bad ? `${id}-error` : undefined}
          {...sx(a.field)}
          onChange={(event) => {
            setDraft(event.target.value)
            setBad(false)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !composing(event)) {
              event.preventDefault()
              add()
            }
          }}
        />
        <button type="button" {...sx(a.btn, a.btnSecondary)} disabled={disabled || full || !draft.trim()} onClick={add}>
          Add
        </button>
      </div>
      {bad && (
        <span id={`${id}-error`} {...sx(a.errorText)} role="alert" style={{ marginTop: 0 }}>
          That isn’t a web link. Paste one that starts with https://.
        </span>
      )}
    </div>
  )
}
