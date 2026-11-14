import { memo, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { isToSchedule, TO_SCHEDULE } from "../map/geo"
import { ArrowDown, ArrowUp, ChevronDown, Copy, ExternalLink, GripVertical, MapPin, MapPinOff, Trash2 } from "lucide-react"
import { sx } from "@/styles/merge"
import { externalMapsLink } from "@/lib/externalMaps"
import { formatClock, itemIcon, parseClock, RESERVATION_TYPES, STATUS_LABEL, titleCase } from "../meta"
import type { LngLat } from "../map/geo"
import { duplicateItem, moveItem, moveItemToDay, updateItem } from "../tripEdits"
import type { ItemStatus, ItineraryItem, TripDay } from "../types"
import type { DayOption } from "../useTripEditor"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { usePlaceSearch } from "./AddStop"

export interface ItemCardProps {
  item: ItineraryItem
  dayId: string
  index: number
  count: number
  /** Number shown on the map pin, when the item has coordinates. */
  pinLabel: string | null
  editable: boolean
  locked: boolean
  hot: boolean
  active: boolean
  /** Open the editor (requested from the map). Non-zero, and new for each request. */
  expand?: number
  flash: boolean
  near: LngLat | null
  dayOptions: DayOption[]
  onChange: (fn: (days: TripDay[]) => TripDay[]) => void
  onDelete: (dayId: string, item: ItineraryItem, index: number) => void
  onHover: (id: string | null) => void
  onLocate: (id: string) => void
  onGrip?: (event: ReactPointerEvent) => void
  /** Spoken confirmation after a keyboard reorder. */
  onAnnounce?: (message: string) => void
}

const STATUSES: ItemStatus[] = ["none", "booked", "optional", "needs_review", "completed"]

function firstLine(text?: string): string {
  return (text ?? "").split("\n").find((line) => line.trim().length > 0)?.trim() ?? ""
}

export const ItemCard = memo(function ItemCard({
  item,
  dayId,
  index,
  count,
  pinLabel,
  editable,
  locked,
  hot,
  active,
  expand,
  flash,
  near,
  dayOptions,
  onChange,
  onDelete,
  onHover,
  onLocate,
  onGrip,
  onAnnounce,
}: ItemCardProps) {
  const [open, setOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const panelId = useId()
  const rowRef = useRef<HTMLDivElement>(null)
  const patch = (p: Partial<Omit<ItineraryItem, "id">>) => onChange((days) => updateItem(days, dayId, item.id, p))
  const canEdit = editable && !locked

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [active])

  useEffect(() => {
    if (!expand) return
    setOpen(true)
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [expand])

  // A just-added, untitled item opens ready to type.
  useEffect(() => {
    if (editable && !item.title && item.kind !== "section") setOpen(true)
    // Only on mount: later edits must not re-open a card the user closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "To schedule" is the planner's own divider: a plain header, not a row to edit.
  if (isToSchedule(item)) {
    return (
      <div {...sx(s.sectionRow, s.parkHead)} id={`item-${item.id}`}>
        <h3 {...sx(a.eyebrow, s.parkTitle)}>{TO_SCHEDULE}</h3>
        <span {...sx(a.small, s.parkHint)}>Give one a time, or drag it up, to add it to the route</span>
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
            value={item.title}
            placeholder="Heading"
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

  const Icon = itemIcon(item.kind, item.location?.category, item.reservation?.type)
  const pinned = pinLabel !== null
  const sub = item.location?.address || firstLine(item.notes)
  const category = item.kind === "reservation" ? titleCase(item.reservation?.type ?? "Booking") : item.location?.category ? titleCase(item.location.category) : null
  const maps = pinned || item.location?.address ? externalMapsLink({ name: item.location?.name ?? item.title, address: item.location?.address, lat: item.location?.lat, lng: item.location?.lng }) : null

  return (
    <div {...sx(s.item)} id={`item-${item.id}`} ref={rowRef}>
      <div {...sx(s.gutter)}>
        <span {...sx(s.gutterLine)} aria-hidden />
        {pinned ? (
          <button
            type="button"
            {...sx(s.marker, s.markerPinned, active && s.markerActive)}
            aria-label={`Show ${item.title || "this stop"} on the map`}
            onClick={() => onLocate(item.id)}
          >
            {pinLabel}
          </button>
        ) : (
          <span {...sx(s.marker)} aria-hidden>
            <Icon size={13} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div
        {...sx(s.card, "trips-card", item.kind === "note" && s.cardNote, (hot || active) && s.cardHot, flash && s.cardFlash)}
        onMouseEnter={() => pinned && onHover(item.id)}
        onMouseLeave={() => pinned && onHover(null)}
      >
        <button
          type="button"
          {...sx(s.cardRow)}
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
            onChange((days) => moveItem(days, dayId, item.id, step))
            onAnnounce?.(`${item.title || "Stop"} moved ${step < 0 ? "up" : "down"}, now ${index + step + 1} of ${count}.`)
          }}
        >
          <span {...sx(s.cardTimeCol)}>
            {item.time ? (
              <>
                <span {...sx(s.cardTime)}>{formatClock(item.time)}</span>
                {item.endTime && <span {...sx(s.cardTimeEnd)}>{formatClock(item.endTime)}</span>}
              </>
            ) : (
              <span {...sx(s.cardTimeEnd)} aria-hidden>
                ––
              </span>
            )}
          </span>
          <span {...sx(s.cardText)}>
            {item.time && (
              <span {...sx(s.cardTimeTop)}>
                {formatClock(item.time)}
                {item.endTime ? ` – ${formatClock(item.endTime)}` : ""}
              </span>
            )}
            <span {...sx(s.cardTitle, a.wrap, !item.title && s.cardTitleEmpty)}>
              {item.title || (item.kind === "note" ? "Empty note" : "Untitled stop")}
            </span>
            {(category || sub || item.status !== "none") && (
              <span {...sx(s.cardSub)}>
                {category && <span>{category}</span>}
                {item.status !== "none" && (
                  <span {...sx(a.chip, item.status === "booked" ? a.chipOk : undefined)}>{STATUS_LABEL[item.status]}</span>
                )}
                {sub && (
                  <span {...sx(a.truncate)} style={{ flexBasis: "100%" }}>
                    {sub}
                  </span>
                )}
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
                    {...sx(a.field)}
                    onChange={(event) => patch({ title: event.target.value })}
                  />
                </label>
                <TimeField label="Starts" value={item.time} disabled={locked} onChange={(time) => patch({ time })} />
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
                {item.kind !== "note" && (
                  <div {...sx(s.span2)}>
                    <span {...sx(s.miniLabel)}>Location</span>
                    <LocationField item={item} near={near} locked={locked} onChange={patch} />
                  </div>
                )}
                {item.kind === "reservation" && (
                  <>
                    <label>
                      <span {...sx(s.miniLabel)}>Type</span>
                      <select
                        value={item.reservation?.type ?? "experience"}
                        disabled={locked}
                        {...sx(a.field)}
                        onChange={(event) =>
                          patch({ reservation: { status: "confirmed", ...item.reservation, type: event.target.value } })
                        }
                      >
                        {RESERVATION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {titleCase(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span {...sx(s.miniLabel)}>Confirmation</span>
                      <input
                        value={item.reservation?.confirmation ?? ""}
                        disabled={locked}
                        placeholder="Code or reference"
                        {...sx(a.field, a.mono)}
                        onChange={(event) =>
                          patch({
                            reservation: {
                              type: "experience",
                              status: "confirmed",
                              ...item.reservation,
                              confirmation: event.target.value || undefined,
                            },
                          })
                        }
                      />
                    </label>
                  </>
                )}
                <label {...sx(s.span2)}>
                  <span {...sx(s.miniLabel)}>Notes</span>
                  <textarea
                    value={item.notes ?? ""}
                    disabled={locked}
                    rows={2}
                    placeholder="Opening hours, what to order, who recommended it…"
                    {...sx(a.field, a.textarea)}
                    onChange={(event) => patch({ notes: event.target.value || undefined })}
                  />
                </label>
                {item.kind !== "note" && (
                  <label>
                    <span {...sx(s.miniLabel)}>Status</span>
                    <select
                      value={item.status}
                      disabled={locked}
                      {...sx(a.field)}
                      onChange={(event) => patch({ status: event.target.value as ItemStatus })}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {dayOptions.length > 1 && (
                  <label>
                    <span {...sx(s.miniLabel)}>Day</span>
                    <select
                      value={dayId}
                      disabled={locked}
                      {...sx(a.field)}
                      onChange={(event) => onChange((days) => moveItemToDay(days, dayId, item.id, event.target.value))}
                    >
                      {dayOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div {...sx(s.editorActions)}>
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    aria-label="Move up"
                    disabled={locked || index === 0}
                    onClick={() => onChange((days) => moveItem(days, dayId, item.id, -1))}
                  >
                    <ArrowUp size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    aria-label="Move down"
                    disabled={locked || index === count - 1}
                    onClick={() => onChange((days) => moveItem(days, dayId, item.id, 1))}
                  >
                    <ArrowDown size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    {...sx(a.iconBtn, a.iconBtnSm)}
                    aria-label="Duplicate"
                    disabled={locked}
                    onClick={() => onChange((days) => duplicateItem(days, dayId, item.id))}
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
                {item.reservation?.confirmation && (
                  <p {...sx(a.mono)}>Confirmation {item.reservation.confirmation}</p>
                )}
                {maps && (
                  <a href={maps.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnSecondary, a.btnSm)} style={{ alignSelf: "flex-start" }}>
                    <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
                    {maps.label}
                  </a>
                )}
                {!item.location?.address && !item.notes && !maps && <p {...sx(a.small)}>No details yet.</p>}
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
  useEffect(() => {
    setText(formatClock(value))
    setBad(false)
  }, [value])
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
          if (event.key === "Enter") {
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
