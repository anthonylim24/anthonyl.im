import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { IgIcon } from "../Korea/IgIcon"
import { formatTripDate } from "./theme"
import { addItem, dayHasPlaceNamed, itemFromExtractedPlace } from "./tripEdits"
import { listPlaceCatalog, type CatalogPlace, type CatalogTripGroup } from "./tripsApi"
import type { Trip, TripDay } from "./types"
import {
  chipBtnClass,
  compactSelectClass,
  eyebrowClass,
  labelClass,
  mutedInkClass,
  quietBtnClass,
  wrapAnywhereClass,
} from "./ui"

const PAGE_SIZE = 20

export function ExtractedPlacesLibrary({
  trip,
  defaultDayId,
  onDaysChange,
}: {
  trip: Trip
  defaultDayId?: string
  onDaysChange: (fn: (days: TripDay[]) => TripDay[]) => void
}) {
  const getToken = useGetToken()
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [groups, setGroups] = useState<CatalogTripGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [targetDayId, setTargetDayId] = useState(defaultDayId || trip.days[0]?.id || "")
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    if (defaultDayId && trip.days.some((d) => d.id === defaultDayId)) {
      setTargetDayId(defaultDayId)
    }
  }, [defaultDayId, trip.days])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listPlaceCatalog(getToken, { offset, limit: PAGE_SIZE })
      setGroups(res.groups)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load extracted places.")
    } finally {
      setLoading(false)
    }
  }, [getToken, offset])

  useEffect(() => {
    void load()
  }, [load])

  const targetDay = trip.days.find((d) => d.id === targetDayId)
  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + PAGE_SIZE, total)

  const handleAdd = (place: CatalogPlace) => {
    if (!targetDay) return
    if (dayHasPlaceNamed(targetDay, place.name)) return
    setAddingId(place.itemId)
    onDaysChange((days) =>
      addItem(
        days,
        targetDay.id,
        itemFromExtractedPlace({
          name: place.name,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
          sourceUrl: place.sourceUrl,
        }),
      ),
    )
    setAddingId(null)
  }

  return (
    <section aria-labelledby="extracted-places-heading" className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className={eyebrowClass}>From Instagram</p>
          <h2
            id="extracted-places-heading"
            className="mt-1 text-lg font-semibold text-stone-900 dark:text-stone-100"
          >
            Extracted places
          </h2>
          <p className={`mt-1 max-w-[52ch] text-sm leading-relaxed ${mutedInkClass}`}>
            Every place pulled from a Reel or post, grouped by trip, then city, then neighborhood.
          </p>
        </div>
        {trip.days.length > 0 && (
          <label className="block sm:min-w-[12rem]">
            <span className={labelClass}>Add to</span>
            <select
              value={targetDayId}
              onChange={(e) => setTargetDayId(e.target.value)}
              className={`mt-1 w-full ${compactSelectClass}`}
            >
              {trip.days.map((day, i) => (
                <option key={day.id} value={day.id}>
                  Day {i + 1}
                  {day.title?.trim() ? ` · ${day.title}` : ""} · {formatTripDate(day.date, trip.timezone)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p className={`mt-4 text-sm ${mutedInkClass}`} role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className={`mt-4 text-sm ${mutedInkClass}`} role="status">
          Loading places…
        </p>
      ) : total === 0 ? (
        <p className={`mt-4 text-sm ${mutedInkClass}`}>
          No Instagram places on any trip yet. Extract a post from a day below, then add it.
        </p>
      ) : (
        <div className="mt-5 space-y-8">
          {groups.map((group) => (
            <article key={group.tripId}>
              <h3 className={`text-base font-semibold text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                {group.tripName}
                {group.tripId === trip.id ? (
                  <span className={`ml-2 text-xs font-medium ${mutedInkClass}`}>This trip</span>
                ) : null}
              </h3>
              <div className="mt-3 space-y-5">
                {group.cities.map((city) => (
                  <div key={`${group.tripId}-${city.city}`}>
                    <p className={`font-mono-trips text-[11px] uppercase tracking-[0.16em] ${mutedInkClass}`}>
                      {city.city}
                    </p>
                    {city.neighborhoods.map((hood) => (
                      <div key={`${group.tripId}-${city.city}-${hood.neighborhood}`} className="mt-2">
                        <p className={`text-xs font-medium text-stone-700 dark:text-stone-300 ${wrapAnywhereClass}`}>
                          {hood.neighborhood}
                        </p>
                        <ul className="mt-1.5 divide-y divide-stone-200/80 dark:divide-stone-800/80">
                          {hood.places.map((place) => (
                            <CatalogRow
                              key={`${place.tripId}-${place.itemId}`}
                              place={place}
                              currentTrip={trip}
                              targetDay={targetDay}
                              adding={addingId === place.itemId}
                              onAdd={() => handleAdd(place)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs ${mutedInkClass}`}>
            {pageStart}–{pageEnd} of {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              className={quietBtnClass}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Previous
            </button>
            <button
              type="button"
              disabled={!groups.length || offset + PAGE_SIZE >= total || loading}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
              className={quietBtnClass}
            >
              Next
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function CatalogRow({
  place,
  currentTrip,
  targetDay,
  adding,
  onAdd,
}: {
  place: CatalogPlace
  currentTrip: Trip
  targetDay: TripDay | undefined
  adding: boolean
  onAdd: () => void
}) {
  const onThisDay = targetDay ? dayHasPlaceNamed(targetDay, place.name) : false
  const onThisTrip =
    place.tripId === currentTrip.id &&
    currentTrip.days.some((d) => dayHasPlaceNamed(d, place.name))

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
          {place.name}
        </p>
        <p className={`mt-0.5 flex items-start gap-1.5 text-xs ${mutedInkClass}`}>
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className={wrapAnywhereClass}>
            {[place.category, place.address].filter(Boolean).join(" · ") || "No address yet"}
          </span>
        </p>
        {place.sourceUrl && (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={`mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs ${mutedInkClass} hover:underline`}
          >
            <IgIcon className="h-3 w-3" aria-hidden />
            Source post
          </a>
        )}
      </div>
      {onThisDay ? (
        <span className={`text-xs ${mutedInkClass}`}>On this day</span>
      ) : (
        <button type="button" disabled={adding || !targetDay} onClick={onAdd} className={chipBtnClass}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          {onThisTrip ? "Copy to this day" : "Add to this day"}
        </button>
      )}
    </li>
  )
}
