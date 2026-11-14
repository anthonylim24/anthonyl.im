import { useState } from "react"
import { ArrowUpRight, CalendarDays, Check, Footprints, Plus, Star } from "lucide-react"
import {
  conciergePlaceKey,
  placeCanBeAdded,
  type ConciergePlace,
} from "../../lib/conciergeGrounding"
import { externalMapsLink } from "../../lib/externalMaps"
import { ConciergePhotoThumb } from "./ConciergePhoto"
import { dayShort } from "./conciergeProposal"
import { itemIcon, titleCase } from "./meta"
import type { TripDay } from "./types"
import { a } from "./atlas.stylex"
import { c } from "./chat.stylex"
import { sx } from "@/styles/merge"

export interface AddedPlace {
  dayId: string
  itemId: string
  time?: string
}

/** "9 min walk from MAAT", or a distance once it stops being a walk. */
export function walkLine(walk: NonNullable<ConciergePlace["walk"]>): string {
  const from = walk.from === "you" ? "you" : walk.from
  if (walk.meters > 2500) return `${(walk.meters / 1000).toFixed(1)} km from ${from}`
  return `${walk.minutes} min walk from ${from}`
}

/** "Open Fri 12:00–22:30" / "Closed Sun" / "Fri 12:00–22:30". */
export function hoursLine(place: ConciergePlace): { text: string; state: "open" | "closed" | "unknown" } | null {
  if (!place.hours) return null
  const day = place.hoursDay ? `${place.hoursDay} ` : ""
  if (/^closed$/i.test(place.hours)) return { text: `Closed ${place.hoursDay ?? "that day"}`, state: "closed" }
  if (place.open === false) return { text: `Closed at ${place.time ?? "that time"} · ${day}${place.hours}`, state: "closed" }
  if (place.open === true) return { text: `Open ${day}${place.hours.replace(/^Open /, "")}`, state: "open" }
  return { text: `${day}${place.hours}`, state: "unknown" }
}

export function ConciergePlaceCards({
  places,
  days,
  defaultDayId,
  city,
  added,
  addingKey,
  canEdit,
  onAdd,
  onUndo,
  onPhotos,
  onShow,
}: {
  places: ConciergePlace[]
  days: TripDay[]
  defaultDayId?: string
  city?: string
  /** Cards already added to the trip from this reply, by card key. */
  added: Record<string, AddedPlace>
  addingKey: string | null
  canEdit: boolean
  onAdd: (place: ConciergePlace, dayId: string) => void
  onUndo?: (place: ConciergePlace) => void
  onPhotos: (place: ConciergePlace, url: string | null) => void
  onShow?: (added: AddedPlace) => void
}) {
  if (places.length === 0 || days.length === 0) return null
  const fallbackDay = days.some((d) => d.id === defaultDayId) ? defaultDayId : days[0]?.id
  return (
    <ul {...sx(c.cardList)} aria-label="Suggested places">
      {places.map((place) => {
        const key = conciergePlaceKey(place)
        return (
          <ConciergePlaceCard
            key={key}
            place={place}
            days={days}
            city={city}
            defaultDayId={place.dayId && days.some((d) => d.id === place.dayId) ? place.dayId : fallbackDay}
            added={added[key]}
            adding={addingKey === key}
            canEdit={canEdit}
            onAdd={onAdd}
            onUndo={onUndo}
            onPhotos={onPhotos}
            onShow={onShow}
          />
        )
      })}
    </ul>
  )
}

