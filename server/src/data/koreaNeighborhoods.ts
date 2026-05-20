// Lookup table for the neighborhood names listed in koreaSnapshot.ts → days.
// Coordinates + polygons live in the sibling JSON (`polygons/koreaNeighborhoods.json`)
// emitted by `scripts/buildKoreaNeighborhoods.ts`. Rerun that script if the
// snapshot adds neighborhoods or the upstream HangJeongDong dataset is bumped.
//
// Sources (all free, all redistributed with attribution):
//   - Administrative dong boundaries: Statistics Korea (통계청 SGIS) via
//     github.com/vuski/admdongkor → github.com/raqoon886/Local_HangJeongDong.
//     Public Data Act §3 — commercial use with attribution.
//   - Landmark polygons (Seoul Forest, Bongeunsa Temple): OSM via
//     Nominatim. © OpenStreetMap contributors, ODbL.
//   - Synthetic 32-vertex circles: anchor lat/lng + radiusM, used for
//     landmarks the upstream datasets don't have a polygon for
//     (Cheongsapo, Mipo, Seokchon Lake, etc.).

import polygonsJson from "./polygons/koreaNeighborhoods.json" with { type: "json" }

export interface NeighborhoodCenter {
  name: string
  lat: number
  lng: number
  /** Highlight radius in meters — used by clients that fall back to a
   *  flat disc render when the polygon is unavailable. */
  radiusM: number
  /** Closed outer ring as [lng, lat][] (GeoJSON convention; first === last).
   *  Drawn by Map Mode as a terrain-conforming polygon highlight. */
  polygon: [number, number][]
}

interface PolygonEntry extends NeighborhoodCenter {
  source: string
  vertexCount: number
}

// Build the lookup at import time. Each entry's `name` becomes the
// canonical key the snapshot resolves against.
const TABLE: Record<string, NeighborhoodCenter> = {}
for (const e of polygonsJson as PolygonEntry[]) {
  TABLE[e.name] = {
    name: e.name,
    lat: e.lat,
    lng: e.lng,
    radiusM: e.radiusM,
    polygon: e.polygon as [number, number][],
  }
}

// Day snapshots write neighborhood names with optional time-of-day
// suffixes ("Hannam (AM)") for readability. Strip them so the lookup
// still hits the canonical entry.
function canonicalize(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim()
}

// One historical alias kept for the airport — the snapshot still uses
// "ICN" but the polygon file is keyed by the upstream English name.
const ALIASES: Record<string, string> = {
  ICN: "Incheon Airport",
}

/** Resolve a day-snapshot list of neighborhood names to coordinate centers
 *  (plus polygons). Drops names not in the table (e.g. a one-off rural site
 *  the user added by hand). */
export function resolveNeighborhoodCenters(names: string[]): NeighborhoodCenter[] {
  const seen = new Set<string>()
  const out: NeighborhoodCenter[] = []
  for (const raw of names) {
    const canon = canonicalize(raw)
    const key = ALIASES[canon] ?? canon
    const center = TABLE[key]
    if (!center || seen.has(key)) continue
    seen.add(key)
    out.push(center)
  }
  return out
}
