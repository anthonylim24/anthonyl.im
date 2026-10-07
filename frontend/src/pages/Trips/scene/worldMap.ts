/**
 * A hand-drawn toy atlas: continents as coarse cut-paper outlines in
 * [lng, lat] degrees, painted to an equirectangular canvas for the clay
 * planet and projected to SVG for its static still. Deliberately rough —
 * it is a sticker map, not a basemap. No three.js in here, so the still and
 * the pin fallback stay out of the WebGPU chunk.
 */

export type LatLng = { lat: number; lng: number }

type Shape = { fill: string; pts: number[] }

export const TOY = {
  ocean: '#a9d8f5',
  oceanDeep: '#8fc6ea',
  ink: '#1f2440',
  paper: '#fffdf6',
  mint: '#a6e5c8',
  peach: '#ffc3a6',
  butter: '#ffdd7f',
  lilac: '#cdc1f7',
  rose: '#ffb3c4',
  snow: '#f4f1ff',
} as const

/** Pastel sticker per trip accent — what a trip's pin and tag are painted with. */
export const ACCENT_FILL: Record<string, string> = {
  rose: TOY.rose,
  amber: TOY.butter,
  emerald: TOY.mint,
  sky: '#7cc2ef',
  violet: TOY.lilac,
}

const LAND: Shape[] = [
  // North America + Central America
  { fill: TOY.mint, pts: [-168,66,-162,70,-156,71.5,-140,69.5,-128,70,-115,68,-95,72,-85,69,-80,63,-94,59,-88,56,-80,52,-78,58,-70,61,-64,60,-56,52,-60,47,-66,44,-70,42,-74,40,-76,35,-81,31,-80,26,-82,28,-84,30,-90,30,-97,27,-97,22,-94,18.5,-90,21,-87,21,-88,16,-83,15,-83,10,-79,9,-77,8,-80,7.5,-86,11,-92,14.5,-96,15.7,-105,20,-106,23,-112,29,-110,23,-114.5,30,-117,32.5,-120.5,34.5,-124,40,-124.5,48,-130,55,-136,58.5,-146,60.5,-152,59,-158,57,-164,54.5,-157,58.5,-162,60,-166,62,-165,65.5] },
  { fill: TOY.snow, pts: [-73,78,-60,82,-35,83.5,-20,82,-18,76,-22,70,-32,68,-42,60,-48,61,-53,66,-56,71,-66,76] },
  { fill: TOY.mint, pts: [-80,63,-73,62,-64,63.5,-62,67,-68,70.5,-78,73,-90,73.5,-85,70,-79.5,69,-81,66] },
  { fill: TOY.mint, pts: [-90,76.5,-75,78,-65,82.5,-85,82.7,-95,80,-90,79] },
  { fill: TOY.mint, pts: [-118,69,-102,68.8,-101,70.5,-108,73.5,-118,72.5] },
  { fill: TOY.mint, pts: [-85,21.8,-81,23.2,-77,22.2,-74.2,20.2,-77.5,19.9,-80,21.6] },
  { fill: TOY.mint, pts: [-74.4,18.5,-72.8,19.9,-70,19.7,-68.4,18.5,-71.4,17.6,-74,18.1] },
  // South America
  { fill: TOY.rose, pts: [-80,8,-77,8.5,-72,12,-62,10.7,-52,5,-50,0,-44,-2.5,-35,-5.5,-35,-9,-39,-14,-41,-22,-48,-26,-53,-34,-58,-38,-62,-39,-65,-42,-67,-47,-69,-52,-72,-54,-75,-50,-74,-44,-73,-37,-71.5,-30,-70.5,-18,-76,-14,-81,-6,-80,-2,-78,1.5,-79,4,-77.5,7] },
  // Eurasia (one sheet of paper, Europe to Chukotka)
  { fill: TOY.butter, pts: [-9,37,-9,43,-2,43.5,-1.5,46,-4.5,48.5,1.5,50.5,4,51.5,8,54,8.5,57,10.5,57.7,11,56,12.5,54.5,14,54,19,54.5,21,57,24,57.5,23.5,59.5,28,60,23,60,21.5,61,21.5,64,25,65.5,22,65.8,18,62.5,17,61,18.5,60,16,56.5,13,55.5,11,59,6,58.2,5,61.5,8,63.5,14,67,17,69,24,71,31,70,41,67,44,68.5,53,68.5,60,69,69,73,80,72.5,87,75,100,78,113,74,128,73,140,72.5,150,71,160,70,170,70,180,69,180,65,177,62,170,60,163,58,162,56,156,51,156,57,160,61,154,59.5,143,59.5,137,54,141,52,140,48,135,43.5,130,42.5,129.5,36,129.4,35.3,128.5,34.8,126.5,34.4,126,37.5,124.5,39.8,121,40.8,121.5,39,118,39,119.5,37,122.5,37,120,34.5,121.5,32,122,29,119.5,25.5,116,22.8,110.5,21,108,21.5,106,19,108.8,15.5,109,11.5,105,8.6,103,10.5,100.5,13.5,99.5,10,101.5,6.5,103.5,1.3,101,3,98.5,8,98.5,13,97.5,16.5,94.5,16,92,21,89,22,86.5,20,80.5,15.5,80,10,77.5,8,76,10,73,17,72.5,21,70,22.5,67,24.5,62,25.2,57,25.7,56.5,27,52,27.8,50,30,48,30,50,26.5,51.5,24,56,26,56.5,24,59.8,22.5,57,18.5,52,16,45,12.8,43,13,42.5,15.5,39,21.5,35,28,34.5,29.5,32.5,30,34.5,31.5,35.8,34.5,36,36.8,33,36.2,30,36.2,27,37,26.5,39.5,29,41,26,40.8,24,40.5,23,39,22.5,36.5,21,38.5,19.5,41.5,13.5,45.5,12.3,44.5,16,41.5,18.5,40.2,16,38,15.7,40,12,42,10,44,7,43.6,3,43.3,3.2,42,0.5,40.5,-0.5,38.5,-2,36.8,-5.5,36,-7,37] },
  { fill: TOY.butter, pts: [-180,69,-175,67.5,-170,66.2,-172,64.5,-178,65,-180,65] },
  { fill: TOY.butter, pts: [-5.7,50,1.5,51.2,1.7,52.7,0,53.5,-1.5,55,-2,57,-3,58.6,-5,58.6,-6,57,-5.6,55.4,-4.7,54.8,-3,53.5,-4.5,53.3,-4.3,51.7] },
  { fill: TOY.mint, pts: [-6,52.2,-6.2,54,-7.3,55.3,-8.5,54.3,-10,54,-9.8,52,-10,51.6,-8,51.6] },
  { fill: TOY.snow, pts: [-24,65.5,-22,66.4,-16,66.5,-13.5,65.2,-15,64.3,-18.8,63.4,-22.7,63.8] },
  { fill: TOY.butter, pts: [52,71,56,70.5,58,73,68,76.8,62,76.5,54,73.5] },
  { fill: TOY.snow, pts: [11,78.5,18,80.5,27,80,20,77,16,76.5] },
  { fill: TOY.butter, pts: [79.8,9.8,81.8,7.5,81.2,6.2,80,6] },
  // Japan, Taiwan, Philippines
  { fill: TOY.rose, pts: [130,31.2,131.5,31.5,132,33.8,135,33.5,136.8,34.3,139.8,35,140.9,35.7,141,38.3,142,39.5,141.4,41.4,140,40.6,139.8,39,138.5,37.8,137,37,136,35.8,133,35.5,131,34.4,129.7,33.2] },
  { fill: TOY.rose, pts: [140,41.5,141.2,41.8,143.2,42,145.5,43.3,144.5,44.1,141.8,45.4,141.4,43.4,140.4,43.3] },
  { fill: TOY.mint, pts: [120.2,22.5,121,25.2,122,25,121.3,22.5] },
  { fill: TOY.mint, pts: [120,18.5,122.2,18.5,122,16.5,124,13.5,125.5,12.5,126.5,7.5,125.5,6,122,7,123,10,121.5,12,120.5,14.5] },
  // Maritime Southeast Asia
  { fill: TOY.mint, pts: [109,2,111,1.5,113,3.2,115.5,5,117,7,119,5,118,1,117.5,-1,116,-4,113,-3.4,110.2,-2.9,109.3,0] },
  { fill: TOY.mint, pts: [95.3,5.6,98,4.2,103.5,-1,106,-3,106,-5.8,104.5,-5.9,101,-2.5,98.6,1.8] },
  { fill: TOY.mint, pts: [105.2,-6.8,108,-6.4,112.5,-6.8,114.6,-8,114.4,-8.7,110,-8.2,106,-7.4] },
  { fill: TOY.mint, pts: [119.3,-5.5,120.5,-5.5,120.8,-2.5,121.5,1,124.5,1.3,123,0.5,120.3,0.8,119,-3] },
  { fill: TOY.mint, pts: [131,-1.2,134,-0.8,138,-1.7,141,-2.6,145.7,-5.2,147.5,-6.2,147.5,-8,150,-10.5,146,-8.3,143.5,-9,141,-9.2,139,-8,138,-7.5,137.6,-5,135,-4.4,132.5,-4,132,-2.8] },
  // Africa + Madagascar
  { fill: TOY.peach, pts: [-17,21,-16.5,24,-13,27.8,-9.8,30,-9.5,33,-6,35.8,-2,35.1,3,36.8,10,37.3,11,35,10,33.8,15,32.4,19.5,30.5,20,32,23,32.7,29,30.9,32.3,31.3,34.2,31.2,34.5,28,32.5,29.9,35.5,24,37.2,21,38.5,18,39.5,15.5,43.3,12.5,51,11.8,51,10.5,48,4.5,44,0,41,-2,39.5,-5,39,-8,40.5,-11,40.5,-15,37,-18,35.3,-22,35.5,-24,32.8,-26,32.4,-29,30,-31.3,27,-33.6,22.5,-34,20,-34.8,18.4,-34,17.8,-31,15,-27,14.5,-23,11.8,-17.5,13.6,-12,12.2,-6,9,-1,9.5,3.5,6,4.3,4,6.4,-2,4.8,-7.5,4.4,-11.5,6.9,-13.5,9.5,-15,11,-17.2,14.7,-16.5,19.5] },
  { fill: TOY.mint, pts: [49.3,-12,50.4,-15.5,49.5,-17,47,-24.8,45,-25.5,43.5,-22,44.3,-16.5,47,-14.8] },
  // Australia + New Zealand
  { fill: TOY.peach, pts: [114,-22,113.5,-26,115,-34,118,-35,123.5,-33.9,129,-31.6,131,-31.5,135,-34.8,138,-35.5,140,-38,144.5,-38.2,146.4,-39,150,-37.5,151.2,-34,153.1,-30.5,153.5,-28,153,-25,150.8,-22.6,149,-20.5,146.3,-19,145.4,-15,143.5,-14,142.5,-10.8,141.5,-13,141.6,-16.5,140,-17.7,136.8,-16,136,-12,132.5,-11.5,130,-13,129,-15,126.5,-14,123,-16.5,122,-18.5,119,-20,116,-20.8] },
  { fill: TOY.peach, pts: [144.7,-40.7,148.3,-41,148,-43.2,146,-43.6,145.2,-42.2] },
  { fill: TOY.lilac, pts: [172.7,-34.4,174.5,-36,176,-37.6,178.4,-37.7,177,-39.3,176.1,-41.2,174.6,-41.3,175.1,-39.8,173.8,-39.2,174.6,-37,173,-35.2] },
  { fill: TOY.lilac, pts: [172.7,-40.5,174.3,-41.7,173.2,-43.5,171.2,-44.5,169,-46.6,166.5,-46,168,-44,171,-42] },
  // Antarctica
  { fill: TOY.snow, pts: [-180,-90,-180,-78,-160,-77,-150,-76,-130,-74,-100,-73,-80,-73,-62,-64,-58,-63.5,-60,-68,-45,-77,-30,-77,-10,-71,10,-70,40,-69,70,-68,90,-66,120,-66.5,150,-68,165,-71,170,-73,180,-78,180,-90] },
]

