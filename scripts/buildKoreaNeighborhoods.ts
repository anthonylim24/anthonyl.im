#!/usr/bin/env bun
// One-shot data builder for Korean neighborhood polygons.
//
// Sources, in priority order:
//   1. Local_HangJeongDong (Statistics Korea 행정동 boundaries, vendored
//      offline at /tmp/poly/{seoul,busan}.geojson).
//   2. OSM Overpass for non-administrative landmarks (Bongeunsa temple,
//      Seoul Forest park).
//   3. Synthetic 32-vertex circle as last resort for landmarks the
//      datasets don't capture (Cheongsapo, Mipo).
//
// For dong sources we union all matched features into one MultiPolygon,
// then explode to the largest outer ring, then Visvalingam-simplify to a
// vertex budget. Validate non-self-intersecting before accepting.
//
// Output: a JSON file the runtime imports — keeps the .ts source legible.

import simplify from "@turf/simplify"
import booleanValid from "@turf/boolean-valid"
import kinks from "@turf/kinks"
import unionFeatureCollection from "@turf/union"
import { feature, featureCollection, multiPolygon, polygon as turfPolygon } from "@turf/helpers"

type LngLat = [number, number]

interface Entry {
  name: string
  lat: number
  lng: number
  radiusM: number
  /** Either a regex source-spec or a literal OSM/synthetic spec. */
  source:
    | { kind: "dong"; pattern: RegExp; region: "seoul" | "busan" }
    | { kind: "osm-way"; id: number }
    | { kind: "osm-relation"; id: number }
    | { kind: "nominatim"; query: string }
    | { kind: "synthetic" }
}

