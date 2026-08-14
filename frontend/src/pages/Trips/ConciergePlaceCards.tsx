import { useState } from "react"
import { MapPin, Plus } from "lucide-react"
import {
  conciergePlaceKey,
  placeCanBeAdded,
  type ConciergePlace,
} from "../../lib/conciergeGrounding"
import type { TripDay } from "./types"
import { accentChipBtnClass, compactSelectClass, focusRingClass, mutedInkClass, wrapAnywhereClass } from "./ui"

function dayLabel(day: TripDay, index: number): string {
  return day.title?.trim() || `Day ${index + 1}`
}

export function ConciergePlaceCards({
  places,
  days,
  defaultDayId,
  addedKeys,
  addingKey,
  canEdit,
  onAdd,
}: {
  places: ConciergePlace[]
  days: TripDay[]
  defaultDayId?: string
  addedKeys: Set<string>
  addingKey: string | null
  canEdit: boolean
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
  onAdd,
}: {
  place: ConciergePlace
  days: TripDay[]
  defaultDayId?: string
  added: boolean
  adding: boolean
  canEdit: boolean
  onAdd: (place: ConciergePlace, dayId: string) => void
}) {
  const [dayId, setDayId] = useState(defaultDayId ?? days[0]?.id ?? "")
  const addable = placeCanBeAdded(place)
  const meta = [place.category, place.address].filter(Boolean).join(" · ")

  return (
    <li className="rounded-xl border border-stone-200/90 bg-[var(--trips-surface)] px-3 py-2.5 dark:border-stone-700/80">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ta)]" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          {place.mapsUrl ? (
            <a
              href={place.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex min-h-11 items-center text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-current dark:text-stone-100 ${focusRingClass} ${wrapAnywhereClass}`}
            >
              {place.name}
            </a>
          ) : (
            <p className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>{place.name}</p>
          )}
          {meta ? <p className={`mt-0.5 text-[11px] ${mutedInkClass} ${wrapAnywhereClass}`}>{meta}</p> : null}
          {place.notes ? <p className={`mt-1 text-[12px] text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}>{place.notes}</p> : null}
        </div>
      </div>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {days.length > 1 ? (
            <label className="sr-only" htmlFor={`add-place-day-${conciergePlaceKey(place)}`}>
              Day for {place.name}
            </label>
          ) : null}
          {days.length > 1 ? (
            <select
              id={`add-place-day-${conciergePlaceKey(place)}`}
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
