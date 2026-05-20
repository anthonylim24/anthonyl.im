// Lazy loader + hit-tester for the every-dong-in-Seoul-and-Busan
// dataset that powers the Map Mode neighborhood tooltip.
//
// The data file (~84 KB gzipped) is served by GET /api/korea/dongs with
// a year-long immutable Cache-Control header. We fetch it the first time
// Map Mode mounts and keep the parsed result in module scope so a
// remount within the same session reuses the same array.
//
// Hit-testing: per-pointer-move we run a bounding-box pre-filter (skips
// ~95% of polygons) followed by a ray-casting point-in-polygon check.
// Both are inlined so we don't drag @turf/* into the Map Mode chunk
// just for this — turf would add ~30 KB minified and we only need two
// trivial geometry primitives.

interface Dong {
  /** Human-readable short name, e.g. "강남구 압구정동". The "서울특별시 " /
   *  "부산광역시 " prefix is stripped by the build script because the
   *  dataset only contains those two cities. */
  n: string
  /** Flat lng/lat pairs: [lng, lat, lng, lat, …]. Ring is closed
   *  (first pair === last pair). Pre-simplified to ≤ 28 verts. */
  p: number[]
  /** Bounding box [minLng, minLat, maxLng, maxLat] precomputed by the
   *  builder so the client doesn't have to recompute on every mount. */
  b: [number, number, number, number]
}

let cache: Dong[] | null = null
let inflight: Promise<Dong[]> | null = null

/** Load the all-dongs dataset, returning a cached array on subsequent
 *  calls. Multiple parallel callers share the same in-flight promise. */
export function loadAllKoreaDongs(): Promise<Dong[]> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight
  // Cache-bust query is bumped whenever the upstream dataset format
  // changes (v1 shipped Hangul names; v2+ ships Revised Romanization).
  // The server ignores the query string and serves the current JSON,
  // but a fresh URL forces clients with the year-immutable cached v1
  // response to re-fetch instead of reusing the stale entry.
  inflight = fetch("/api/korea/dongs?v=2")
    .then((r) => {
      if (!r.ok) throw new Error(`/api/korea/dongs ${r.status}`)
      return r.json()
    })
    .then((j: { dongs: Dong[] }) => {
      cache = j.dongs
      return cache
    })
    .catch((err) => {
      // Surface the failure but don't crash Map Mode — the scene
      // still works without tooltips. Next mount retries.
      console.warn("[korea] failed to load dongs:", err)
      inflight = null
      return [] as Dong[]
    })
  return inflight
}

/** Standard ray-casting point-in-polygon. Ring is the flat lng/lat
 *  layout from {@link Dong.p}; closed-ness doesn't matter because the
 *  algorithm wraps around the last vertex. */
function pointInRing(lng: number, lat: number, p: number[]): boolean {
  let inside = false
  const n = p.length / 2
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2 + 0]
    const yi = p[i * 2 + 1]
    const xj = p[j * 2 + 0]
    const yj = p[j * 2 + 1]
    const intersect = yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Find every dong containing (lng, lat). Multiple matches indicate
 *  the point falls on a shared boundary or in a polygon-simplification
 *  artefact — caller decides how to display (we join with " · " when
 *  rendering). Returns names in dataset order (no sort) — at 630
 *  polygons even an unsorted result returns within ~1 ms. */
export function namesAtLngLat(dongs: Dong[], lng: number, lat: number): string[] {
  const out: string[] = []
  for (const d of dongs) {
    if (lng < d.b[0] || lng > d.b[2] || lat < d.b[1] || lat > d.b[3]) continue
    if (pointInRing(lng, lat, d.p)) out.push(d.n)
  }
  return out
}
