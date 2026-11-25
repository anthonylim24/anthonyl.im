import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, CalendarDays, Clock, Copy, ExternalLink, MapPin, MapPinOff, Plus, Trash2, X } from "lucide-react"
import { sx } from "@/styles/merge"
import { externalMapsAppName, externalMapsLink } from "@/lib/externalMaps"
import { formatClock, STATUS_LABEL } from "../meta"
import type { LngLat } from "../map/geo"
import { LIMITS } from "../limits"
import { Modal } from "../components/kit"
import { Presence } from "../components/presence"
import { useClaimEscape } from "../components/escape"
import { Select } from "../components/Select"
import { DayPicker } from "./DayPicker"
import { composing } from "../ime"
import { normalizeLink, stopLink, withLink } from "./stopLinks"
import { LinkChip } from "./LinkChip"
import { CostField } from "../budget/CostField"
import type { ItemStatus, ItineraryItem, Trip, TripDay } from "../types"
import { BookingFields } from "./BookingFields"
import { BookingSummary } from "../bookings/BookingSummary"
import { TimeField } from "../bookings/TimeField"
import type { DayOption } from "../useTripEditor"
import { type EditorSurface, type StopEdits } from "./stopEdits"
import { FIELD_CHIP, holds, STOP_FIELDS, type StopField } from "./stopFields"
import { useFitHeight } from "./fitHeight"
import { stopTitle } from "../timeline/timeline"
import { startReason, type StartSuggestion } from "../timeline/suggestStart"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { usePlaceSearch } from "./AddStop"

// A stop's editor: one body of fields, shown under its card in the day list
// on a wide screen, or in a sheet (the timeline at any width, and phones in
// either layout). Every field patches the trip as it changes; there is no
// draft and no Save.

/** The sheet that sends a stop to another day, or copies of it to several. */
export function StopDayPicker({
  mode,
  item,
  dayId,
  dayOptions,
  edits,
  onClose,
}: {
  mode: "move" | "copy"
  item: ItineraryItem
  dayId: string
  dayOptions: DayOption[]
  edits: StopEdits
  onClose: () => void
}) {
  const choices = dayOptions.map((option) => ({ id: option.id, label: option.label, off: option.id === dayId ? "This day" : undefined }))
  return mode === "move" ? (
    <DayPicker
      title={`Move ${edits.name}`}
      description={item.time ? `It keeps ${formatClock(item.time)} and goes where that falls on that day’s route.` : "It goes last on that day’s route."}
      choices={choices}
      onPick={edits.moveTo}
      onClose={onClose}
    />
  ) : (
    <DayPicker
      title={`Copy ${edits.name}`}
      description={item.time ? `Each copy keeps ${formatClock(item.time)} and goes where that falls on its day.` : "Each copy goes last on its day’s route."}
      choices={choices}
      confirm={(count) => (count === 0 ? "Copy" : `Copy to ${count === 1 ? "1 day" : `${count} days`}`)}
      onPickMany={edits.copyTo}
      onClose={onClose}
    />
  )
}

const STATUSES: ItemStatus[] = ["none", "booked", "optional", "needs_review", "completed", "skipped"]

export interface StopEditorProps {
  item: ItineraryItem
  /** The trip and day: a booking's fields need them. */
  trip?: Trip
  day?: TripDay
  locked: boolean
  near: LngLat | null
  /** Currency a new cost starts in (the trip's budget, else its local money). */
  currency: string
  edits: StopEdits
  /** A start for it while it has none, read off its day (`suggestStart`). */
  startAt?: StartSuggestion | null
  /** Focus the name on mount: a sheet opened to edit this stop. Untitled, it always is. */
  focusName?: boolean
}

