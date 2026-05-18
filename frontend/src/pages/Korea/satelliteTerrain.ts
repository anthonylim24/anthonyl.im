// 3D satellite terrain backdrop for Map Mode.
//
// Fetches a small grid of ESRI World Imagery tiles around the user's lat/
// lng and composites them into a single CanvasTexture sized for a
// PlaneGeometry under the bubble graph. ESRI's tile server is free and
// CORS-friendly for moderate usage (good fit for a personal travel app).
//
// Tile URL shape:
//   https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
//
// Web Mercator coordinate math (lat/lng → tile x/y) follows the OSM
// standard:
//   https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames

import { CanvasTexture, SRGBColorSpace } from "three"

const TILE_SIZE = 256
// 5×5 tile composite — at the same target span this lets `pickZoom` land
// on a finer zoom level (roughly half the meters-per-pixel of a 3×3
// composite), so the map reads sharply when the camera pitches down.
// 25 tiles × ~50 KB each is well within the network + memory budget for
// the trip's expected day sizes, and the resulting 1280×1280 RGBA
// canvas (~6 MB on the GPU) sits comfortably on mobile.
const GRID_SIZE = 5
const EARTH_CIRCUMFERENCE_M = 40075016.7
const TILE_URL = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`

export interface SatelliteResult {
  texture: CanvasTexture
  // Meters covered by the GRID_SIZE×GRID_SIZE tile composite, at the
  // returned zoom level. Used by the scene to size the plane mesh.
  spanMeters: number
  // Fractional position of the user inside the composite, in [0, 1].
  // We use this to slide the texture's UV offset so the user position
  // lands at the geometric center of the plane.
  userU: number
  userV: number
}

function metersPerPixelAt(zoom: number, lat: number): number {
  const latRad = (lat * Math.PI) / 180
  return (EARTH_CIRCUMFERENCE_M * Math.cos(latRad)) / (TILE_SIZE * Math.pow(2, zoom))
}

// Pick the integer zoom whose 3x3 composite spans roughly `targetMeters`
// across at the given latitude. Clamped to [3, 18] to stay inside ESRI's
// max zoom for satellite imagery.
function pickZoom(targetMeters: number, lat: number): number {
  for (let z = 18; z >= 3; z--) {
    const span = metersPerPixelAt(z, lat) * TILE_SIZE * GRID_SIZE
    if (span >= targetMeters) return z
  }
  return 3
}

function lngToTileX(lng: number, n: number): number {
  return (n * (lng + 180)) / 360
}

function latToTileY(lat: number, n: number): number {
  const latRad = (lat * Math.PI) / 180
  return (n * (1 - Math.asinh(Math.tan(latRad)) / Math.PI)) / 2
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Fetch + composite a satellite texture centered on (lat, lng).
 *
 * @param targetMeters approximate desired physical span of the composite
 *   (e.g. 2× the radius the bubble world should cover). The function
 *   picks a zoom level whose tile grid is at least this wide.
 */
export async function fetchSatelliteTexture(
  lat: number,
  lng: number,
  targetMeters: number,
): Promise<SatelliteResult | null> {
  if (typeof document === "undefined") return null

  const zoom = pickZoom(targetMeters, lat)
  const n = Math.pow(2, zoom)
  const fracX = lngToTileX(lng, n)
  const fracY = latToTileY(lat, n)
  const cx = Math.floor(fracX)
  const cy = Math.floor(fracY)

  const canvas = document.createElement("canvas")
  canvas.width = TILE_SIZE * GRID_SIZE
  canvas.height = TILE_SIZE * GRID_SIZE
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  // Fill with a dark base so missing tiles fade instead of going white.
  ctx.fillStyle = "#0a0a0a"
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const half = Math.floor(GRID_SIZE / 2)
  const fetches: Promise<unknown>[] = []
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const tx = ((cx + dx) % n + n) % n // wrap antimeridian
      const ty = cy + dy
      if (ty < 0 || ty >= n) continue
      const url = TILE_URL(zoom, tx, ty)
      const drawX = (dx + half) * TILE_SIZE
      const drawY = (dy + half) * TILE_SIZE
      fetches.push(
        loadImage(url).then((img) => {
          if (img) ctx.drawImage(img, drawX, drawY, TILE_SIZE, TILE_SIZE)
        }),
      )
    }
  }
  await Promise.all(fetches)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // Slightly soften the satellite so it doesn't overpower the bubbles
  // (which carry the actual information). Darkening happens in shader
  // via material color/opacity at the caller — the texture itself stays
  // unmodified for accuracy.

  const spanMeters = metersPerPixelAt(zoom, lat) * TILE_SIZE * GRID_SIZE
  // User's position inside the composite, [0, 1] in U/V.
  const userU = (fracX - (cx - half)) / GRID_SIZE
  const userV = (fracY - (cy - half)) / GRID_SIZE

  return { texture, spanMeters, userU, userV }
}