/** Inland seas punched back out of Eurasia. */
const WATER: number[][] = [
  [28,41.2,28,43.5,30,45.5,33.5,46,35.5,45.3,38,47,39.5,47,37.5,45,41.5,41.5,36,41.6,33,42,29,41],
  [47,45.5,50,46.5,53,45.5,51,44,52.8,41.8,54,40,53,37.3,50.3,37.2,49,38.5,49.5,40.5,47.5,42.5],
]

/**
 * Paints the toy atlas into an equirectangular canvas (lng −180..180 left to
 * right, lat 90..−90 top to bottom): pastel ocean with a dotted graticule,
 * each landmass as a cut-paper sticker with a soft drop shadow and ink edge.
 */
export function paintAtlas(width: number, height: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = width
  cv.height = height
  const g = cv.getContext('2d')
  if (!g) return cv
  const k = width / 2048
  const px = (lng: number) => ((lng + 180) / 360) * width
  const py = (lat: number) => ((90 - lat) / 180) * height
  const trace = (pts: number[]) => {
    g.beginPath()
    for (let i = 0; i < pts.length; i += 2) {
      const x = px(pts[i])
      const y = py(pts[i + 1])
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
  }

  const sea = g.createLinearGradient(0, 0, 0, height)
  sea.addColorStop(0, '#c5e6fa')
  sea.addColorStop(0.5, TOY.ocean)
  sea.addColorStop(1, '#c5e6fa')
  g.fillStyle = sea
  g.fillRect(0, 0, width, height)

  // Dotted graticule + a few wave ticks — the "printed map" texture.
  g.fillStyle = 'rgba(255,255,255,0.55)'
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lng = -180; lng < 180; lng += 3) g.fillRect(px(lng), py(lat), 3 * k, 3 * k)
  }
  for (let lng = -180; lng < 180; lng += 30) {
    for (let lat = -80; lat <= 80; lat += 3) g.fillRect(px(lng), py(lat), 3 * k, 3 * k)
  }
  g.strokeStyle = 'rgba(31,36,64,0.16)'
  g.lineWidth = 3 * k
  g.lineCap = 'round'
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 90; i++) {
    const x = rand() * width
    const y = height * (0.12 + rand() * 0.76)
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + 9 * k, y - 7 * k, x + 18 * k, y)
    g.quadraticCurveTo(x + 27 * k, y + 7 * k, x + 36 * k, y)
    g.stroke()
  }

  // Paper drop shadow, then the sticker, then its ink edge.
  g.lineJoin = 'round'
  g.save()
  g.translate(5 * k, 7 * k)
  g.fillStyle = 'rgba(31,36,64,0.22)'
  for (const s of LAND) {
    trace(s.pts)
    g.fill()
  }
  g.restore()
  for (const s of LAND) {
    trace(s.pts)
    g.fillStyle = s.fill
    g.fill()
  }
  g.fillStyle = TOY.ocean
  for (const w of WATER) {
    trace(w)
    g.fill()
  }
  g.strokeStyle = TOY.ink
  g.lineWidth = 3.5 * k
  for (const s of LAND) {
    trace(s.pts)
    g.stroke()
  }
  for (const w of WATER) {
    trace(w)
    g.stroke()
  }
  return cv
}