/** The fields of an editable stop: what its kind needs, then chips for the rest (`stopFields.ts`). */
export function StopEditor({ item, trip, day, locked, near, currency, edits, startAt = null, focusName = false }: StopEditorProps) {
  const [endOpen, setEndOpen] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  useFitHeight(notesRef, item.notes ?? "")
  const { patch } = edits
  const kind = item.kind === "reservation" || item.kind === "note" ? item.kind : "place"
  const fields = STOP_FIELDS[kind]
  // What showed when the editor opened stays while it is emptied.
  const [asked, setAsked] = useState<ReadonlySet<StopField>>(() => new Set(fields.optional.filter((field) => holds(item, field))))
  const shows = (field: StopField) =>
    fields.always.includes(field) || (fields.optional.includes(field) && (asked.has(field) || (field !== "details" && holds(item, field))))
  const fieldId = useId()
  // A fresh object per request, so asking for the same field again focuses it again.
  const [focusOn, setFocusOn] = useState<{ field: StopField } | null>(null)
  const ask = (field: StopField) => {
    setAsked((was) => new Set(was).add(field))
    setFocusOn({ field })
  }
  useEffect(() => {
    if (!focusOn) return
    document
      .querySelector(`[data-stop-field="${fieldId}-${focusOn.field}"]`)
      ?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, [role=combobox], button")
      ?.focus()
  }, [focusOn, fieldId])
  const mark = (field: StopField) => ({ "data-stop-field": `${fieldId}-${field}` })
  const chips = fields.optional.filter((field) => !shows(field) && !(field === "details" && holds(item, "details")))

  return (
    <>
      <label {...sx(s.span2)}>
        <span {...sx(s.miniLabel)}>{item.kind === "note" ? "Note" : "Name"}</span>
        <input
          value={item.title}
          disabled={locked}
          placeholder={item.kind === "note" ? "What to remember" : "Name this stop"}
          autoFocus={focusName || !item.title}
          maxLength={LIMITS.itemTitle}
          {...sx(a.field)}
          onChange={(event) => patch({ title: event.target.value })}
        />
      </label>
      {item.kind !== "reservation" && shows("time") && (
        <>
          <div {...mark("time")}>
            <TimeField label="Starts" value={item.time} disabled={locked} onChange={edits.setTime} />
          </div>
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
          {startAt && !item.time && (
            <div {...sx(s.span2, s.startAt)}>
              <button
                type="button"
                {...sx(a.btn, a.btnSecondary, a.btnSm)}
                disabled={locked}
                aria-describedby={`${fieldId}-start-reason`}
                onClick={() => {
                  edits.setTime(startAt.time)
                  setFocusOn({ field: "time" })
                }}
              >
                <Clock size={14} strokeWidth={1.75} aria-hidden />
                Start at {formatClock(startAt.time)}
              </button>
              <span id={`${fieldId}-start-reason`} {...sx(s.startReason)}>
                {startReason(startAt)}
              </span>
            </div>
          )}
        </>
      )}
      {item.kind === "reservation" && trip && day && (
        <BookingFields item={item} trip={trip} day={day} disabled={locked} details={asked.has("details")} onChange={patch} />
      )}
      {shows("location") && (
        <div {...sx(s.span2)}>
          <span {...sx(s.miniLabel)}>Location</span>
          <LocationField item={item} near={near} locked={locked} onChange={patch} />
        </div>
      )}
      {shows("notes") && (
        <label {...sx(s.span2)} {...mark("notes")}>
          <span {...sx(s.miniLabel)}>Notes</span>
          <textarea
            ref={notesRef}
            value={item.notes ?? ""}
            disabled={locked}
            rows={1}
            maxLength={LIMITS.notes}
            placeholder="Hours, what to order, who said go…"
            {...sx(a.field, a.textarea, s.notesField)}
            onChange={(event) => patch({ notes: event.target.value || undefined })}
          />
        </label>
      )}
      {shows("status") && (
        <label {...sx(s.span2Narrow)} {...mark("status")}>
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
      {shows("cost") && (
        <div {...sx(s.span2Narrow)} {...mark("cost")}>
          <CostField value={item.cost} defaultCurrency={currency} disabled={locked} onChange={(cost) => patch({ cost })} />
        </div>
      )}
      {shows("links") && (
        <div {...sx(s.span2)} {...mark("links")}>
          <LinksField links={item.links} disabled={locked} onChange={(links) => patch({ links: links.length > 0 ? links : undefined })} />
        </div>
      )}
      {chips.length > 0 && (
        <div {...sx(s.fieldChips)}>
          {chips.map((field) => (
            <button key={field} type="button" {...sx(s.fieldChip)} disabled={locked} onClick={() => ask(field)}>
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              {FIELD_CHIP[field]}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

const mapsOf = (item: ItineraryItem) =>
  isPinned(item) || item.location?.address
    ? externalMapsLink({ name: item.location?.name ?? item.title, address: item.location?.address, lat: item.location?.lat, lng: item.location?.lng })
    : undefined

const isPinned = (item: ItineraryItem) => typeof item.location?.lat === "number" && typeof item.location?.lng === "number"

/**
 * Move up / down (the drag grip is hidden on phones), duplicate, open in maps
 * and delete, in one row. In a sheet the card's own menu is out of reach, so
 * the row also sends the stop to another day.
 */
export function StopActions({
  item,
  dayId,
  index,
  count,
  dayOptions,
  locked,
  surface,
  edits,
  onDelete,
}: {
  item: ItineraryItem
  dayId: string
  index: number
  count: number
  dayOptions: DayOption[]
  locked: boolean
  surface: EditorSurface
  edits: StopEdits
  onDelete: () => void
}) {
  const [picking, setPicking] = useState(false)
  const maps = mapsOf(item)
  const sheet = surface === "sheet"
  return (
    <div {...sx(sheet ? s.sheetActions : s.editorActions)}>
      <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Move up" title="Move up" disabled={locked || index === 0} onClick={() => edits.move(-1)}>
        <ArrowUp size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Move down" title="Move down" disabled={locked || index === count - 1} onClick={() => edits.move(1)}>
        <ArrowDown size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Duplicate" title="Duplicate" disabled={locked} onClick={edits.duplicate}>
        <Copy size={16} strokeWidth={1.75} aria-hidden />
      </button>
      {sheet && dayOptions.length > 1 && (
        <button
          type="button"
          {...sx(a.iconBtn, a.iconBtnSm)}
          aria-label="Move to another day…"
          title="Move to another day"
          disabled={locked}
          onClick={() => setPicking(true)}
        >
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      {maps &&
        (sheet ? (
          <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} title={maps.label} {...sx(a.iconBtn, a.iconBtnSm)}>
            <ExternalLink size={16} strokeWidth={1.75} aria-hidden />
          </a>
        ) : (
          <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(a.btn, a.btnGhost, a.btnSm)}>
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
            Maps
          </a>
        ))}
      {sheet ? (
        <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label="Delete" title="Delete" disabled={locked} onClick={onDelete}>
          <Trash2 size={16} strokeWidth={1.75} aria-hidden />
        </button>
      ) : (
        <>
          <span {...sx(a.grow)} />
          <button type="button" {...sx(a.btn, a.btnGhost, a.btnSm)} disabled={locked} onClick={onDelete}>
            <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            Delete
          </button>
        </>
      )}
      <Presence when={picking}>
        {() => <StopDayPicker mode="move" item={item} dayId={dayId} dayOptions={dayOptions} edits={edits} onClose={() => setPicking(false)} />}
      </Presence>
    </div>
  )
}

/** What a viewer sees of a stop: its address, notes, booking, map link and links. */
export function StopDetails({ item, trip, day }: { item: ItineraryItem; trip?: Trip; day?: TripDay }) {
  const maps = mapsOf(item)
  const links = (item.links ?? []).map(stopLink).filter((link): link is NonNullable<typeof link> => link !== null)
  return (
    <div {...sx(s.span2, a.stack)}>
      {item.location?.address && <p {...sx(a.small, a.wrap)}>{item.location.address}</p>}
      {item.notes && (
        <p {...sx(a.body, a.wrap)} style={{ whiteSpace: "pre-wrap" }}>
          {item.notes}
        </p>
      )}
      {item.kind === "reservation" && trip && day ? (
        <BookingSummary item={item} trip={trip} day={day} />
      ) : (
        item.reservation?.confirmation && <p {...sx(a.mono)}>Confirmation {item.reservation.confirmation}</p>
      )}
      {maps && (
        // The app's name, not "Open <title> in …": a button does not wrap, and a long title would widen the page.
        <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(a.btn, a.btnSecondary, a.btnSm)} style={{ alignSelf: "flex-start" }}>
          <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          {externalMapsAppName(maps.app)}
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
  )
}

/**
 * The editor as a sheet, titled with the stop: a dialog on a wide screen, a
 * bottom sheet on a phone. Done and the stop's actions stay in its foot. It
 * keeps its own live region: the page's is hidden from assistive technology
 * while a modal is open.
 */
export function StopSheet({
  item,
  trip,
  day,
  index,
  editable,
  locked,
  near,
  currency,
  dayOptions,
  spoken,
  edits,
  startAt,
  onDelete,
  onClose,
  returnFocus,
}: {
  /** Gone (deleted, moved to another day) while the sheet leaves. */
  item: ItineraryItem | undefined
  trip: Trip
  day: TripDay
  index: number
  editable: boolean
  locked: boolean
  near: LngLat | null
  currency: string
  dayOptions: DayOption[]
  spoken: string
  edits: StopEdits | null
  startAt: StartSuggestion | null
  onDelete: () => void
  onClose: () => void
  returnFocus: () => HTMLElement | null | undefined
}) {
  let body: ReactNode = null
  let foot: ReactNode = null
  if (item) {
    body = editable && edits ? (
      <div {...sx(s.sheetEditor)}>
        <StopEditor item={item} trip={trip} day={day} locked={locked} near={near} currency={currency} edits={edits} startAt={startAt} focusName />
      </div>
    ) : (
      <StopDetails item={item} trip={trip} day={day} />
    )
    foot = (
      <div {...sx(s.sheetFoot)}>
        {editable && edits && (
          <StopActions
            item={item}
            dayId={day.id}
            index={index}
            count={day.items.length}
            dayOptions={dayOptions}
            locked={locked}
            surface="sheet"
            edits={edits}
            onDelete={onDelete}
          />
        )}
        <span {...sx(a.grow)} />
        <button type="button" {...sx(a.btn, a.btnPrimary)} onClick={onClose}>
          Done
        </button>
      </div>
    )
  }
  return (
    <Modal open onClose={onClose} title={item ? stopTitle(item) : ""} accent={trip.appearance?.accent} footer={foot} returnFocus={returnFocus}>
      {body}
      <p {...sx(a.srOnly)} role="status" aria-live="polite">
        {spoken}
      </p>
    </Modal>
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
  const pinned = isPinned(item)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const { results, loading } = usePlaceSearch(searching ? query : "", near)
  // Escape closes the results, not the sheet around them.
  const areaRef = useRef<HTMLDivElement>(null)
  useClaimEscape(searching, areaRef)

  if (pinned && !searching) {
    // One line: the place's own name when the stop is called something else, else where it is.
    const place = item.location?.name?.trim()
    const where = (place && place !== item.title.trim() ? place : item.location?.address) || place || "Pinned on the map"
    return (
      <div {...sx(s.pinnedBox)}>
        <MapPin size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, s.tripText)} />
        <span {...sx(a.grow, a.truncate)} title={[place, item.location?.address].filter(Boolean).join(" · ")}>
          {where}
        </span>
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
          onClick={() => onChange({ location: { name: item.location?.name ?? item.title, source: item.location?.source ?? "user" } })}
        >
          <MapPinOff size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div {...sx(a.stack)} style={{ gap: "0.375rem" }} ref={areaRef}>
      <input
        value={searching ? query : ""}
        disabled={locked}
        // Opened by Change: the search is what was asked for.
        autoFocus={searching}
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
                  {place.context && (
                    <span {...sx(a.small, a.truncate)} style={{ display: "block" }}>
                      {place.context}
                    </span>
                  )}
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
    <div {...sx(a.stack)} style={{ gap: "0.375rem" }}>
      <label htmlFor={id} {...sx(s.miniLabel)} style={{ marginBottom: 0 }}>
        Links
      </label>
      {saved.length > 0 && (
        <ul {...sx(s.links)} aria-label="Links">
          {saved.map((raw) => {
            const link = stopLink(raw)
            return (
              <li key={raw} {...sx(s.linkRow)}>
                {link ? (
                  <LinkChip link={link} />
                ) : (
                  <span {...sx(a.small, s.linkText)} title={raw}>
                    {raw}
                  </span>
                )}
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
