import { useState } from "react"
import { Plus } from "lucide-react"
import {
  conciergePlaceKey,
  placeCanBeAdded,
  type ConciergePlace,
} from "../../lib/conciergeGrounding"
import type { TripDay } from "./types"
import {
  DISPLAY,
  accentChipBtnClass,
  alertErrorClass,
  compactSelectClass,
  displayCardClass,
  ghostOnTintBtnClass,
  inlineLinkClass,
  mutedInkClass,
  panelClass,
  wrapAnywhereClass,
} from "./ui"

function dayLabel(day: TripDay, index: number): string {
  return day.title?.trim() || `Day ${index + 1}`
}

function placeFacts(place: ConciergePlace): string {
  const category = place.category?.trim()
  const where =
    place.address?.trim() ||
    (place.lat != null && place.lng != null ? `${place.lat.toFixed(2)}, ${place.lng.toFixed(2)}` : "")
  if (category && where) return `${category} · ${where}`
  return category || where
}

export function ConciergePlaceCards({
  places,
  days,
  defaultDayId,
  addedKeys,
  addingKey,
  canEdit,
  errorKey,
  errorMessage,
  onAdd,
}: {
  places: ConciergePlace[]
  days: TripDay[]
  defaultDayId?: string
  addedKeys: Set<string>
  addingKey: string | null
  canEdit: boolean
  errorKey?: string
  errorMessage?: string
  onAdd: (place: ConciergePlace, dayId: string) => void
}) {
  if (places.length === 0 || days.length === 0) return null
  const fallbackDay = days.some((d) => d.id === defaultDayId) ? defaultDayId : days[0]?.id
  return (
    <ul className="mt-3 space-y-2" aria-label="Suggested places">
      {places.map((place) => (
        <ConciergePlaceCard
          key={conciergePlaceKey(place)}
          place={place}
          days={days}
          defaultDayId={place.dayId && days.some((d) => d.id === place.dayId) ? place.dayId : fallbackDay}
          added={addedKeys.has(conciergePlaceKey(place))}
          adding={addingKey === conciergePlaceKey(place)}
          canEdit={canEdit}
          error={errorKey === conciergePlaceKey(place) ? errorMessage : undefined}
          onAdd={onAdd}
        />
      ))}
    </ul>
  )
}

function ConciergePlaceCard({
  place,
  days,
  defaultDayId,
  added,
  adding,
  canEdit,
  error,
  onAdd,
}: {
  place: ConciergePlace
  days: TripDay[]
  defaultDayId?: string
  added: boolean
  adding: boolean
  canEdit: boolean
  error?: string
  onAdd: (place: ConciergePlace, dayId: string) => void
}) {
  const [dayId, setDayId] = useState(defaultDayId ?? days[0]?.id ?? "")
  const addable = placeCanBeAdded(place)
  const facts = placeFacts(place)
  const daySelectId = `add-place-day-${conciergePlaceKey(place)}`

  return (
    <li className={`${panelClass} px-3 py-2.5`}>
      <p className={`${displayCardClass} ${wrapAnywhereClass}`} style={DISPLAY}>
        {place.name}
      </p>
      {facts ? (
        <p className={`mt-1 font-mono-trips text-[11px] tabular-nums ${mutedInkClass} ${wrapAnywhereClass}`}>
          {facts}
        </p>
      ) : null}
      {place.notes ? (
        <p className={`mt-1 text-[13px] leading-relaxed ${wrapAnywhereClass}`}>{place.notes}</p>
      ) : null}
      {place.mapsUrl ? (
        <p className={`mt-1.5 font-mono-trips text-[11px] ${mutedInkClass}`}>
          <a
            href={place.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className={inlineLinkClass}
          >
            <span translate="no">Google Maps</span>
          </a>
        </p>
      ) : null}
      {added ? (
        <p className={`mt-2 text-xs ${mutedInkClass}`} role="status">
          Added to your day
        </p>
      ) : null}
      {error ? (
        <div className={`mt-2 ${alertErrorClass}`} role="alert">
          <p>{error}</p>
          <button
            type="button"
            disabled={adding || !addable || !dayId}
            onClick={() => onAdd(place, dayId)}
            className={`${ghostOnTintBtnClass} mt-2`}
          >
            Try again
          </button>
        </div>
      ) : null}
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {days.length > 1 ? (
            <label className="sr-only" htmlFor={daySelectId}>
              Day for {place.name}
            </label>
          ) : null}
          {days.length > 1 ? (
            <select
              id={daySelectId}
              value={dayId}
              onChange={(e) => setDayId(e.target.value)}
              disabled={added || adding}
              className={`${compactSelectClass} min-w-0 flex-1`}
            >
              {days.map((day, i) => (
                <option key={day.id} value={day.id}>
                  {dayLabel(day, i)}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            disabled={added || adding || !addable || !dayId}
            onClick={() => onAdd(place, dayId)}
            aria-busy={adding}
            aria-label={
              added
                ? `${place.name} added`
                : adding
                  ? `Adding ${place.name}`
                  : `Add ${place.name} to the itinerary`
            }
            className={accentChipBtnClass}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            {added ? "Added" : adding ? "Adding…" : "Add to itinerary"}
          </button>
        </div>
      ) : null}
    </li>
  )
}
