import { useState } from "react"
import { Globe2, ImageIcon, MapPin, Plus, Trash2 } from "lucide-react"
import {
  conciergePlaceKey,
  placeCanBeAdded,
  type ConciergePlace,
} from "../../lib/conciergeGrounding"
import { externalMapsLink } from "../../lib/externalMaps"
import { ConciergePhotoThumb } from "./ConciergePhoto"
import { dayLabel } from "./conciergeMoves"
import type { TripDay } from "./types"
import {
  accentChipBtnClass,
  compactSelectClass,
  dangerChipBtnClass,
  focusRingClass,
  ghostBtnClass,
  mutedInkClass,
  quietBtnClass,
  wrapAnywhereClass,
} from "./ui"

export function ConciergePlaceCards({
  places,
  days,
  defaultDayId,
  city,
  addedKeys,
  removedKeys,
  addingKey,
  movingItemId,
  canEdit,
  variant,
  onAdd,
  onRemove,
  onMove,
  onPhotos,
}: {
  places: ConciergePlace[]
  days: TripDay[]
  defaultDayId?: string
  city?: string
  addedKeys: Set<string>
  removedKeys?: Set<string>
  addingKey: string | null
  movingItemId?: string | null
  canEdit: boolean
  variant: "suggest" | "itinerary"
  onAdd?: (place: ConciergePlace, dayId: string) => void
  onRemove?: (place: ConciergePlace) => void
  onMove?: (place: ConciergePlace, toDayId: string) => void
  onPhotos: (place: ConciergePlace) => void
}) {
  if (places.length === 0 || days.length === 0) return null
  const fallbackDay = days.some((d) => d.id === defaultDayId) ? defaultDayId : days[0]?.id
  return (
    <ul className="mt-3 space-y-3" aria-label={variant === "suggest" ? "Suggested places" : "Places on this trip"}>
      {places.map((place) => (
        <ConciergePlaceCard
          key={conciergePlaceKey(place)}
          place={place}
          days={days}
          city={city}
          defaultDayId={place.dayId && days.some((d) => d.id === place.dayId) ? place.dayId : fallbackDay}
          added={addedKeys.has(conciergePlaceKey(place))}
          removed={removedKeys?.has(place.itemId ?? conciergePlaceKey(place)) ?? false}
          adding={addingKey === conciergePlaceKey(place)}
          moving={movingItemId != null && movingItemId === place.itemId}
          canEdit={canEdit}
          variant={variant}
          onAdd={onAdd}
          onRemove={onRemove}
          onMove={onMove}
          onPhotos={onPhotos}
        />
      ))}
    </ul>
  )
}

function ConciergePlaceCard({
  place,
  days,
  city,
  defaultDayId,
  added,
  removed,
  adding,
  moving,
  canEdit,
  variant,
  onAdd,
  onRemove,
  onMove,
  onPhotos,
}: {
  place: ConciergePlace
  days: TripDay[]
  city?: string
  defaultDayId?: string
  added: boolean
  removed: boolean
  adding: boolean
  moving: boolean
  canEdit: boolean
  variant: "suggest" | "itinerary"
  onAdd?: (place: ConciergePlace, dayId: string) => void
  onRemove?: (place: ConciergePlace) => void
  onMove?: (place: ConciergePlace, toDayId: string) => void
  onPhotos: (place: ConciergePlace) => void
}) {
  const [dayId, setDayId] = useState(defaultDayId ?? days[0]?.id ?? "")
  const [confirmRemove, setConfirmRemove] = useState(false)
  const addable = placeCanBeAdded(place)
  const onDay = days.find((d) => d.id === (place.dayId ?? dayId))
  const onDayLabel = onDay ? dayLabel(onDay, days.indexOf(onDay)) : undefined
  const meta = [place.category, place.address, variant === "itinerary" && onDayLabel ? `on ${onDayLabel}` : null]
    .filter(Boolean)
    .join(" · ")
  const maps = externalMapsLink(place)

  return (
    <li className="overflow-hidden rounded-2xl border border-stone-200/90 bg-[var(--trips-surface)] dark:border-stone-700/80">
      <ConciergePhotoThumb
        name={place.name}
        city={city}
        lat={place.lat}
        lng={place.lng}
        onOpen={() => onPhotos(place)}
      />
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ta)]" strokeWidth={1.75} aria-hidden />
          <div className="min-w-0 flex-1">
            {maps ? (
              <a
                href={maps.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-11 items-center text-sm font-medium text-stone-900 underline decoration-stone-300 underline-offset-2 hover:decoration-current dark:text-stone-100 ${focusRingClass} ${wrapAnywhereClass}`}
              >
                {place.name}
              </a>
            ) : (
              <p className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>{place.name}</p>
            )}
            {meta ? <p className={`mt-0.5 text-[11px] ${mutedInkClass} ${wrapAnywhereClass}`}>{meta}</p> : null}
            {place.notes ? (
              <p className={`mt-1 text-[12px] text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}>{place.notes}</p>
            ) : null}
            {removed ? <p className={`mt-1 text-[12px] ${mutedInkClass}`}>Removed from the itinerary.</p> : null}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPhotos(place)}
            aria-label={`Photos of ${place.name}`}
            className={quietBtnClass}
          >
            <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
            Photos
          </button>
          {maps ? (
            <a
              href={maps.href}
              target="_blank"
              rel="noopener noreferrer"
              className={quietBtnClass}
              aria-label={maps.label}
            >
              <Globe2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
              Map
            </a>
          ) : null}

          {variant === "suggest" && canEdit && onAdd ? (
            <>
              {days.length > 1 ? (
                <>
                  <label className="sr-only" htmlFor={`add-place-day-${conciergePlaceKey(place)}`}>
                    Day for {place.name}
                  </label>
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
                </>
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
                {added ? "Added" : adding ? "Adding…" : "Add"}
              </button>
            </>
          ) : null}

          {variant === "itinerary" && canEdit && !removed && onMove && days.length > 1 ? (
            <>
              <label className="sr-only" htmlFor={`move-place-day-${place.itemId ?? conciergePlaceKey(place)}`}>
                Move {place.name} to day
              </label>
              <select
                id={`move-place-day-${place.itemId ?? conciergePlaceKey(place)}`}
                value={dayId}
                disabled={moving}
                aria-busy={moving}
                onChange={(e) => {
                  const next = e.target.value
                  setDayId(next)
                  if (next && next !== place.dayId) onMove(place, next)
                }}
                className={`${compactSelectClass} min-w-[7rem]`}
              >
                {days.map((day, i) => (
                  <option key={day.id} value={day.id}>
                    {dayLabel(day, i)}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {variant === "itinerary" && canEdit && !removed && onRemove ? (
            confirmRemove ? (
              <>
                <button
                  type="button"
                  onClick={() => onRemove(place)}
                  aria-label={`Confirm remove ${place.name}`}
                  className={dangerChipBtnClass}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  Remove it
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className={ghostBtnClass}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                aria-label={`Remove ${place.name} from the itinerary`}
                className={quietBtnClass}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                Remove
              </button>
            )
          ) : null}
        </div>
      </div>
    </li>
  )
}
