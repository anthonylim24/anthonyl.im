import { memo, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { isToSchedule, TO_SCHEDULE } from "../map/geo"
import {
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CloudRain,
  CopyPlus,
  GripVertical,
  Heart,
  ListPlus,
  MoreHorizontal,
  SkipForward,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { sx } from "@/styles/merge"
import { formatClock, STATUS_LABEL, titleCase } from "../meta"
import type { LngLat } from "../map/geo"
import { LIMITS } from "../limits"
import { toggledStatus, unparkDay } from "../tripEdits"
import { Menu, type MenuItem } from "../components/kit"
import { Presence } from "../components/presence"
import { clockMinutes, clockRange } from "../timeline/timeline"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { bookingTypeLabel } from "../bookings/kinds"
import { shownStatus } from "../bookings/status"
import type { DayOption } from "../useTripEditor"
import type { UndoMark } from "../editorMachine"
import { scrollBehavior } from "./scroll"
import { useFitHeight } from "./fitHeight"
import { composing } from "../ime"
import type { ConflictAlert } from "./stopAlerts"
import { StopRef } from "../timeline/StopRef"
import type { StartSuggestion } from "../timeline/suggestStart"
import { Parts } from "./Parts"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { ItemIcon } from "../ItemIcon"
import { weatherKind } from "../forecast"
import { StopActions, StopDayPicker, StopDetails, StopEditor } from "./StopEditor"
import { stopEdits, type EditorSurface } from "./stopEdits"

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
  /** Its editor (a viewer: its details) is open under the card. */
  open: boolean
  /** Where its editor opens: under the card, or in a sheet the day draws. */
  surface: EditorSurface
  /** Opens its editor, or closes it when it is the one open. */
  onToggle: (id: string) => void
  flash: boolean
  near: LngLat | null
  dayOptions: DayOption[]
  /** Currency a new cost starts in (the trip's budget, else its local money). */
  currency: string
  /** When its editor is open and it has no time: a start read off the day (`suggestStart`). */
  startAt?: StartSuggestion | null
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

function firstLine(text?: string): string {
  return (text ?? "").split("\n").find((line) => line.trim().length > 0)?.trim() ?? ""
}

/** A heading's words, wrapping onto a second line on a phone rather than cut off. One line of text: Enter adds none. */
function HeadingField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useFitHeight(ref, value)
  return (
    <textarea
      ref={ref}
      aria-label="Heading"
      data-card-row=""
      rows={1}
      value={value}
      placeholder="Heading"
      maxLength={LIMITS.itemTitle}
      disabled={disabled}
      {...sx(s.sectionInput)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !composing(event)) event.preventDefault()
      }}
      onChange={(event) => onChange(event.target.value.replace(/\s*\n\s*/g, " "))}
    />
  )
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
  open,
  surface,
  onToggle,
  flash,
  near,
  dayOptions,
  currency,
  startAt = null,
  onChange,
  onDelete,
  onHover,
  onLocate,
  onGrip,
  onAnnounce,
  onGone,
}: ItemCardProps) {
  // The day sheet open from the card's menu: send the stop to one day, or copies of it to several.
  const [picking, setPicking] = useState<"move" | "copy" | null>(null)
  const panelId = useId()
  const rowRef = useRef<HTMLDivElement>(null)
  const edits = stopEdits({ item, dayId, index, count, dayOptions, parked, onChange, onAnnounce, onGone })
  const { patch } = edits
  const canEdit = editable && !locked
  const RainIcon = rainCode === null ? CloudRain : weatherKind(rainCode).icon
  const inline = surface === "inline"
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
      ? [
          { label: "Move to another day…", icon: <CalendarDays size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setPicking("move") },
          { label: "Copy to other days…", icon: <CopyPlus size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => setPicking("copy") },
        ]
      : []),
    ...(onSaveForLater && isStop
      ? [
          {
            label: ideasFull ? "Save for later (wishlist is full)" : "Save for later",
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
          <HeadingField value={item.title} disabled={locked} onChange={(title) => patch({ title })} />
        ) : (
          <h3 {...sx(a.eyebrow, a.grow, a.wrap)}>{item.title}</h3>
        )}
        {item.time && <span {...sx(a.mono, a.muted, s.sectionTime)}>{formatClock(item.time)}</span>}
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
  // Where Done / Skip / Loved it are on the card, the chip and the heart would only say it twice.
  const status = shownStatus(item)
  const chip = status.status === "none" || (quick && (status.status === "completed" || status.status === "skipped")) ? null : status.label
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
            aria-expanded={inline ? open : undefined}
            aria-controls={inline && open ? panelId : undefined}
            aria-haspopup={inline ? undefined : "dialog"}
            aria-keyshortcuts={editable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
            onClick={() => onToggle(item.id)}
            onKeyDown={(event) => {
              if (!editable || locked || !event.altKey) return
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
              event.preventDefault()
              edits.move(event.key === "ArrowUp" ? -1 : 1)
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
              {(category || sub || chip || lovedMark) && (
                <span {...sx(s.cardSub)}>
                  {category && <span>{category}</span>}
                  {chip && <span {...sx(a.chip, a.chipOutline, a.chipMono, s.cardStatus)}>{chip}</span>}
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
            {inline ? (
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden {...sx(s.chevron, open && s.chevronOpen)} />
            ) : (
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden {...sx(s.chevron)} />
            )}
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

        <Presence when={picking}>
          {(mode) => <StopDayPicker mode={mode} item={item} dayId={dayId} dayOptions={dayOptions} edits={edits} onClose={() => setPicking(null)} />}
        </Presence>

        {open && (
          <div id={panelId} {...sx(s.editor)}>
            {editable ? (
              <>
                <StopEditor item={item} trip={trip} day={day} locked={locked} near={near} currency={currency} edits={edits} startAt={startAt} />
                <StopActions
                  item={item}
                  dayId={dayId}
                  index={index}
                  count={count}
                  dayOptions={dayOptions}
                  locked={locked}
                  surface="inline"
                  edits={edits}
                  onDelete={() => onDelete(dayId, item, index)}
                />
              </>
            ) : (
              <StopDetails item={item} trip={trip} day={day} />
            )}
          </div>
        )}
      </div>
    </div>
  )
})
