import { useCallback, useEffect, useMemo, useState } from "react"
import type { GetToken } from "../../../effect/http"
import { approximateArea, shapeCorners, type AreaShape, type LngLat } from "../map/geo"
import type { Trip } from "../types"
import { areaDays, areaFingerprint, areaPoints } from "./areaStops"
import { loadAreaOutline } from "./areasApi"
import type { AreaGeometry, Neighborhood } from "./contract"

export interface AreaOnMap {
  /** The area the traveller asked to see, while it can be drawn. */
  area: Neighborhood | null
  /** What the map draws: the stops' shape at once, OpenStreetMap's outline when it arrives; with the stops named. */
  shape: AreaShape | null
  /** The outline lookup has answered (with an outline or without): `shape` is what stays drawn. */
  settled: boolean
  /** Its stops and its shape's corners, for the camera. */
  framePoints: readonly LngLat[]
  frameKey: string
  show: (area: Neighborhood | null) => void
}

/**
 * One neighborhood on the trip map, from "Show on map". Drawn only while
 * `drawn` (the overview's Neighborhoods tab is open); the choice is kept, so
 * coming back to the tab draws it again.
 */
export function useAreaOnMap(trip: Trip | null, getToken: GetToken, drawn: boolean): AreaOnMap {
  const [picked, setPicked] = useState<Neighborhood | null>(null)
  const days = trip?.days
  const fingerprint = useMemo(() => (days ? areaFingerprint({ days }) : ""), [days])
  const stopDays = useMemo(() => (days && picked ? areaDays({ days }, picked.stopIds) : []), [days, picked])
  const points = useMemo(() => areaPoints(stopDays), [stopDays])
  const pointsKey = points.map((p) => `${p.lat},${p.lng}`).join(";")
  const named = useMemo(
    () => stopDays.flatMap(({ stops }) => stops.map(({ title, location }) => ({ lat: location.lat, lng: location.lng, title: title || location.name }))),
    [stopDays],
  )
  const approx = useMemo(() => approximateArea(points), [points])
  const area = drawn && approx ? picked : null

  const tripId = trip?.id
  const areaId = area?.id
  const outlineKey = areaId && tripId ? `${tripId}|${fingerprint}|${areaId}` : null
  const [outline, setOutline] = useState<{ key: string; geometry: AreaGeometry | null } | null>(null)
  // A lookup that found nothing is forgotten once the area is hidden, so showing it again asks again.
  if (outlineKey === null && outline !== null && outline.geometry === null) setOutline(null)
  useEffect(() => {
    if (!outlineKey || !tripId || !areaId) return
    const controller = new AbortController()
    void loadAreaOutline(getToken, tripId, fingerprint, areaId, controller.signal).then((geometry) => {
      if (!controller.signal.aborted) setOutline({ key: outlineKey, geometry })
    })
    return () => controller.abort()
  }, [outlineKey, tripId, fingerprint, areaId, getToken])

  const settled = outlineKey !== null && outline?.key === outlineKey
  const found = settled ? outline!.geometry : null
  const shape = useMemo<AreaShape | null>(
    () => (!area || !approx ? null : { ...(found ? { geometry: found, approximate: false } : approx), stops: named }),
    [area, found, approx, named],
  )
  const framePoints = useMemo(() => (shape ? [...points, ...shapeCorners(shape.geometry)] : []), [shape, points])
  const frameKey = shape && area ? `area|${area.id}|${shape.approximate ? "near" : "osm"}|${pointsKey}` : ""
  const show = useCallback((next: Neighborhood | null) => setPicked(next), [])
  return { area, shape, settled, framePoints, frameKey, show }
}
