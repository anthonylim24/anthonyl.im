import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'
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
  onMap,
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
  onMap?: (place: ConciergePlace) => void
}) {
  if (places.length === 0 || days.length === 0) return null
  const fallbackDay = days.some((d) => d.id === defaultDayId) ? defaultDayId : days[0]?.id
  return (
    <ul {...sx(styles.conciergeList)} aria-label={variant === "suggest" ? "Suggested places" : "Places on this trip"}>
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
          onMap={onMap}
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
  onMap,
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
  onMap?: (place: ConciergePlace) => void
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
  const canOpenMapMode = Boolean(onMap && (place.itemId || (place.lat != null && place.lng != null)))

  return (
    <li {...sx(styles.conciergeCardLi)}>
      <ConciergePhotoThumb
        name={place.name}
        city={city}
        lat={place.lat}
        lng={place.lng}
        onOpen={() => onPhotos(place)}
      />
      <div {...sx(styles.conciergeCardBody)}>
        <div {...sx(styles.conciergeCardHeader)}>
          <MapPin {...sx(styles.iconPinMt)} strokeWidth={1.75} aria-hidden />
          <div {...sx(styles.minW0, styles.flex1)}>
            {maps ? (
              <a
                href={maps.href}
                target="_blank"
                rel="noopener noreferrer"
                {...sx(styles.textSm, styles.fontMedium, focusRingClass, wrapAnywhereClass)}
              >
                {place.name}
              </a>
            ) : (
              <p {...sx(styles.conciergeTitle, wrapAnywhereClass)}>{place.name}</p>
            )}
            {meta ? <p {...sx(mutedInkClass, wrapAnywhereClass)}>{meta}</p> : null}
            {place.notes ? (
              <p {...sx(styles.conciergeNotes12, wrapAnywhereClass)}>{place.notes}</p>
            ) : null}
            {removed ? <p {...sx(styles.mt1, styles.text12, mutedInkClass)}>Removed from the itinerary.</p> : null}
          </div>
        </div>

        <div {...sx(styles.conciergeActionsRow)}>
          <button
            type="button"
            onClick={() => onPhotos(place)}
            aria-label={`Photos of ${place.name}`}
            {...sx(quietBtnClass)}
          >
            <ImageIcon {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
            Photos
          </button>
          {variant === "suggest" && maps ? (
            <a
              href={maps.href}
              target="_blank"
              rel="noopener noreferrer"
              {...sx(quietBtnClass, styles.quietBtnMapSm)}
              aria-label={maps.label}
            >
              <Globe2 {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
              Map
            </a>
          ) : null}
          {variant === "itinerary" && canOpenMapMode ? (
            <button
              type="button"
              onClick={() => onMap?.(place)}
              {...sx(quietBtnClass)}
              aria-label={`Open ${place.name} in Map Mode`}
            >
              <Globe2 {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
              Map
            </button>
          ) : null}

          {variant === "suggest" && canEdit && onAdd ? (
            <>
              {days.length > 1 ? (
                <>
                  <label {...sx(styles.srOnly)} htmlFor={`add-place-day-${conciergePlaceKey(place)}`}>
                    Day for {place.name}
                  </label>
                  <select
                    id={`add-place-day-${conciergePlaceKey(place)}`}
                    value={dayId}
                    onChange={(e) => setDayId(e.target.value)}
                    disabled={added || adding}
                    {...sx(compactSelectClass, styles.minW0, styles.flex1)}
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
                {...sx(accentChipBtnClass)}
              >
                <Plus {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
                {added ? "Added" : adding ? "Adding…" : "Add"}
              </button>
            </>
          ) : null}

          {variant === "itinerary" && canEdit && !removed && onMove && days.length > 1 ? (
            <>
              <label {...sx(styles.srOnly)} htmlFor={`move-place-day-${place.itemId ?? conciergePlaceKey(place)}`}>
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
                {...sx(compactSelectClass, styles.minW28)}
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
                  {...sx(dangerChipBtnClass)}
                >
                  <Trash2 {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
                  Remove it
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} {...sx(ghostBtnClass)}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                aria-label={`Remove ${place.name} from the itinerary`}
                {...sx(quietBtnClass)}
              >
                <Trash2 {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
                Remove
              </button>
            )
          ) : null}
        </div>
      </div>
    </li>
  )
}
