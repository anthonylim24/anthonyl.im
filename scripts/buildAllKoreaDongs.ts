#!/usr/bin/env bun
// Build a compact "every dong in Seoul + Busan" dataset for the Map
// Mode tooltip. Source: HangJeongDong (Statistics Korea), vendored
// offline at /tmp/poly/{seoul,busan}.geojson.
//
// Per-entry simplification: aggressive enough that the JSON ships
// quickly over the wire, conservative enough that the polygon is still
// a faithful boundary for point-in-polygon tooltip lookups (~30m
// horizontal error is invisible at the camera zoom levels we use).
//
// Output format (compact for wire-cost):
//   {
//     "dongs": [
//       { "n": "강남구 압구정동", "p": [lng,lat,lng,lat,...], "b": [minLng,minLat,maxLng,maxLat] },
//       …
//     ]
//   }
// - `n`: short display name (sgg + dong, sidonm omitted because we
//   only ship Seoul + Busan and the sgg disambiguates).
// - `p`: flat lng/lat pairs. Ring is closed (first pair === last pair).
// - `b`: bounding box, used by the client to skip ~95% of polygons per
//   pointer-move event before running the full point-in-polygon test.

import simplify from "@turf/simplify"
import booleanValid from "@turf/boolean-valid"
import { polygon as turfPolygon } from "@turf/helpers"

type LngLat = [number, number]

interface DongEntry {
  n: string
  p: number[]
  b: [number, number, number, number]
}

function largestOuterRing(geo: GeoJSON.Geometry): LngLat[] | null {
  if (geo.type === "Polygon") return geo.coordinates[0] as LngLat[]
  if (geo.type === "MultiPolygon") {
    const rings = geo.coordinates.map((p) => p[0] as LngLat[])
    rings.sort((a, b) => b.length - a.length)
    return rings[0] ?? null
  }
  return null
}

/** Simplify a ring to ≤ targetVerts using Turf's Visvalingam-Whyatt.
 *  Binary-search the tolerance to land near the target count. */
function simplifyRing(ring: LngLat[], targetVerts: number): LngLat[] {
  if (ring.length <= targetVerts) return ring
  const f: any = turfPolygon([ring])
  let lo = 0.0001
  let hi = 0.01
  let best = ring
  for (let iter = 0; iter < 8; iter++) {
    const mid = (lo + hi) / 2
    const s = simplify(f, { tolerance: mid, highQuality: true, mutate: false }) as any
    const simplified = s.geometry.coordinates[0] as LngLat[]
    if (simplified.length > targetVerts) {
      lo = mid
    } else {
      hi = mid
      best = simplified
    }
  }
  return best
}

function bbox(ring: LngLat[]): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLng, minLat, maxLng, maxLat]
}

/** Strip "서울특별시 " / "부산광역시 " prefix from the property's full
 *  name. We only ship dongs from these two cities so the prefix is
 *  redundant and bloats the JSON. */
function shortName(admNm: string): string {
  return admNm.replace(/^(서울특별시|부산광역시)\s+/, "")
}

async function loadFc(path: string): Promise<GeoJSON.FeatureCollection> {
  return JSON.parse(await Bun.file(path).text())
}

const datasets = [
  "/tmp/poly/seoul.geojson",
  "/tmp/poly/busan.geojson",
]

// Tighter budget than the day-polygons dataset because we ship ALL
// 630+ dongs — every saved vertex matters across the wire.
const VERT_BUDGET = 28
// Coordinate precision: 5 decimals = ~1 m at Korea's latitude. Tooltip
// hit-tests don't need sub-meter accuracy, so we shave a digit and
// reduce the gzipped size by another ~10%.
const COORD_DECIMALS = 5

const out: DongEntry[] = []
let dropped = 0

for (const path of datasets) {
  const fc = await loadFc(path)
  for (const f of fc.features) {
    const adm = (f.properties as { adm_nm?: string })?.adm_nm
    if (!adm) { dropped++; continue }
    let ring = largestOuterRing(f.geometry)
    if (!ring || ring.length < 4) { dropped++; continue }
    if (ring.length > VERT_BUDGET) ring = simplifyRing(ring, VERT_BUDGET)
    // Validate after simplification — Visvalingam can occasionally
    // produce degenerate rings on very small dongs.
    try {
      if (!booleanValid(turfPolygon([ring]) as any)) { dropped++; continue }
    } catch {
      dropped++
      continue
    }
    // Truncate precision + flatten into [lng, lat, lng, lat, …]
    const flat: number[] = new Array(ring.length * 2)
    for (let i = 0; i < ring.length; i++) {
      flat[i * 2 + 0] = +ring[i][0].toFixed(COORD_DECIMALS)
      flat[i * 2 + 1] = +ring[i][1].toFixed(COORD_DECIMALS)
    }
    out.push({ n: shortName(adm), p: flat, b: bbox(ring) })
  }
}

process.stderr.write(
  `built ${out.length} dongs (dropped ${dropped}); avg ${
    (out.reduce((s, e) => s + e.p.length / 2, 0) / out.length).toFixed(1)
  } verts/dong\n`,
)

// Emit JSON minimized — file lives in source so it should be diff-able
// but the bytes-over-wire matter more than human readability here.
console.log(JSON.stringify({ dongs: out }))
