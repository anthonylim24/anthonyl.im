import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useGetToken } from "@/lib/safeAuth"
import { formatTripDate } from "./theme"
import { addItem, dayHasPlaceNamed, itemFromExtractedPlace } from "./tripEdits"
import { collectCatalogPlaces, groupCatalogPlaces, type CatalogPlace } from "./placeCatalog"
import { listForeignInstagramTrips } from "./tripsApi"
import type { Trip, TripDay } from "./types"
import {
  DISPLAY,
  EASE,
  EXIT_FADE,
  REVEAL_DURATION,
  chipBtnClass,
  compactSelectClass,
  displayCardClass,
  dividerClass,
  focusRingClass,
  hintClass,
  mutedInkClass,
  quietBtnClass,
  skeletonClass,
  wrapAnywhereClass,
} from "./ui"

const PAGE_SIZE = 20

function CatalogSkeleton() {
  return (
    <ul className="mt-3 space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-2 py-1.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className={`h-4 w-2/3 ${skeletonClass}`} />
            <div className={`h-3 w-1/3 ${skeletonClass}`} />
          </div>
          <div className={`h-9 w-16 ${skeletonClass}`} />
        </li>
      ))}
    </ul>
  )
}

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
  const reduce = useReducedMotion()
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
      const trips = await listForeignInstagramTrips(getToken, trip.id)
      setForeign(collectCatalogPlaces(trips))
    } catch {
      setForeign([])
    } finally {
      setLoading(false)
    }
  }, [getToken, trip.id])

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
    <section aria-label="Extracted places" className="mt-6">
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
          className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={reduce ? EXIT_FADE : { duration: REVEAL_DURATION, ease: EASE }}
            className="mt-3"
          >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {trip.days.length > 0 && (
              <label className="flex min-h-11 items-center gap-2 sm:min-h-9">
                <span className={`shrink-0 text-[13px] font-medium ${mutedInkClass}`}>Add to</span>
                <select
                  value={targetDayId}
                  disabled={locked}
                  onChange={(e) => setTargetDayId(e.target.value)}
                  className={`min-w-0 flex-1 sm:w-44 ${compactSelectClass}`}
                >
                  {trip.days.map((day, i) => (
                    <option key={day.id} value={day.id}>
                      Day {i + 1}
                      {day.title?.trim() ? ` ${day.title}` : ""}, {formatTripDate(day.date, trip.timezone)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {loading && total === 0 ? (
            <div role="status" aria-label="Loading places">
              <CatalogSkeleton />
            </div>
          ) : total === 0 ? (
            <div className="mt-3">
              <p className="text-sm">No extracted places yet</p>
              <p className={hintClass}>Extract a post on a day, then add it here.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {groups.map((group) => (
                <article key={group.tripId}>
                  <h3 className={`${displayCardClass} ${wrapAnywhereClass}`} style={DISPLAY}>
                    {group.tripName}
                    {group.tripId === trip.id ? (
                      <span className={`ml-1.5 text-[13px] font-medium ${mutedInkClass}`}>This trip</span>
                    ) : null}
                  </h3>
                  <div className="mt-1.5 space-y-3">
                    {group.cities.map((city) => (
                      <div key={`${group.tripId}-${city.city}`}>
                        <p className={`text-[13px] font-medium ${mutedInkClass}`}>{city.city}</p>
                        {city.neighborhoods.map((hood) => (
                          <div key={`${group.tripId}-${city.city}-${hood.neighborhood}`} className="mt-1">
                            <p className={`text-[12px] ${mutedInkClass} ${wrapAnywhereClass}`}>
                              {hood.neighborhood}
                            </p>
                            <ul className={`mt-0.5 ${dividerClass}`}>
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
              <p className={`font-mono-trips text-[11px] ${mutedInkClass}`}>
                {pageStart}-{pageEnd} of {total}
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
          </motion.div>
        )}
      </AnimatePresence>
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
  const category = place.category?.trim()
  const address = place.address?.trim()
  const meta = category && address ? `${category} · ${address}` : category || address || ""

  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        {place.sourceUrl ? (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={`block truncate text-sm hover:underline ${focusRingClass} ${wrapAnywhereClass}`}
          >
            {place.name}
          </a>
        ) : (
          <p className={`truncate text-sm ${wrapAnywhereClass}`}>{place.name}</p>
        )}
        {meta ? <p className={`truncate font-mono-trips text-[11px] ${mutedInkClass}`}>{meta}</p> : null}
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
