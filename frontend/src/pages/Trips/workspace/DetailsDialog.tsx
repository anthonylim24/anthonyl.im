import { useEffect, useId, useMemo, useState } from "react"
import { sx } from "@/styles/merge"
import { ACCENT_LABEL, addDays, dayCount, plural, resolveAccent, TRIP_ACCENTS } from "../meta"
import type { Trip, TripDay, TripStatus } from "../types"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { CityField } from "../components/CityField"
import { DateRange } from "../components/DateRange"
import { Modal } from "../components/kit"

// Everything about the trip that isn't the itinerary: where, when, how it
// looks. Edits apply together on Save so a half-typed date range never
// reshuffles the days.

const STATUS_COPY: Record<TripStatus, string> = {
  draft: "Draft — still planning",
  active: "Confirmed — it’s happening",
  completed: "Completed",
  archived: "Archived",
}

/**
 * Fit the day list to a new date range. Existing days keep their order and
 * content and are re-dated from the new start; extra days are appended empty.
 * Days beyond the new end are dropped (the caller warns first).
 */
export function resizeDays(days: readonly TripDay[], startDate: string, endDate: string): TripDay[] {
  const count = dayCount(startDate, endDate)
  const used = new Set(days.map((d) => d.id))
  const out: TripDay[] = []
  for (let i = 0; i < count; i++) {
    const date = addDays(startDate, i)
    const existing = days[i]
    if (existing) {
      out.push(existing.date === date ? existing : { ...existing, date })
      continue
    }
    let n = i + 1
    while (used.has(`day-${n}`)) n += 1
    used.add(`day-${n}`)
    out.push({ id: `day-${n}`, date, items: [] })
  }
  return out
}

function timezones(current: string): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
  const supported = intl.supportedValuesOf?.("timeZone") ?? []
  return supported.includes(current) ? supported : [current, ...supported]
}

export function DetailsDialog({
  trip,
  open,
  onClose,
  onSave,
}: {
  trip: Trip
  open: boolean
  onClose: () => void
  onSave: (next: Trip) => void
}) {
  const [draft, setDraft] = useState(trip)
  const formId = useId()
  const zones = useMemo(() => timezones(trip.timezone), [trip.timezone])

  useEffect(() => {
    if (open) setDraft(trip)
    // Re-seed only when the dialog opens; live saves must not clobber typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const badRange = draft.endDate < draft.startDate
  const tooLong = !badRange && dayCount(draft.startDate, draft.endDate) > 60
  const nextCount = badRange ? trip.days.length : dayCount(draft.startDate, draft.endDate)
  const dropped = trip.days.slice(nextCount).filter((d) => d.items.length > 0)
  const invalid = !draft.name.trim() || draft.destinations.length === 0 || badRange || tooLong
  const accent = resolveAccent(draft.appearance?.accent)

  const save = () => {
    if (invalid) return
    const datesChanged = draft.startDate !== trip.startDate || draft.endDate !== trip.endDate
    onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      days: datesChanged ? resizeDays(trip.days, draft.startDate, draft.endDate) : trip.days,
    })
    onClose()
  }

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
          <button type="submit" form={formId} {...sx(a.btn, a.btnPrimary)} disabled={invalid}>
            Save details
          </button>
        </>
      }
    >
      <form
        id={formId}
        {...sx(a.stack)}
        style={{ gap: "1.125rem" }}
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <label>
          <span {...sx(a.label)}>Name</span>
          <input
            value={draft.name}
            maxLength={160}
            required
            {...sx(a.field)}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <div>
          <label htmlFor={`${formId}-where`} {...sx(a.label)}>
            Where
          </label>
          <CityField
            id={`${formId}-where`}
            values={draft.destinations}
            invalid={draft.destinations.length === 0}
            onAdd={(name, city) =>
              setDraft((d) => ({
                ...d,
                destinations: [...d.destinations, name],
                center: d.center ?? (city ? { lat: city.lat, lng: city.lng } : undefined),
              }))
            }
            onRemove={(index) => setDraft((d) => ({ ...d, destinations: d.destinations.filter((_, i) => i !== index) }))}
          />
          {draft.destinations.length === 0 && <p {...sx(a.errorText)}>Add at least one place.</p>}
        </div>
        <div>
          <span {...sx(a.label)}>Dates</span>
          <DateRange
            start={draft.startDate}
            end={draft.endDate}
            invalid={tooLong}
            onChange={(startDate, endDate) => setDraft({ ...draft, startDate, endDate })}
          />
          {badRange ? (
            <p {...sx(a.errorText)} role="alert">
              The last day is before the first. Pick a later date.
            </p>
          ) : tooLong ? (
            <p {...sx(a.errorText)} role="alert">
              Trips can run up to 60 days. Shorten the range, or split it into two trips.
            </p>
          ) : dropped.length > 0 ? (
            <p {...sx(a.errorText)} role="alert">
              Shortening to {plural(nextCount, "day")} removes {plural(dropped.length, "planned day")} at the end, including their stops.
            </p>
          ) : (
            <p {...sx(a.hint)}>
              {plural(nextCount, "day")}. Changing the dates keeps each day’s plan and shifts it to the new dates.
            </p>
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
                onClick={() => setDraft({ ...draft, appearance: { ...draft.appearance, accent: option } })}
              />
            ))}
          </div>
        </fieldset>
        <label>
          <span {...sx(a.label)}>About this trip</span>
          <textarea
            rows={2}
            maxLength={4000}
            value={draft.description ?? ""}
            placeholder="Who’s going, what it’s for, anything worth remembering"
            {...sx(a.field, a.textarea)}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <div {...sx(s.twoCol)}>
          <label>
            <span {...sx(a.label)}>Status</span>
            <select
              value={draft.status}
              {...sx(a.field)}
              onChange={(event) => setDraft({ ...draft, status: event.target.value as TripStatus })}
            >
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
              value={draft.timezone}
              {...sx(a.field)}
              onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}
            >
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>
    </Modal>
  )
}