// Anchor data — coordinates + radii preserved from the existing table.
// `source` codifies the falsification reviewer's required multi-feature
// merge rule; each pattern is the final regex against `adm_nm`.
const ENTRIES: Entry[] = [
  { name: "Apgujeong",              lat: 37.5274, lng: 127.0286, radiusM: 600,  source: { kind: "dong", pattern: /^서울특별시 강남구 압구정동$/,           region: "seoul" } },
  { name: "Apgujeong Rodeo",        lat: 37.5275, lng: 127.0397, radiusM: 400,  source: { kind: "dong", pattern: /^서울특별시 강남구 압구정동$/,           region: "seoul" } },
  { name: "Bongeunsa",              lat: 37.5145, lng: 127.0573, radiusM: 250,  source: { kind: "nominatim", query: "Bongeunsa Temple, Gangnam-gu" } },
  { name: "Bukchon",                lat: 37.5826, lng: 126.9836, radiusM: 500,  source: { kind: "dong", pattern: /^서울특별시 종로구 (가회동|삼청동)$/,    region: "seoul" } },
  { name: "Cheongdam",              lat: 37.5237, lng: 127.0500, radiusM: 600,  source: { kind: "dong", pattern: /^서울특별시 강남구 청담동$/,             region: "seoul" } },
  { name: "Cheongdam Luxury Street",lat: 37.5237, lng: 127.0468, radiusM: 350,  source: { kind: "dong", pattern: /^서울특별시 강남구 청담동$/,             region: "seoul" } },
  { name: "COEX",                   lat: 37.5117, lng: 127.0594, radiusM: 350,  source: { kind: "dong", pattern: /^서울특별시 강남구 삼성1동$/,           region: "seoul" } },
  { name: "Dosan",                  lat: 37.5247, lng: 127.0388, radiusM: 350,  source: { kind: "dong", pattern: /^서울특별시 강남구 신사동$/,             region: "seoul" } },
  { name: "Hannam",                 lat: 37.5366, lng: 127.0008, radiusM: 600,  source: { kind: "dong", pattern: /^서울특별시 용산구 한남동$/,             region: "seoul" } },
  { name: "Incheon Airport",        lat: 37.4602, lng: 126.4407, radiusM: 1000, source: { kind: "synthetic" } },
  { name: "Itaewon",                lat: 37.5343, lng: 126.9942, radiusM: 600,  source: { kind: "dong", pattern: /^서울특별시 용산구 이태원\d동$/,         region: "seoul" } },
  { name: "Jamsil",                 lat: 37.5133, lng: 127.1000, radiusM: 700,  source: { kind: "dong", pattern: /^서울특별시 송파구 잠실\d동$/,           region: "seoul" } },
  { name: "Jangheung-myeon",        lat: 37.8167, lng: 126.9333, radiusM: 1500, source: { kind: "synthetic" } },
  { name: "Jongno",                 lat: 37.5704, lng: 126.9831, radiusM: 800,  source: { kind: "dong", pattern: /^서울특별시 종로구 (사직동|삼청동|가회동|이화동|혜화동|종로1.2.3.4가동|종로5.6가동|숭인1동|숭인2동|창신1동|창신2동|창신3동|평창동|부암동|청운효자동)$/, region: "seoul" } },
  { name: "Myeongdong",             lat: 37.5635, lng: 126.9849, radiusM: 500,  source: { kind: "dong", pattern: /^서울특별시 중구 명동$/,                 region: "seoul" } },
  { name: "Samcheong",              lat: 37.5862, lng: 126.9805, radiusM: 400,  source: { kind: "dong", pattern: /^서울특별시 종로구 삼청동$/,             region: "seoul" } },
  { name: "Samseong",               lat: 37.5145, lng: 127.0571, radiusM: 500,  source: { kind: "dong", pattern: /^서울특별시 강남구 삼성\d동$/,           region: "seoul" } },
  { name: "Seochon",                lat: 37.5793, lng: 126.9701, radiusM: 500,  source: { kind: "dong", pattern: /^서울특별시 종로구 청운효자동$/,         region: "seoul" } },
  { name: "Seokchon Lake",          lat: 37.5111, lng: 127.1066, radiusM: 600,  source: { kind: "synthetic" } },
  { name: "Seongsu",                lat: 37.5446, lng: 127.0560, radiusM: 700,  source: { kind: "dong", pattern: /^서울특별시 성동구 성수\d가\d동$/,       region: "seoul" } },
  { name: "Seoul Forest",           lat: 37.5443, lng: 127.0379, radiusM: 500,  source: { kind: "nominatim", query: "Seoul Forest Park" } },
  { name: "Sinsa",                  lat: 37.5198, lng: 127.0265, radiusM: 500,  source: { kind: "dong", pattern: /^서울특별시 강남구 신사동$/,             region: "seoul" } },
  { name: "Songpa",                 lat: 37.5145, lng: 127.1066, radiusM: 700,  source: { kind: "dong", pattern: /^서울특별시 송파구 송파\d동$/,           region: "seoul" } },
  { name: "Ttukseom",               lat: 37.5311, lng: 127.0670, radiusM: 600,  source: { kind: "nominatim", query: "Seoul Forest Park" } },
  { name: "Yeonmujang-gil",         lat: 37.5448, lng: 127.0635, radiusM: 300,  source: { kind: "synthetic" } },
  { name: "Yongsan",                lat: 37.5384, lng: 126.9650, radiusM: 700,  source: { kind: "dong", pattern: /^서울특별시 용산구 /,                   region: "seoul" } },
  { name: "Cheongsapo",             lat: 35.1626, lng: 129.1933, radiusM: 200,  source: { kind: "synthetic" } },
  { name: "Gwangalli",              lat: 35.1531, lng: 129.1186, radiusM: 800,  source: { kind: "dong", pattern: /^부산광역시 수영구 광안\d동$/,           region: "busan" } },
  { name: "Haeundae",               lat: 35.1586, lng: 129.1604, radiusM: 1000, source: { kind: "dong", pattern: /^부산광역시 해운대구 (우\d동|중\d동)$/,  region: "busan" } },
  { name: "Mipo",                   lat: 35.1683, lng: 129.1789, radiusM: 200,  source: { kind: "synthetic" } },
]

// ── Source loaders ──────────────────────────────────────────────────

let seoulCache: GeoJSON.FeatureCollection | null = null
let busanCache: GeoJSON.FeatureCollection | null = null
async function loadDataset(region: "seoul" | "busan"): Promise<GeoJSON.FeatureCollection> {
  if (region === "seoul") {
    if (!seoulCache) seoulCache = JSON.parse(await Bun.file("/tmp/poly/seoul.geojson").text())
    return seoulCache!
  }
  if (!busanCache) busanCache = JSON.parse(await Bun.file("/tmp/poly/busan.geojson").text())
  return busanCache!
}

