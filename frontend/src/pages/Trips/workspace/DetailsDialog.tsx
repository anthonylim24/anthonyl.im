import { memo, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react"
import { sx } from "@/styles/merge"
import { exactCity, placeKey } from "../cityMatch"
import { validZone } from "../dayClock"
import { searchCities, type CityResult } from "../geocode"
import { LIMITS } from "../limits"
import { ACCENT_LABEL, dayCount, formatTripDate, plural, resolveAccent, TRIP_ACCENTS } from "../meta"
import type { Trip, TripAccent, TripStatus } from "../types"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { CityField } from "../components/CityField"
import { composing } from "../ime"
import { DateRange } from "../components/DateRange"
import { Modal } from "../components/kit"
import { d } from "./details.stylex"
import {
  applyDetailsPatch,
  dayHasPlans,
  dayStops,
  fitDays,
  ideasRoom,
  needsPlanChoice,
  type DatePlan,
  type DetailsPatch,
  type OutsideStops,
} from "./tripDetails"

// Everything about the trip that isn't the itinerary: where, when, how it
// looks. Edits apply together on Save so a half-typed date range never
// reshuffles the days, and Save sends only what was changed here
// (`DetailsPatch`), laid onto the trip as it is by then.

const STATUS_COPY: Record<TripStatus, string> = {
  draft: "Draft — still planning",
  active: "Confirmed — it’s happening",
  completed: "Completed",
  archived: "Archived",
}

/** A geocoder that has not answered by then counts as "not found": Save must not wait on it for long. */
const LOOKUP_MS = 4000

const zoneOption = (zone: string) => (
  <option key={zone} value={zone}>
    {zone.replace(/_/g, " ")}
  </option>
)

let supportedZones: { known: ReadonlySet<string>; options: ReactElement[] } | null = null

/**
 * Every zone the runtime knows, as `<option>`s: some 420 of them, so built
 * once, on the first open, and the same elements handed back after that.
 */
function supportedZoneOptions() {
  if (!supportedZones) {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
    const zones = intl.supportedValuesOf?.("timeZone") ?? []
    supportedZones = { known: new Set(zones), options: zones.map(zoneOption) }
  }
  return supportedZones
}

/** The zone select's options: `current` zones the runtime doesn't list first, then every zone it does. */
function ZoneOptions({ current }: { current: string[] }) {
  const { known, options } = supportedZoneOptions()
  return (
    <>
      {[...new Set(current)].filter((zone) => !known.has(zone)).map(zoneOption)}
      {options}
    </>
  )
}

/** The editable fields, as the dialog shows them. */
interface Form {
  name: string
  description: string
  destinations: string[]
  status: TripStatus
  accent?: TripAccent
  startDate: string
  endDate: string
}

interface Session {
  /** The trip's fields as the dialog opened: "changed" means different from these. */
  base: Form & { timezone: string }
  form: Form
  /** A zone picked in the select; it wins over the one the first destination brings. */
  zonePicked: string | null
  /** The traveller's answer to "what happens to my plans"; null until they give one. */
  plan: DatePlan | null
  outside: OutsideStops
  /** Places looked up this session by `placeKey`: a city, or null when none matched. */
  cities: Record<string, CityResult | null>
}

function startSession(trip: Trip): Session {
  const form: Form = {
    name: trip.name,
    description: trip.description ?? "",
    destinations: trip.destinations,
    status: trip.status,
    accent: trip.appearance?.accent,
    startDate: trip.startDate,
    endDate: trip.endDate,
  }
  return { base: { ...form, timezone: trip.timezone }, form, zonePicked: null, plan: null, outside: "ideas", cities: {} }
}

const sameList = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i])

interface Choice<T extends string> {
  value: T
  title: string
  hint?: string
  disabled?: boolean
}