function ConciergePlaceCard({
  place,
  days,
  city,
  defaultDayId,
  added,
  adding,
  canEdit,
  onAdd,
  onUndo,
  onPhotos,
  onShow,
}: {
  place: ConciergePlace
  days: TripDay[]
  city?: string
  defaultDayId?: string
  added?: AddedPlace
  adding: boolean
  canEdit: boolean
  onAdd: (place: ConciergePlace, dayId: string) => void
  onUndo?: (place: ConciergePlace) => void
  onPhotos: (place: ConciergePlace, url: string | null) => void
  onShow?: (added: AddedPlace) => void
}) {
  const [dayId, setDayId] = useState(defaultDayId ?? days[0]?.id ?? "")
  const addable = placeCanBeAdded(place)
  const day = days.find((d) => d.id === dayId)
  // The suggested time belongs to the day it was suggested for.
  const time = place.time && place.dayId === dayId ? place.time : undefined
  const slot = day ? `${dayShort(day)}${time ? ` · ${time}` : ""}` : ""
  const addedDay = added ? days.find((d) => d.id === added.dayId) : undefined
  const maps = externalMapsLink(place)
  const hours = hoursLine(place)
  const Icon = itemIcon("place", place.category)
  const kind = place.category && place.category !== "venue" && place.category !== "other" ? titleCase(place.category) : null

  return (
    <li {...sx(c.card)}>
      <div {...sx(c.cardTop)}>
        <ConciergePhotoThumb
          name={place.name}
          city={city}
          lat={place.lat}
          lng={place.lng}
          compact
          fallback={<Icon {...sx(c.icon22)} strokeWidth={1.5} />}
          onOpen={(url) => onPhotos(place, url)}
        />
        <div {...sx(c.cardBody)}>
          <p {...sx(c.cardTitle)}>{place.name}</p>
          {place.rating != null || place.price || kind ? (
            <p {...sx(c.cardMeta)}>
              {place.rating != null ? (
                <span {...sx(c.cardRating)}>
                  <Star {...sx(c.star)} strokeWidth={0} aria-hidden />
                  <span>
                    {place.rating.toFixed(1)}
                    <span {...sx(a.srOnly)}> out of 5 on Google Maps</span>
                  </span>
                </span>
              ) : null}
              {place.rating != null && (place.price || kind) ? <span {...sx(c.cardSep)} aria-hidden>·</span> : null}
              {place.price ? <span aria-label={`Price level ${place.price.length} of 4`}>{place.price}</span> : null}
              {place.price && kind ? <span {...sx(c.cardSep)} aria-hidden>·</span> : null}
              {kind ? <span>{kind}</span> : null}
            </p>
          ) : place.address ? (
            <p {...sx(c.cardMeta)}>{place.address}</p>
          ) : null}
          {place.walk ? (
            <p {...sx(c.cardWalk)}>
              <Footprints {...sx(c.icon12)} strokeWidth={1.75} aria-hidden />
              {walkLine(place.walk)}
            </p>
          ) : null}
          {hours ? (
            <p {...sx(c.cardHours, hours.state === "closed" ? c.hoursClosed : undefined)}>
              <span {...sx(c.dot, hours.state === "open" ? c.dotOpen : hours.state === "closed" ? c.dotClosed : undefined)} aria-hidden />
              {hours.text}
            </p>
          ) : null}
        </div>
      </div>

      {added ? (
        <div {...sx(c.addedRow)} role="status">
          <span {...sx(c.addedChip)}>
            <Check {...sx(c.icon14)} strokeWidth={2} aria-hidden />
            <span {...sx(a.truncate)}>
              Added to {addedDay ? dayShort(addedDay) : "the trip"}
              {added.time ? ` · ${added.time}` : ""}
            </span>
          </span>
          {onShow ? (
            <button type="button" onClick={() => onShow(added)} {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}>
              Show on map
            </button>
          ) : null}
          {canEdit && onUndo ? (
            <button
              type="button"
              onClick={() => onUndo(place)}
              aria-label={`Undo adding ${place.name}`}
              {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : (
        <div {...sx(c.cardActions)}>
          {canEdit ? (
            <>
              <button
                type="button"
                disabled={adding || !addable || !dayId}
                onClick={() => onAdd(place, dayId)}
                aria-busy={adding}
                aria-label={adding ? `Adding ${place.name}` : `Add ${place.name} to ${slot}`}
                {...sx(a.btn, a.btnSm, a.btnPrimary, c.action, c.actionGrow)}
              >
                <Plus {...sx(c.icon14)} strokeWidth={2} aria-hidden />
                <span {...sx(a.truncate)}>{adding ? "Adding…" : `Add to ${slot}`}</span>
              </button>
              {days.length > 1 ? (
                <span {...sx(c.dayPick)} title="Choose another day">
                  <CalendarDays {...sx(c.icon16)} strokeWidth={1.75} aria-hidden />
                  <select
                    aria-label={`Day for ${place.name}`}
                    value={dayId}
                    disabled={adding}
                    onChange={(e) => setDayId(e.target.value)}
                    {...sx(c.dayPickSelect)}
                  >
                    {days.map((d, i) => (
                      <option key={d.id} value={d.id}>
                        {dayShort(d)}
                        {d.title?.trim() ? ` · ${d.title.trim()}` : ` · Day ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </span>
              ) : null}
            </>
          ) : null}
          {maps ? (
            <a
              href={maps.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${place.name}: ${maps.label}`}
              {...sx(a.btn, a.btnSm, a.btnGhost, c.action, c.actionQuiet)}
            >
              Map
              <ArrowUpRight {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
            </a>
          ) : null}
        </div>
      )}
    </li>
  )
}
