import type { MultiPolygon, Polygon } from "geojson"

// The Neighborhoods tab's seam with the server (`server/src/trips/neighborhoods.ts`).

export type { Neighborhood } from "../../../../../server/src/trips/apiShapes"

/** GET /api/trips/:id/neighborhoods/:areaId/outline: OpenStreetMap's boundary, or null when there is none worth drawing. */
export type AreaGeometry = Polygon | MultiPolygon