async function dongPolygon(pattern: RegExp, region: "seoul" | "busan"): Promise<GeoJSON.Feature | null> {
  const ds = await loadDataset(region)
  const matched = ds.features.filter((f: any) => pattern.test(f.properties.adm_nm))
  if (!matched.length) return null
  if (matched.length === 1) return matched[0] as any
  // Union all matched dongs into one (multi)polygon. Turf's union takes
  // a FeatureCollection of polygons/multipolygons and returns the merged
  // shape — handles touching/overlapping rings correctly.
  const fc = featureCollection(matched as any) as any
  return unionFeatureCollection(fc) as any
}

async function osmPolygon(kind: "way" | "relation", id: number): Promise<GeoJSON.Feature | null> {
  const query = `[out:json][timeout:25];${kind}(${id});out geom;`
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "User-Agent": "anthonyl.im neighborhood-data-builder",
    },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!r.ok) {
    console.error(`Overpass ${kind} ${id}: HTTP ${r.status}`)
    return null
  }
  const j = (await r.json()) as { elements: Array<any> }
  if (kind === "way") {
    const w = j.elements.find((e) => e.type === "way" && e.id === id)
    if (!w?.geometry) return null
    const coords = w.geometry.map((p: { lat: number; lon: number }) => [p.lon, p.lat] as LngLat)
    // Ensure closed ring.
    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push(coords[0])
    }
    return turfPolygon([coords]) as any
  }
  // Relation — collect outer ways, join them into a closed ring.
  const rel = j.elements.find((e) => e.type === "relation" && e.id === id)
  if (!rel) return null
  const outerWays = rel.members
    .filter((m: any) => m.role === "outer" && m.geometry)
    .map((m: any) =>
      m.geometry.map((p: { lat: number; lon: number }) => [p.lon, p.lat] as LngLat),
    )
  if (!outerWays.length) return null
  // Concatenate outer ways into one ring (naive — works for relations
  // with a single outer boundary built from contiguous ways, which is the
  // case for Seoul Forest).
  const ring: LngLat[] = []
  for (const w of outerWays) {
    if (ring.length && coordsEqual(ring[ring.length - 1], w[0])) {
      ring.push(...w.slice(1))
    } else if (ring.length && coordsEqual(ring[ring.length - 1], w[w.length - 1])) {
      ring.push(...w.slice(0, -1).reverse())
    } else {
      ring.push(...w)
    }
  }
  // Close ring.
  if (!coordsEqual(ring[0], ring[ring.length - 1])) ring.push(ring[0])
  return turfPolygon([ring]) as any
}

function coordsEqual(a: LngLat, b: LngLat): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9
}

