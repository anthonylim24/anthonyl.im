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
  city: string
  /** One or two plain sentences: what the area is like, and what the trip does there. */
  summary: string
  /** The trip's stops in it, in trip order. Read against the live trip: a stop deleted since is simply gone. */
  stopIds: string[]
  /** Up to three, each credited. Often none: a photo is shown only when Google's match is surely the area. */
  photos: PlacePhoto[]
}

/** GET /api/trips/:id/neighborhoods/:areaId/outline: OpenStreetMap's boundary, or null when there is none worth drawing. */
export type AreaGeometry = Polygon | MultiPolygon