/** Orthographic projection of the atlas for the static still (SVG paths). */
export function atlasPaths(center: LatLng, radius: number): { fill: string; d: string }[] {
  const toRad = Math.PI / 180
  const lat0 = center.lat * toRad
  const lng0 = center.lng * toRad
  const out: { fill: string; d: string }[] = []
  for (const s of LAND) {
    let visible = 0
    const parts: string[] = []
    for (let i = 0; i < s.pts.length; i += 2) {
      const lng = s.pts[i] * toRad
      const lat = s.pts[i + 1] * toRad
      const cosc = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lng - lng0)
      let x = Math.cos(lat) * Math.sin(lng - lng0)
      let y = Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lng - lng0)
      if (cosc < 0) {
        // Far side: pin the point to the limb so partial shapes close neatly.
        const l = Math.hypot(x, y) || 1
        x /= l
        y /= l
      } else visible++
      parts.push(`${(x * radius).toFixed(1)} ${(-y * radius).toFixed(1)}`)
    }
    if (visible > 1) out.push({ fill: s.fill, d: `M${parts.join('L')}Z` })
  }
  return out
}

/** Orthographic screen position of a point, or null on the far side. */
export function projectOrtho(p: LatLng, center: LatLng, radius: number): { x: number; y: number } | null {
  const toRad = Math.PI / 180
  const lat0 = center.lat * toRad
  const lng0 = center.lng * toRad
  const lat = p.lat * toRad
  const lng = p.lng * toRad
  const cosc = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lng - lng0)
  if (cosc < 0.05) return null
  return {
    x: Math.cos(lat) * Math.sin(lng - lng0) * radius,
    y: -(Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lng - lng0)) * radius,
  }
}