async function nominatimPolygon(query: string): Promise<GeoJSON.Feature | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=1`
  const r = await fetch(url, {
    headers: { "User-Agent": "anthonyl.im neighborhood-data-builder" },
  })
  if (!r.ok) return null
  const items = (await r.json()) as Array<{ geojson?: GeoJSON.Geometry }>
  const g = items[0]?.geojson
  if (!g) return null
  if (g.type === "Polygon" || g.type === "MultiPolygon") {
    return { type: "Feature", properties: {}, geometry: g } as GeoJSON.Feature
  }
  return null
}

function syntheticCircle(lat: number, lng: number, radiusM: number, n = 32): LngLat[] {
  const M_PER_DEG_LAT = 111000
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const out: LngLat[] = []
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2
    const dLat = (radiusM * Math.sin(theta)) / M_PER_DEG_LAT
    const dLng = (radiusM * Math.cos(theta)) / (M_PER_DEG_LAT * cosLat)
    out.push([lng + dLng, lat + dLat])
  }
  out.push(out[0])
  return out
}

// ── Polygon flattening + simplification ─────────────────────────────

function largestOuterRing(geo: GeoJSON.Geometry): LngLat[] | null {
  if (geo.type === "Polygon") return geo.coordinates[0] as LngLat[]
  if (geo.type === "MultiPolygon") {
    const rings = geo.coordinates.map((p) => p[0] as LngLat[])
    // For visual highlights we want a single ring per neighborhood; pick
    // the largest by vertex count (good proxy for area on contiguous
    // metro dongs).
    rings.sort((a, b) => b.length - a.length)
    return rings[0] ?? null
  }
  return null
}

/** Simplify a ring to ≤ targetVerts using Turf's Visvalingam-Whyatt.
 *  Visvalingam is topology-friendlier than Douglas-Peucker — it removes
 *  triangles by importance, which avoids the self-intersections DP can
 *  introduce on tight bends. */
function simplifyRing(ring: LngLat[], targetVerts: number): LngLat[] {
  if (ring.length <= targetVerts) return ring
  let f: any = turfPolygon([ring])
  // Binary-search tolerance to land near the target vertex count.
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

function validate(name: string, ring: LngLat[]): boolean {
  if (ring.length < 4) {
    console.error(`  ✗ ${name}: ring has < 4 vertices`)
    return false
  }
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (!coordsEqual(first, last)) {
    console.error(`  ✗ ${name}: ring is not closed`)
    return false
  }
  const p: any = turfPolygon([ring])
  const k = kinks(p)
  if (k.features.length) {
    console.error(`  ✗ ${name}: ${k.features.length} self-intersection kinks`)
    return false
  }
  if (!booleanValid(p)) {
    console.error(`  ✗ ${name}: turf booleanValid=false`)
    return false
  }
  return true
}

// ── Main ────────────────────────────────────────────────────────────

interface OutputEntry {
  name: string
  lat: number
  lng: number
  radiusM: number
  polygon: LngLat[]
  source: string
  vertexCount: number
}

const output: OutputEntry[] = []

for (const entry of ENTRIES) {
  process.stderr.write(`${entry.name.padEnd(30)} `)
  let ring: LngLat[] | null = null
  let sourceTag = ""
  try {
    if (entry.source.kind === "synthetic") {
      ring = syntheticCircle(entry.lat, entry.lng, entry.radiusM)
      sourceTag = "synthetic"
    } else if (entry.source.kind === "dong") {
      const f = await dongPolygon(entry.source.pattern, entry.source.region)
      if (!f) throw new Error(`no dong matched`)
      ring = largestOuterRing(f.geometry)
      sourceTag = "hangjeongdong"
    } else if (entry.source.kind === "osm-way") {
      const f = await osmPolygon("way", entry.source.id)
      if (!f) throw new Error(`OSM way ${entry.source.id} not found`)
      ring = largestOuterRing(f.geometry)
      sourceTag = `osm-way:${entry.source.id}`
      await new Promise((r) => setTimeout(r, 1100)) // Overpass rate-limit
    } else if (entry.source.kind === "osm-relation") {
      const f = await osmPolygon("relation", entry.source.id)
      if (!f) throw new Error(`OSM relation ${entry.source.id} not found`)
      ring = largestOuterRing(f.geometry)
      sourceTag = `osm-rel:${entry.source.id}`
      await new Promise((r) => setTimeout(r, 1100))
    } else {
      // nominatim
      const f = await nominatimPolygon(entry.source.query)
      if (!f) throw new Error(`Nominatim "${entry.source.query}" not found`)
      ring = largestOuterRing(f.geometry)
      sourceTag = "nominatim"
      await new Promise((r) => setTimeout(r, 1100))
    }
  } catch (err) {
    process.stderr.write(`ERR (${(err as Error).message}) — falling back to circle\n`)
    ring = syntheticCircle(entry.lat, entry.lng, entry.radiusM)
    sourceTag = "synthetic-fallback"
  }
  if (!ring) {
    process.stderr.write(`NO RING — falling back to circle\n`)
    ring = syntheticCircle(entry.lat, entry.lng, entry.radiusM)
    sourceTag = "synthetic-fallback"
  }
  // Cap each polygon at ~80 vertices. The renderer can handle more but
  // wire-cost and triangulation runtime scale with vertex count, and
  // ≥80 reads as a smooth outline on screen.
  const VERT_BUDGET = 80
  const beforeN = ring.length
  if (ring.length > VERT_BUDGET) ring = simplifyRing(ring, VERT_BUDGET)
  if (!validate(entry.name, ring)) {
    process.stderr.write(`  invalid — falling back to circle\n`)
    ring = syntheticCircle(entry.lat, entry.lng, entry.radiusM)
    sourceTag = "synthetic-fallback-invalid"
  }
  output.push({
    name: entry.name,
    lat: entry.lat,
    lng: entry.lng,
    radiusM: entry.radiusM,
    polygon: ring,
    source: sourceTag,
    vertexCount: ring.length,
  })
  process.stderr.write(`✓ ${sourceTag.padEnd(20)} ${beforeN}→${ring.length} pts\n`)
}

// Emit the result as a plain JSON file the runtime imports.
const totalPts = output.reduce((s, e) => s + e.vertexCount, 0)
process.stderr.write(`\nTotal: ${output.length} polygons, ${totalPts} vertices\n`)
console.log(JSON.stringify(output, null, 0))
