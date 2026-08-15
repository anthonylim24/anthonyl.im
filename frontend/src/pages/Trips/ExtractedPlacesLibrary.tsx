import { useCallback, useEffect, useEffectEvent, useMemo, useState, useTransition } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useGetToken } from "@/lib/safeAuth"
import { formatTripDate } from "./theme"
import { addItem, dayHasPlaceNamed, itemFromExtractedPlace } from "./tripEdits"
import { collectCatalogPlaces, groupCatalogPlaces, type CatalogPlace } from "./placeCatalog"
import { listForeignInstagramTrips } from "./tripsApi"
import type { Trip, TripDay } from "./types"
import {
  chipBtnClass,
  compactSelectClass,
  mutedInkClass,
  quietBtnClass,
  wrapAnywhereClass,
} from "./ui"

const PAGE_SIZE = 20

export function ExtractedPlacesLibrary({
  trip,
  locked = false,
  defaultDayId,
  onDaysChange,
}: {
  trip: Trip
  locked?: boolean
  defaultDayId?: string
  onDaysChange: (fn: (days: TripDay[]) => TripDay[]) => void
}) {
  const getToken = useGetToken()
  const readToken = useEffectEvent(getToken)
  const [isRefreshing, startTransition] = useTransition()
  const [open, setOpen] = useState(() => collectCatalogPlaces([trip]).length > 0)
  const [offset, setOffset] = useState(0)
  const [foreign, setForeign] = useState<CatalogPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [targetDayId, setTargetDayId] = useState(defaultDayId || trip.days[0]?.id || "")
  const [addingId, setAddingId] = useState<string | null>(null)

  useEffect(() => {
    if (defaultDayId && trip.days.some((d) => d.id === defaultDayId)) {
      setTargetDayId(defaultDayId)
    }
  }, [defaultDayId, trip.days])

  const loadForeign = useCallback(async () => {
    setLoading(true)
    try {
      const trips = await listForeignInstagramTrips(readToken, trip.id)
      startTransition(() => setForeign(collectCatalogPlaces(trips)))
    } catch {
      startTransition(() => setForeign([]))
    } finally {
      setLoading(false)
    }
  }, [trip.id, startTransition])

  useEffect(() => {
    void loadForeign()
  }, [loadForeign])

  const all = useMemo(() => {
    const local = collectCatalogPlaces([trip])
    const mine = new Set(local.map((p) => `${p.tripId}:${p.itemId}`))
    return [...local, ...foreign.filter((p) => !mine.has(`${p.tripId}:${p.itemId}`))]
  }, [trip, foreign])

  const total = all.length
  const page = all.slice(offset, offset + PAGE_SIZE)
  const groups = groupCatalogPlaces(page)
  const targetDay = trip.days.find((d) => d.id === targetDayId)
  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + PAGE_SIZE, total)

  useEffect(() => {
    if (offset > 0 && offset >= total) setOffset(0)
  }, [offset, total])

  const handleAdd = (place: CatalogPlace) => {
    if (locked || !targetDay) return
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
    <section aria-label="Extracted places" className="mt-6" aria-busy={loading || isRefreshing}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${quietBtnClass} w-full justify-between sm:w-auto`}
      >
        <span>
          Extracted places
          {total > 0 ? <span className={`ml-1.5 font-normal ${mutedInkClass}`}>{total}</span> : null}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-xs leading-relaxed ${mutedInkClass}`}>
              Instagram places, grouped by trip, city, then neighborhood.
            </p>
            {trip.days.length > 0 && (
              <label className="flex min-h-11 items-center gap-2 sm:min-h-9">
                <span className={`shrink-0 text-[11px] uppercase tracking-[0.14em] ${mutedInkClass}`}>Add to</span>
                <select
                  value={targetDayId}
                  disabled={locked}
                  onChange={(e) => setTargetDayId(e.target.value)}
                  className={`min-w-0 flex-1 sm:w-44 ${compactSelectClass}`}
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

          {loading && total === 0 ? (
            <p className={`mt-2 text-xs ${mutedInkClass}`} role="status">
              Loading places…
            </p>
          ) : total === 0 ? (
            <p className={`mt-2 text-xs ${mutedInkClass}`}>
              None yet. Extract a post on a day below, then add it.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {groups.map((group) => (
                <article key={group.tripId}>
                  <h3 className={`text-sm font-semibold text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
                    {group.tripName}
                    {group.tripId === trip.id ? (
                      <span className={`ml-1.5 text-[11px] font-medium ${mutedInkClass}`}>This trip</span>
                    ) : null}
                  </h3>
                  <div className="mt-1.5 space-y-3">
                    {group.cities.map((city) => (
                      <div key={`${group.tripId}-${city.city}`}>
                        <p className={`font-mono-trips text-[10px] uppercase tracking-[0.16em] ${mutedInkClass}`}>
                          {city.city}
                        </p>
                        {city.neighborhoods.map((hood) => (
                          <div key={`${group.tripId}-${city.city}-${hood.neighborhood}`} className="mt-1">
                            <p className={`text-[11px] font-medium text-stone-600 dark:text-stone-400 ${wrapAnywhereClass}`}>
                              {hood.neighborhood}
                            </p>
                            <ul className="mt-0.5 divide-y divide-stone-200/70 dark:divide-stone-800/70">
                              {hood.places.map((place) => (
                                <CatalogRow
                                  key={`${place.tripId}-${place.itemId}`}
                                  place={place}
                                  currentTrip={trip}
                                  targetDay={targetDay}
                                  adding={addingId === place.itemId}
                                  locked={locked}
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className={`text-[11px] ${mutedInkClass}`}>
                {pageStart}–{pageEnd} of {total}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  className={quietBtnClass}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  className={quietBtnClass}
                >
                  Next
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                </button>
              </div>
            </div>
          )}
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
  locked = false,
  onAdd,
}: {
  place: CatalogPlace
  currentTrip: Trip
  targetDay: TripDay | undefined
  adding: boolean
  locked?: boolean
  onAdd: () => void
}) {
  const onThisDay = targetDay ? dayHasPlaceNamed(targetDay, place.name) : false
  const onThisTrip =
    place.tripId === currentTrip.id &&
    currentTrip.days.some((d) => dayHasPlaceNamed(d, place.name))
  const meta = [place.category, place.address].filter(Boolean).join(" · ")

  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        {place.sourceUrl ? (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={`block truncate text-sm text-stone-900 hover:underline dark:text-stone-100 ${wrapAnywhereClass}`}
          >
            {place.name}
          </a>
        ) : (
          <p className={`truncate text-sm text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>{place.name}</p>
        )}
        {meta ? <p className={`truncate text-[11px] ${mutedInkClass}`}>{meta}</p> : null}
      </div>
      {onThisDay ? (
        <span className={`shrink-0 text-[11px] ${mutedInkClass}`}>Added</span>
      ) : (
        <button
          type="button"
          disabled={adding || !targetDay || locked}
          onClick={onAdd}
          aria-label={onThisTrip ? `Copy ${place.name} to this day` : `Add ${place.name} to this day`}
          className={chipBtnClass}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          {onThisTrip ? "Copy" : "Add"}
        </button>
      )}
    </li>
  )
}