/** Mean of a set of points on the sphere (handles the antimeridian). */
export function centroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null
  const toRad = Math.PI / 180
  let x = 0
  let y = 0
  let z = 0
  for (const p of points) {
    const la = p.lat * toRad
    const ln = p.lng * toRad
    x += Math.cos(la) * Math.cos(ln)
    y += Math.cos(la) * Math.sin(ln)
    z += Math.sin(la)
  }
  const h = Math.hypot(x, y)
  return { lat: Math.atan2(z, h) / toRad, lng: Math.atan2(y, x) / toRad }
}

// ponytail: a pocket gazetteer for trips that have no located places yet;
// swap for a geocode call if blank trips to small towns ever need pins.
const PLACES: Record<string, [number, number]> = {
  tokyo: [35.68, 139.76], kyoto: [35.01, 135.77], osaka: [34.69, 135.5], hakone: [35.23, 139.11],
  sapporo: [43.06, 141.35], okinawa: [26.21, 127.68], fukuoka: [33.59, 130.4], nara: [34.68, 135.8],
  seoul: [37.57, 126.98], busan: [35.18, 129.08], jeju: [33.5, 126.53], korea: [36.5, 127.8], japan: [36.2, 138.25],
  taipei: [25.03, 121.57], 'hong kong': [22.32, 114.17], shanghai: [31.23, 121.47], beijing: [39.9, 116.4],
  singapore: [1.35, 103.82], bangkok: [13.76, 100.5], 'chiang mai': [18.79, 98.98], hanoi: [21.03, 105.85],
  'ho chi minh city': [10.82, 106.63], bali: [-8.4, 115.19], manila: [14.6, 120.98], 'kuala lumpur': [3.14, 101.69],
  delhi: [28.61, 77.21], mumbai: [19.08, 72.88], dubai: [25.2, 55.27], istanbul: [41.01, 28.98],
  london: [51.51, -0.13], paris: [48.86, 2.35], rome: [41.9, 12.5], florence: [43.77, 11.26], venice: [45.44, 12.32],
  milan: [45.46, 9.19], barcelona: [41.39, 2.17], madrid: [40.42, -3.7], lisbon: [38.72, -9.14], porto: [41.15, -8.61],
  amsterdam: [52.37, 4.9], berlin: [52.52, 13.4], munich: [48.14, 11.58], vienna: [48.21, 16.37], prague: [50.08, 14.44],
  copenhagen: [55.68, 12.57], stockholm: [59.33, 18.07], oslo: [59.91, 10.75], reykjavik: [64.15, -21.94],
  athens: [37.98, 23.73], edinburgh: [55.95, -3.19], dublin: [53.35, -6.26], zurich: [47.38, 8.54],
  'new york': [40.71, -74.01], 'san francisco': [37.77, -122.42], 'los angeles': [34.05, -118.24],
  chicago: [41.88, -87.63], seattle: [47.61, -122.33], hawaii: [20.8, -156.33], honolulu: [21.31, -157.86],
  'mexico city': [19.43, -99.13], cancun: [21.16, -86.85], toronto: [43.65, -79.38], vancouver: [49.28, -123.12],
  montreal: [45.5, -73.57], 'buenos aires': [-34.6, -58.38], 'rio de janeiro': [-22.91, -43.17], lima: [-12.05, -77.04],
  cusco: [-13.53, -71.97], sydney: [-33.87, 151.21], melbourne: [-37.81, 144.96], auckland: [-36.85, 174.76],
  queenstown: [-45.03, 168.66], 'cape town': [-33.92, 18.42], marrakech: [31.63, -8.01], cairo: [30.04, 31.24],
  nairobi: [-1.29, 36.82],
}

export function lookupPlace(name: string): LatLng | null {
  const key = name.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()
  // Whole-word match, so "Romeoville" doesn't land in Rome.
  const padded = ` ${key} `
  const hit = PLACES[key] ?? Object.entries(PLACES).find(([k]) => padded.includes(` ${k} `))?.[1]
  return hit ? { lat: hit[0], lng: hit[1] } : null
}