/** A radio group of option cards: one tab stop, arrows move the choice. */
function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Choice<T>[]
  value: T | null
  onChange: (value: T) => void
}) {
  const groupRef = useRef<HTMLDivElement>(null)
  const enabled = options.filter((option) => !option.disabled)
  const tabStop = value ?? enabled[0]?.value
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
    if (!step || enabled.length === 0) return
    event.preventDefault()
    const at = enabled.findIndex((option) => option.value === value)
    const next = enabled[(at + step + enabled.length) % enabled.length]!
    onChange(next.value)
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }
  return (
    <div ref={groupRef} role="radiogroup" aria-label={label} {...sx(d.choices)} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={option.value}
            disabled={option.disabled}
            tabIndex={option.value === tabStop ? 0 : -1}
            {...sx(d.choice, on && d.choiceOn)}
            onClick={() => onChange(option.value)}
          >
            <span {...sx(d.dot, on && d.dotOn)} aria-hidden />
            <span {...sx(d.choiceText)}>
              <span {...sx(d.choiceTitle)}>{option.title}</span>
              {option.hint && <span {...sx(d.choiceHint)}>{option.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function DetailsDialogView({
  trip,
  open,
  onClose,
  onApply,
  onSave,
}: {
  /** The trip as it is now; previews (days that drop) are worked out from it. */
  trip: Trip
  open: boolean
  onClose: () => void
  /** The changes, to lay onto the current trip with `applyDetailsPatch`. */
  onApply?: (patch: DetailsPatch) => void
  /** Older callers: the trip with the changes applied to `trip`. Ignored when `onApply` is set. */
  onSave?: (next: Trip) => void
}) {
  const [session, setSession] = useState(() => startSession(trip))
  const formId = useId()

  // The zone list is built while the page is idle, not in the click that opens the dialog.
  useEffect(() => {
    if (supportedZones) return
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => supportedZoneOptions(), { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(supportedZoneOptions, 2000)
    return () => clearTimeout(timer)
  }, [])

  // Re-seed only when the dialog opens; live saves must not clobber typing.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession(startSession(trip))
  }

  const { base, form } = session
  const setForm = (fields: Partial<Form>) => setSession((current) => ({ ...current, form: { ...current.form, ...fields } }))

  // ── Where: a new first destination brings its map centre and time zone ──
  const first = form.destinations[0]
  const firstKey = first ? placeKey(first) : ""
  const firstChanged = Boolean(firstKey) && firstKey !== placeKey(base.destinations[0] ?? "")
  const known = firstChanged ? session.cities[firstKey] : undefined
  const lookup = open && firstChanged && known === undefined ? first! : null

  useEffect(() => {
    if (!lookup) return
    const key = placeKey(lookup)
    const controller = new AbortController()
    const settle = (city: CityResult | null) => {
      if (controller.signal.aborted) return
      controller.abort()
      setSession((current) => (key in current.cities ? current : { ...current, cities: { ...current.cities, [key]: city } }))
    }
    const timer = setTimeout(() => settle(null), LOOKUP_MS)
    searchCities(lookup, controller.signal).then(
      (found) => settle(exactCity(found, lookup) ?? null),
      () => settle(null),
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [lookup])

  const firstCity = known ?? null
  const cityZone = validZone(firstCity?.timezone)
  const timezone = session.zonePicked ?? cityZone ?? base.timezone

  // ── When: new dates, and what happens to the plans on them ──
  const badRange = form.endDate < form.startDate
  const tooLong = !badRange && dayCount(form.startDate, form.endDate) > LIMITS.days
  const nextCount = badRange ? trip.days.length : dayCount(form.startDate, form.endDate)
  const datesChanged = form.startDate !== base.startDate || form.endDate !== base.endDate
  const datesValid = !badRange && !tooLong
  const choosing = datesChanged && datesValid && needsPlanChoice(trip.days, form.startDate, form.endDate)
  // With no question to ask, both plans give the same days.
  const plan: DatePlan | null = choosing ? session.plan : "keep"
  const fit = datesChanged && datesValid && plan ? fitDays(trip.days, form.startDate, form.endDate, plan) : null
  const lostDays = fit ? fit.dropped.filter(dayHasPlans) : []
  const lostStops = lostDays.reduce((n, day) => n + dayStops(day).length, 0)
  const lostWords = lostDays.some((day) => day.notes?.trim() || day.journal?.trim())
  const ideasFit = lostStops > 0 && lostStops <= ideasRoom(trip)
  // Stops that can't go to Ideas can only be removed; the Save button says so.
  const outside: OutsideStops = lostStops > 0 && !ideasFit ? "delete" : session.outside
  const removing = lostDays.length > 0 && (lostStops === 0 || outside === "delete")
  const keepDrops = choosing ? fitDays(trip.days, form.startDate, form.endDate, "keep").dropped.filter(dayHasPlans).length : 0

  const whereNote =
    form.destinations.length === 0
      ? ""
      : lookup
        ? `Finding ${first} on the map…`
        : firstChanged && !firstCity
          ? `Couldn’t place “${first}” on the map, so the map centre and time zone stay as they were.`
          : firstCity && cityZone && cityZone !== base.timezone && !session.zonePicked
            ? `Times now follow ${firstCity.name} time.`
            : ""

  const invalid = !form.name.trim() || form.destinations.length === 0 || badRange || tooLong
  const waiting = choosing && session.plan === null
  const accent = resolveAccent(form.accent)
  const dayLabel = (iso: string) => formatTripDate(iso, trip.timezone)

  const patch = (): DetailsPatch => {
    const out: DetailsPatch = {}
    const name = form.name.trim()
    if (name !== base.name) out.name = name
    const description = form.description.trim()
    if (description !== base.description.trim()) out.description = description || null
    if (!sameList(form.destinations, base.destinations)) out.destinations = form.destinations
    if (firstCity) out.center = { lat: firstCity.lat, lng: firstCity.lng }
    if (timezone !== base.timezone) out.timezone = timezone
    if (form.status !== base.status) out.status = form.status
    if (form.accent && form.accent !== base.accent) out.accent = form.accent
    if (datesChanged && plan) out.dates = { startDate: form.startDate, endDate: form.endDate, plan, outside }
    return out
  }

  const save = () => {
    if (invalid || waiting || lookup) return
    const changes = patch()
    if (Object.keys(changes).length > 0) {
      if (onApply) onApply(changes)
      else onSave?.(applyDetailsPatch(trip, changes))
    }
    onClose()
  }

  const saveLabel = removing
    ? lostStops > 0
      ? `Remove ${plural(lostStops, "stop")} and save`
      : `Remove ${plural(lostDays.length, "day")} and save`
    : "Save details"

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Trip details"
      accent={accent}
      footer={
        <>
          <button type="button" {...sx(a.btn, a.btnSecondary)} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            {...sx(a.btn, removing ? a.btnDanger : a.btnPrimary)}
            disabled={invalid || waiting || Boolean(lookup)}
          >
            {saveLabel}
          </button>
        </>
      }
    >
      {open && (
        <form
          id={formId}
          {...sx(a.stack)}
          style={{ gap: "1.125rem" }}
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
          onKeyDown={(event) => {
            // Enter that confirms an IME composition must not save the dialog.
            if (event.key === "Enter" && composing(event)) event.preventDefault()
          }}
        >
          <label>
            <span {...sx(a.label)}>Name</span>
            <input
              value={form.name}
              maxLength={LIMITS.tripName}
              required
              {...sx(a.field)}
              onChange={(event) => setForm({ name: event.target.value })}
            />
          </label>
          <div>
            <label htmlFor={`${formId}-where`} {...sx(a.label)}>
              Where
            </label>
            <CityField
              id={`${formId}-where`}
              values={form.destinations}
              invalid={form.destinations.length === 0}
              onAdd={(name, city) =>
                setSession((current) => ({
                  ...current,
                  form: { ...current.form, destinations: [...current.form.destinations, name] },
                  cities: city ? { ...current.cities, [placeKey(name)]: city } : current.cities,
                }))
              }
              onRemove={(index) => setForm({ destinations: form.destinations.filter((_, i) => i !== index) })}
            />
            {form.destinations.length === 0 && <p {...sx(a.errorText)}>Add at least one place.</p>}
            {/* Mounted while the dialog is, so the change is announced. */}
            <p {...sx(whereNote ? a.hint : a.srOnly)} role="status">
              {whereNote}
            </p>
          </div>
          <div>
            <span {...sx(a.label)}>Dates</span>
            <DateRange
              start={form.startDate}
              end={form.endDate}
              invalid={tooLong}
              onChange={(startDate, endDate) => setForm({ startDate, endDate })}
            />
            {badRange ? (
              <p {...sx(a.errorText)} role="alert">
                The last day is before the first. Pick a later date.
              </p>
            ) : tooLong ? (
              <p {...sx(a.errorText)} role="alert">
                Trips can run up to {LIMITS.days} days. Shorten the range, or split it into two trips.
              </p>
            ) : (
              <p {...sx(a.hint)}>{plural(nextCount, "day")}.</p>
            )}
            {choosing && (
              <Choices
                label="What happens to your plans"
                value={session.plan}
                onChange={(next) => setSession((current) => ({ ...current, plan: next }))}
                options={[
                  {
                    value: "shift",
                    title: "Move my plans with the dates",
                    hint: `Day 1 moves to ${dayLabel(form.startDate)}, and every stop and booking moves with its day.`,
                  },
                  {
                    value: "keep",
                    title: "Keep plans on their dates",
                    hint:
                      keepDrops > 0
                        ? `Stops stay on the days they’re on. ${plural(keepDrops, "day")} with plans fall outside the new dates.`
                        : "Stops stay on the days they’re on; the new days start empty.",
                  },
                ]}
              />
            )}
            {waiting && <p {...sx(a.hint)}>Choose what happens to your plans to save the new dates.</p>}
            {lostDays.length > 0 && (
              <div {...sx(d.outside)} role="group" aria-labelledby={`${formId}-lost`}>
                <p id={`${formId}-lost`} {...sx(a.body, a.ink)} style={{ margin: 0, fontWeight: 600 }}>
                  {lostDays.length === 1 ? "This day falls" : `These ${lostDays.length} days fall`} outside the new dates
                </p>
                <ul {...sx(d.lostList)}>
                  {lostDays.map((day) => {
                    const stops = dayStops(day).length
                    const number = trip.days.indexOf(day) + 1
                    return (
                      <li key={day.id} {...sx(d.lostDay)}>
                        <span>{[`Day ${number}`, dayLabel(day.date), day.title?.trim()].filter(Boolean).join(" · ")}</span>
                        <span {...sx(d.lostCount)}>{stops > 0 ? plural(stops, "stop") : "No stops"}</span>
                      </li>
                    )
                  })}
                </ul>
                {lostStops > 0 && (
                  <Choices
                    label="Their stops"
                    value={outside}
                    onChange={(next) => setSession((current) => ({ ...current, outside: next }))}
                    options={[
                      {
                        value: "ideas",
                        title: `Save ${lostStops === 1 ? "its stop" : `their ${plural(lostStops, "stop")}`} to the wishlist`,
                        hint: ideasFit
                          ? "They wait on the trip’s wishlist until you put them on a day."
                          : `The wishlist holds ${LIMITS.ideas} places and doesn’t have room for these.`,
                        disabled: !ideasFit,
                      },
                      { value: "delete", title: lostStops === 1 ? "Remove it" : "Remove them", hint: "You can undo this right after saving." },
                    ]}
                  />
                )}
                {lostWords && <p {...sx(d.note)}>Day notes and journal entries on {lostDays.length === 1 ? "this day" : "these days"} go with them.</p>}
              </div>
            )}
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend {...sx(a.label)}>Colour</legend>
            <div {...sx(s.swatches)} role="radiogroup" aria-label="Trip colour">
              {TRIP_ACCENTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={accent === option}
                  aria-label={ACCENT_LABEL[option]}
                  title={ACCENT_LABEL[option]}
                  data-trip-accent={option}
                  {...sx(s.swatch, accent === option && s.swatchOn)}
                  onClick={() => setForm({ accent: option })}
                />
              ))}
            </div>
          </fieldset>
          <label>
            <span {...sx(a.label)}>About this trip</span>
            <textarea
              rows={2}
              maxLength={LIMITS.description}
              value={form.description}
              placeholder="Who’s going, what it’s for, anything worth remembering"
              {...sx(a.field, a.textarea)}
              onChange={(event) => setForm({ description: event.target.value })}
            />
          </label>
          <div {...sx(s.twoCol)}>
            <label>
              <span {...sx(a.label)}>Status</span>
              <select value={form.status} {...sx(a.field)} onChange={(event) => setForm({ status: event.target.value as TripStatus })}>
                {(Object.keys(STATUS_COPY) as TripStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_COPY[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span {...sx(a.label)}>Time zone</span>
              <select
                value={timezone}
                {...sx(a.field)}
                onChange={(event) => setSession((current) => ({ ...current, zonePicked: event.target.value }))}
              >
                <ZoneOptions current={[timezone, base.timezone]} />
              </select>
            </label>
          </div>
        </form>
      )}
    </Modal>
  )
}

/**
 * Closed, the dialog draws nothing, and its next open starts again from the
 * trip as it is then. So it skips renders while it stays closed: the
 * workspace renders it on every keystroke. Its last open render stays on
 * screen while it animates out (the kit Modal freezes it), so the closed
 * render leaves the form out.
 */
export const DetailsDialog = memo(DetailsDialogView, (prev, next) => !prev.open && !next.open)
