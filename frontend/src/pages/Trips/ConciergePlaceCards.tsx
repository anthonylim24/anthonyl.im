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
import { a } from "./atlas.stylex"
import { c } from "./chat.stylex"
import { sx } from "@/styles/merge"

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
    <ul {...sx(c.cardList)} aria-label={variant === "suggest" ? "Suggested places" : "Places on this trip"}>
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
    <li {...sx(c.card)}>
      <ConciergePhotoThumb
        name={place.name}
        city={city}
        lat={place.lat}
        lng={place.lng}
        onOpen={() => onPhotos(place)}
      />
      <div {...sx(c.cardBody)}>
        <div {...sx(c.cardHead)}>
          <MapPin {...sx(c.pin)} strokeWidth={1.75} aria-hidden />
          <div {...sx(c.cardHeadText)}>
            {maps ? (
              <a
                href={maps.href}
                target="_blank"
                rel="noopener noreferrer"
                {...sx(c.cardTitle, c.cardTitleLink)}
              >
                {place.name}
              </a>
            ) : (
              <p {...sx(c.cardTitle)}>{place.name}</p>
            )}
            {meta ? <p {...sx(c.cardMeta)}>{meta}</p> : null}
            {place.notes ? (
              <p {...sx(c.cardNotes)}>{place.notes}</p>
            ) : null}
            {removed ? <p {...sx(c.cardMeta)}>Removed from the itinerary.</p> : null}
          </div>
        </div>

        <div {...sx(c.cardActions)}>
          <button
            type="button"
            onClick={() => onPhotos(place)}
            aria-label={`Photos of ${place.name}`}
            {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}
          >
            <ImageIcon {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
            Photos
          </button>
          {variant === "suggest" && maps ? (
            <a
              href={maps.href}
              target="_blank"
              rel="noopener noreferrer"
              {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}
              aria-label={maps.label}
            >
              <Globe2 {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
              Map
            </a>
          ) : null}
          {variant === "itinerary" && canOpenMapMode ? (
            <button
              type="button"
              onClick={() => onMap?.(place)}
              {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}
              aria-label={`Open ${place.name} in Map Mode`}
            >
              <Globe2 {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
              Map
            </button>
          ) : null}

          {variant === "suggest" && canEdit && onAdd ? (
            <>
              {days.length > 1 ? (
                <>
                  <label {...sx(a.srOnly)} htmlFor={`add-place-day-${conciergePlaceKey(place)}`}>
                    Day for {place.name}
                  </label>
                  <select
                    id={`add-place-day-${conciergePlaceKey(place)}`}
                    value={dayId}
                    onChange={(e) => setDayId(e.target.value)}
                    disabled={added || adding}
                    {...sx(c.daySelect, c.daySelectGrow)}
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
                {...sx(a.btn, a.btnSm, c.action, added ? c.actionOk : a.btnPrimary)}
              >
                <Plus {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
                {added ? "Added" : adding ? "Adding…" : "Add"}
              </button>
            </>
          ) : null}

          {variant === "itinerary" && canEdit && !removed && onMove && days.length > 1 ? (
            <>
              <label {...sx(a.srOnly)} htmlFor={`move-place-day-${place.itemId ?? conciergePlaceKey(place)}`}>
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
                {...sx(c.daySelect, c.daySelectMove)}
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
                  {...sx(a.btn, a.btnSm, a.btnDanger, c.action)}
                >
                  <Trash2 {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
                  Remove it
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} {...sx(a.btn, a.btnSm, a.btnGhost, c.action)}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                aria-label={`Remove ${place.name} from the itinerary`}
                {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}
              >
                <Trash2 {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
                Remove
              </button>
            )
          ) : null}
        </div>
      </div>
    </li>
  )
}
