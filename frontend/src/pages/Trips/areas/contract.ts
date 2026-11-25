import type { MultiPolygon, Polygon } from "geojson"
import type { PlacePhoto } from "../ideas/contract"

// The Neighborhoods tab's seam with the server (`server/src/trips/neighborhoods.ts`).

/** GET /api/trips/:id/neighborhoods, one area. Computed on demand and cached; never written to the trip. */
export interface Neighborhood {
  /** Stable for the same name and city. */
  id: string
  name: string
  /** The name in the local language and script, when it differs ("성수동"). */
  localName?: string
  /** `localName`'s language as a BCP 47 tag ("ko", "ja", "zh-TW"), for its `lang`. */
  localLang?: string
  /** Empty when neither the model nor the plan named one. */
  city: string
  /** One plain sentence about the place: what kind of place it is and where it lies. */
  summary: string
  /** The trip's stops in it, in trip order. Read against the live trip: a stop deleted since is simply gone. */
  stopIds: string[]
  /** At most one, credited. None when Google has nothing that is surely the area or one of its stops. */
  photos: PlacePhoto[]
  /** Set when the photo is of one of the area's stops, not the area: that stop's name. */
  photoOf?: string
}

/** GET /api/trips/:id/neighborhoods/:areaId/outline: OpenStreetMap's boundary, or null when there is none worth drawing. */
export type AreaGeometry = Polygon | MultiPolygon
