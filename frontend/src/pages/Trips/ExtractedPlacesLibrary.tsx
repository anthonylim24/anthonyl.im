import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { useLatestCallback } from "@/hooks/useLatestCallback"
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
  const readToken = useLatestCallback(getToken)
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
      startTransition(() => {
        setForeign(collectCatalogPlaces(trips))
        setLoading(false)
      })
    } catch {
      startTransition(() => {
        setForeign([])
        setLoading(false)
      })
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
    <section aria-label="Extracted places" {...sx(styles.extractedSection)} aria-busy={loading || isRefreshing}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        {...sx(quietBtnClass, styles.chipBtnFullSmAuto, styles.justifyBetween)}
      >
        <span>
          Extracted places
          {total > 0 ? <span {...sx(styles.ml1_5, styles.fontNormal, mutedInkClass)}>{total}</span> : null}
        </span>
        <ChevronDown
          {...sx(styles.icon35, styles.transitionTransform, open ? styles.rotate180 : null)}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>

      {open && (
        <div {...sx(styles.extractedPanel)}>
          <div {...sx(styles.extractedToolbar)}>
            <p {...sx(styles.textXs, styles.leadingSnug, mutedInkClass)}>
              Instagram places, grouped by trip, city, then neighborhood.
            </p>
            {trip.days.length > 0 && (
              <label {...sx(styles.extractedCheckboxLabel)}>
                <span {...sx(styles.shrink0, styles.text11, styles.uppercaseTrackingWide, mutedInkClass)}>Add to</span>
                <select
                  value={targetDayId}
                  disabled={locked}
                  onChange={(e) => setTargetDayId(e.target.value)}
                  {...sx(styles.minW0, styles.flex1, styles.w44, compactSelectClass)}
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
            <p {...sx(styles.mt2, styles.textXs, mutedInkClass)} role="status">
              Loading places…
            </p>
          ) : total === 0 ? (
            <p {...sx(styles.mt2, styles.textXs, mutedInkClass)}>
              None yet. Extract a post on a day below, then add it.
            </p>
          ) : (
            <div {...sx(styles.extractedGroupsList)}>
              {groups.map((group) => (
                <article key={group.tripId}>
                  <h3 {...sx(styles.textSm, styles.fontSemibold, styles.inkPrimary, wrapAnywhereClass)}>
                    {group.tripName}
                    {group.tripId === trip.id ? (
                      <span {...sx(styles.ml1_5, styles.text11, styles.fontMedium, mutedInkClass)}>This trip</span>
                    ) : null}
                  </h3>
                  <div {...sx(styles.extractedCityGroups)}>
                    {group.cities.map((city) => (
                      <div key={`${group.tripId}-${city.city}`}>
                        <p {...sx(styles.fontMonoTrips, styles.extractedCityLabel)}>
                          {city.city}
                        </p>
                        {city.neighborhoods.map((hood) => (
                          <div key={`${group.tripId}-${city.city}-${hood.neighborhood}`} {...sx(styles.extractedHoodMt)}>
                            <p {...sx(styles.text11, styles.fontMedium, styles.inkMutedStone, wrapAnywhereClass)}>
                              {hood.neighborhood}
                            </p>
                            <ul {...sx(styles.extractedListDivide, 'trips-extracted-list-divide')}>
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
            <div {...sx(styles.extractedPager)}>
              <p {...sx(styles.text11, mutedInkClass)}>
                {pageStart}–{pageEnd} of {total}
              </p>
              <div {...sx(styles.extractedPagerBtns)}>
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  {...sx(quietBtnClass)}
                >
                  <ChevronLeft {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
                  Prev
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  {...sx(quietBtnClass)}
                >
                  Next
                  <ChevronRight {...sx(styles.iconSm)} strokeWidth={1.5} aria-hidden />
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
    <li {...sx(styles.extractedPlaceRow)}>
      <div {...sx(styles.minW0, styles.flex1)}>
        {place.sourceUrl ? (
          <a
            href={place.sourceUrl}
            target="_blank"
            rel="noreferrer"
            {...sx(styles.extractedPlaceLink)}
          >
            {place.name}
          </a>
        ) : (
          <p {...sx(styles.extractedPlaceLink, styles.truncate)}>{place.name}</p>
        )}
        {meta ? <p {...sx(styles.truncate, styles.text11, mutedInkClass)}>{meta}</p> : null}
      </div>
      {onThisDay ? (
        <span {...sx(styles.shrink0, styles.text11, mutedInkClass)}>Added</span>
      ) : (
        <button
          type="button"
          disabled={adding || !targetDay || locked}
          onClick={onAdd}
          aria-label={onThisTrip ? `Copy ${place.name} to this day` : `Add ${place.name} to this day`}
          {...sx(chipBtnClass)}
        >
          <Plus {...sx(styles.icon35)} strokeWidth={1.5} aria-hidden />
          {onThisTrip ? "Copy" : "Add"}
        </button>
      )}
    </li>
  )
}
