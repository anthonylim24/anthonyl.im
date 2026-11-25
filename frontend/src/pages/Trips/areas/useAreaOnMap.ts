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
  /** What the map draws: the stops' shape at once, OpenStreetMap's outline when it arrives. */
  shape: AreaShape | null
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
  const points = useMemo(() => (days && picked ? areaPoints(areaDays({ days }, picked.stopIds)) : []), [days, picked])
  const pointsKey = points.map((p) => `${p.lat},${p.lng}`).join(";")
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the same stops in the same places are the same shape
  const approx = useMemo(() => approximateArea(points), [pointsKey])
  const area = drawn && approx ? picked : null

  const tripId = trip?.id
  const outlineKey = area && tripId ? `${tripId}|${fingerprint}|${area.id}` : null
  const [outline, setOutline] = useState<{ key: string; geometry: AreaGeometry | null } | null>(null)
  useEffect(() => {
    if (!outlineKey || !tripId || !area) return
    const controller = new AbortController()
    void loadAreaOutline(getToken, tripId, fingerprint, area.id, controller.signal).then((geometry) => {
      if (!controller.signal.aborted) setOutline({ key: outlineKey, geometry })
    })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `outlineKey` names the trip, its stops and the area
  }, [outlineKey, getToken])

  const found = outline?.key === outlineKey ? outline.geometry : null
  const shape = useMemo<AreaShape | null>(() => (!area ? null : found ? { geometry: found, approximate: false } : approx), [area, found, approx])
  const framePoints = useMemo(() => (shape ? [...points, ...shapeCorners(shape.geometry)] : []), [shape, points])
  const frameKey = shape && area ? `area|${area.id}|${shape.approximate ? "near" : "osm"}|${pointsKey}` : ""
  const show = useCallback((next: Neighborhood | null) => setPicked(next), [])
  return { area, shape, framePoints, frameKey, show }
}
