/**
 * Lim's world: the things a visitor can give Lim and the places they can send
 * it. Both are small data specs, so a catalog entry and one invented by the
 * model on the fly are the same kind of thing: an item is a handful of
 * primitive parts plus traits (which decide what Lim can do with it), a place
 * is a palette, a horizon, weather and a little physics.
 *
 * Nothing here trusts its input: `cleanItem` / `cleanPlace` accept unknown
 * JSON (from the model, or from localStorage) and return a safe spec or null.
 * Mirrored on the server in `server/src/lim/world.ts`.
 */

export const SHAPES = ['ball', 'box', 'cylinder', 'cone', 'disc', 'drop', 'star', 'heart', 'bean', 'ring'] as const
export type Shape = (typeof SHAPES)[number]

export const TRAITS = [
  'edible', 'bouncy', 'heavy', 'floaty', 'hat', 'glasses', 'soft', 'cozy', 'musical', 'scary', 'hot', 'cold', 'glowing', 'prickly', 'hoop', 'goal',
] as const
export type Trait = (typeof TRAITS)[number]

/** A pattern painted on a part in a second colour (`ink`): a basketball's seams, a football's patches. */
export const PAINTS = ['plain', 'seams', 'patches', 'stripes', 'spots'] as const
export type Paint = (typeof PAINTS)[number]

export type Part = {
  shape: Shape
  color: string
  /** Offset from the body's centre, in body radii. */
  at: [number, number, number]
  /** Half-extents in body radii. */
  scale: [number, number, number]
  /** Lean about the view axis, degrees. */
  tilt: number
  paint?: Paint
  /** The paint's colour. */
  ink?: string
}

export type ItemSpec = {
  name: string
  /** The first part is the body (it has the physics); the rest ride on it. */
  parts: Part[]
  /** 1 = a body radius of 0.3 world units (Lim's is 1). */
  size: number
  traits: Trait[]
  /** Index of the part that gets a pair of eyes, or -1. */
  face: number
}

export const PATTERNS = ['dots', 'stripes', 'checks', 'waves', 'plain'] as const
export const HORIZONS = ['none', 'hills', 'dunes', 'waves', 'mountains', 'city', 'trees', 'wall'] as const
export const ORBS = ['none', 'sun', 'moon', 'planet'] as const
export const WEATHERS = ['none', 'snow', 'rain', 'bubbles', 'leaves', 'petals', 'fireflies', 'embers'] as const
export const MOODS = ['calm', 'cozy', 'cold', 'hot', 'floaty', 'wet', 'spooky', 'party'] as const
/** Things that stand in the landscape behind the stage (see scene/scenery.ts). */
export const SCENERY = [
  'clouds', 'trees', 'pines', 'palms', 'rocks', 'flowers', 'mushrooms', 'cacti', 'volcano', 'coral', 'seaweed', 'fish', 'craters',
  'buildings', 'spotlights', 'graves', 'deadtrees', 'snowmen', 'mist',
] as const
export type Scenery = (typeof SCENERY)[number]

export type PlaceSpec = {
  name: string
  /** Sky gradient, top then bottom. */
  sky: [string, string]
  floor: string
  dots: string
  rug: string
  pattern: (typeof PATTERNS)[number]
  horizon: (typeof HORIZONS)[number]
  horizonColor: string
  /** Up to five kinds of thing in the landscape. */
  scenery: Scenery[]
  orb: (typeof ORBS)[number]
  orbColor: string
  stars: boolean
  weather: (typeof WEATHERS)[number]
  weatherColor: string
  /** 1 = normal. Low is floaty (space, underwater). */
  gravity: number
  slippery: boolean
  /** Shade Lim and the toys for night. */
  dark: boolean
  mood: (typeof MOODS)[number]
}

/** Changes to the air of wherever Lim is (the studio included), without going anywhere. */
export type Tweak = {
  weather?: (typeof WEATHERS)[number]
  weatherColor?: string
  gravity?: number
  slippery?: boolean
  dark?: boolean
}

export const ACTIONS = ['look', 'kick', 'bounce', 'eat', 'wear', 'hug', 'nap', 'dance', 'remove', 'shoot'] as const
export type Action = (typeof ACTIONS)[number]

export type WorldOp =
  | { op: 'item'; spec: ItemSpec; then?: Action }
  | { op: 'place'; spec: PlaceSpec | null }
  | { op: 'tweak'; set: Tweak }
  | { op: 'act'; action: Action; target: string }
  | { op: 'clear'; what: 'items' | 'place' | 'all' }

/* ── Cleaning ────────────────────────────────────────────────────── */

const HEX = /^#[0-9a-f]{6}$/i
const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toUpperCase() : fallback)
const pick = <T extends string>(v: unknown, from: readonly T[], fallback: T): T =>
  typeof v === 'string' && (from as readonly string[]).includes(v) ? (v as T) : fallback
const triple = (v: unknown, lo: number, hi: number, fallback: number): [number, number, number] => {
  const a = Array.isArray(v) ? v : typeof v === 'number' ? [v, v, v] : []
  return [clamp(a[0], lo, hi, fallback), clamp(a[1], lo, hi, fallback), clamp(a[2], lo, hi, fallback)]
}
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/* Invented colours are pulled into the house palette: nothing neon, nothing
   pitch black (that becomes the plum ink), nothing too dim to read as candy. */
function toHsl(v: string): [number, number, number] {
  const n = parseInt(v.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}
function fromHsl(h: number, s: number, l: number): string {
  const f = (k: number) => {
    const a = s * Math.min(l, 1 - l)
    const x = (k + h * 12) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(x - 3, 9 - x, 1))))
  }
  return `#${[f(0), f(8), f(4)].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}
export function soften(color: string): string {
  const [h, s, l] = toHsl(color)
  if (l < 0.17) return '#2B2140'
  return fromHsl(h, Math.min(s, 0.86), Math.min(0.92, Math.max(0.42, l)))
}
/** A place colour: any lightness (nights are dark), but never neon; `apart` keeps it distinct from a neighbour. */
function tone(color: string, apart?: string): string {
  const [h, s, l] = toHsl(color)
  let light = l
  if (apart) {
    const other = toHsl(apart)[2]
    if (Math.abs(other - l) < 0.06) light = l > 0.5 ? l - 0.09 : l + 0.09
  }
  return fromHsl(h, Math.min(s, 0.8), Math.min(0.97, Math.max(0.06, light)))
}

/** A short, plain label: letters, digits, spaces, a few marks. */
export function cleanName(v: unknown, fallback = ''): string {
  if (typeof v !== 'string') return fallback
  const name = v.replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 28).toLowerCase()
  return name || fallback
}

export function cleanItem(raw: unknown): ItemSpec | null {
  const o = obj(raw)
  if (!o || !Array.isArray(o.parts)) return null
  const parts: Part[] = []
  for (const p of o.parts.slice(0, 6)) {
    const q = obj(p)
    if (!q) continue
    const paint = pick(q.paint, PAINTS, 'plain')
    parts.push({
      shape: pick(q.shape, SHAPES, 'ball'),
      color: soften(hex(q.color, '#FF9FC5')),
      at: parts.length === 0 ? [0, 0, 0] : triple(q.at, -1.8, 1.8, 0),
      scale: triple(q.scale, 0.08, 1.6, parts.length === 0 ? 1 : 0.4),
      tilt: clamp(q.tilt, -180, 180, 0),
      ...(paint !== 'plain' ? { paint, ink: soften(hex(q.ink, '#2B2140')) } : null),
    })
  }
  if (parts.length === 0) return null
  // The body sets the scale of everything else, so it can't be a sliver.
  parts[0].scale = parts[0].scale.map((s) => Math.max(0.3, s)) as [number, number, number]
  // Whatever units the model thought in, the whole thing ends up about one body radius across.
  let reach = 0
  for (const p of parts) for (let a = 0; a < 2; a++) reach = Math.max(reach, Math.abs(p.at[a]) + p.scale[a])
  if (reach < 0.95 || reach > 2.3) {
    const k = Math.min(3, Math.max(0.4, 1.35 / reach))
    for (const p of parts) {
      p.at = p.at.map((v) => v * k) as [number, number, number]
      p.scale = p.scale.map((v) => Math.min(1.8, Math.max(0.06, v * k))) as [number, number, number]
    }
  }
  // Depth stays shallow: nothing pokes out at the camera or hides behind the body.
  for (const p of parts) {
    p.at[2] = Math.min(1.2, Math.max(-1.2, p.at[2]))
    p.scale[2] = Math.min(1.4, p.scale[2])
  }
  const traits = Array.isArray(o.traits)
    ? [...new Set(o.traits.filter((t): t is Trait => typeof t === 'string' && (TRAITS as readonly string[]).includes(t)))].slice(0, 5)
    : []
  const face = typeof o.face === 'number' && Number.isInteger(o.face) && o.face >= 0 && o.face < parts.length ? o.face : -1
  return { name: cleanName(o.name, 'thing'), parts, size: clamp(o.size, 0.8, 1.7, 1), traits, face }
}

/** A place saved before places had scenery (or one the model left bare) still gets a landscape. */
function sceneryFor(horizon: PlaceSpec['horizon'], mood: PlaceSpec['mood'], dark: boolean): Scenery[] {
  if (horizon === 'wall' || horizon === 'none') return []
  if (horizon === 'city') return ['buildings', 'clouds']
  if (mood === 'spooky') return ['deadtrees', 'graves', 'mist']
  if (mood === 'cold') return ['pines', 'snowmen', 'clouds']
  if (horizon === 'waves') return ['palms', 'rocks', 'clouds']
  if (horizon === 'dunes') return dark ? ['craters', 'rocks'] : ['cacti', 'rocks', 'clouds']
  if (horizon === 'mountains') return ['pines', 'rocks', 'clouds']
  return ['trees', 'flowers', 'clouds']
}

export function cleanPlace(raw: unknown): PlaceSpec | null {
  const o = obj(raw)
  if (!o) return null
  const sky = Array.isArray(o.sky) ? o.sky : []
  const top = hex(sky[0], '')
  const bottom = hex(sky[1], top)
  if (!top) return null
  const floor = tone(hex(o.floor, '#F3E3C8'))
  const name = cleanName(o.name, 'somewhere')
  // "studio" is Lim's own room and has no spec; a spec by that name would shadow it.
  if (name === 'studio') return null
  return {
    name,
    sky: [tone(top), tone(bottom)],
    floor,
    dots: tone(hex(o.dots, floor), floor),
    rug: tone(hex(o.rug, '#C8F0E0'), floor),
    pattern: pick(o.pattern, PATTERNS, 'plain'),
    horizon: pick(o.horizon, HORIZONS, 'none'),
    horizonColor: tone(hex(o.horizonColor, floor), bottom),
    scenery: Array.isArray(o.scenery)
      ? [...new Set(o.scenery.filter((s): s is Scenery => typeof s === 'string' && (SCENERY as readonly string[]).includes(s)))].slice(0, 5)
      : sceneryFor(pick(o.horizon, HORIZONS, 'none'), pick(o.mood, MOODS, 'calm'), o.dark === true),
    orb: pick(o.orb, ORBS, 'none'),
    orbColor: hex(o.orbColor, '#FFE9A8'),
    stars: o.stars === true,
    weather: pick(o.weather, WEATHERS, 'none'),
    weatherColor: hex(o.weatherColor, '#FFFFFF'),
    gravity: clamp(o.gravity, 0.25, 1.4, 1),
    slippery: o.slippery === true,
    dark: o.dark === true,
    mood: pick(o.mood, MOODS, 'calm'),
  }
}

export function cleanTweak(raw: unknown): Tweak | null {
  const o = obj(raw)
  if (!o) return null
  const set: Tweak = {}
  if (typeof o.weather === 'string' && (WEATHERS as readonly string[]).includes(o.weather)) {
    set.weather = o.weather as Tweak['weather']
    set.weatherColor = hex(o.weatherColor, o.weather === 'rain' ? '#9CC7EE' : '#FFFFFF')
  }
  if (typeof o.gravity === 'number') set.gravity = clamp(o.gravity, 0.25, 1.4, 1)
  if (typeof o.slippery === 'boolean') set.slippery = o.slippery
  if (typeof o.dark === 'boolean') set.dark = o.dark
  return Object.keys(set).length ? set : null
}

/** What Lim can do with an item: a few things with anything, more by trait. */
export function actionsFor(item: ItemSpec): Action[] {
  const has = (t: Trait) => item.traits.includes(t)
  // A hoop or a goal stands where it is: something to look at and shoot at.
  if (has('hoop') || has('goal')) return ['look', 'shoot', 'remove']
  const out: Action[] = ['look', 'kick', 'hug', 'remove']
  if (has('bouncy') || has('floaty')) out.push('bounce')
  if (has('bouncy') && !has('floaty')) out.push('shoot')
  if (has('edible')) out.push('eat')
  if (has('hat') || has('glasses')) out.push('wear')
  if (has('cozy') || has('soft')) out.push('nap')
  if (has('musical')) out.push('dance')
  return out
}

/* ── Catalog ─────────────────────────────────────────────────────── */

const part = (shape: Shape, color: string, scale: [number, number, number] = [1, 1, 1], at: [number, number, number] = [0, 0, 0], tilt = 0): Part => ({
  shape, color, at, scale, tilt,
})
const painted = (p: Part, paint: Paint, ink: string): Part => ({ ...p, paint, ink })
const item = (name: string, traits: Trait[], parts: Part[], size = 1, face = -1): ItemSpec => ({ name, parts, size, traits, face })

export const ITEMS: Record<string, { spec: ItemSpec; aliases: string[] }> = {
  bean: { aliases: ['jellybean'], spec: item('jelly bean', ['edible'], [part('bean', '#C7B6FF', [1.1, 0.7, 0.72])]) },
  gumball: { aliases: ['gum ball'], spec: item('gumball', ['bouncy'], [part('ball', '#9FD3FF', [0.9, 0.9, 0.9])]) },
  ball: {
    aliases: ['beach ball'],
    spec: item('ball', ['bouncy'], [part('ball', '#FF7E6B'), part('ball', '#FFFFFF', [0.46, 0.46, 0.2], [0, 0.1, 0.84]), part('ball', '#FFD978', [0.3, 0.3, 0.16], [0.62, 0.52, 0.56]), part('ball', '#9FD3FF', [0.3, 0.3, 0.16], [-0.62, 0.52, 0.56])], 1.3),
  },
  apple: {
    aliases: [],
    spec: item('apple', ['edible'], [part('ball', '#F0524F', [1, 0.92, 1]), part('cylinder', '#8A5A3C', [0.08, 0.26, 0.08], [0.04, 1.02, 0], -12), part('bean', '#7ECF8A', [0.36, 0.16, 0.14], [0.36, 1.12, 0], 24)], 1.05),
  },
  donut: { aliases: ['doughnut'], spec: item('donut', ['edible', 'soft'], [part('ring', '#FF9FC5', [1, 1, 0.42]), part('ring', '#F3C58A', [1.02, 1.02, 0.3], [0, 0, -0.14])], 1.05) },
  cupcake: {
    aliases: ['muffin'],
    spec: item('cupcake', ['edible'], [part('cylinder', '#E9B97A', [0.82, 0.62, 0.82]), part('ball', '#FF9FC5', [0.98, 0.6, 0.98], [0, 0.82, 0]), part('ball', '#F0524F', [0.24, 0.24, 0.24], [0, 1.5, 0])]),
  },
  chili: {
    aliases: ['chilli', 'chili pepper'],
    spec: item('chili', ['edible', 'hot'], [part('cone', '#E8402E', [0.42, 1.05, 0.42], [0, 0, 0], 180), part('cylinder', '#5DAA57', [0.1, 0.24, 0.1], [0, 1.12, 0], 14)]),
  },
  'party hat': {
    aliases: ['cone hat'],
    spec: item('party hat', ['hat'], [part('cone', '#B9A6FF', [0.82, 1.05, 0.82]), part('ball', '#FFD978', [0.24, 0.24, 0.24], [0, 1.12, 0]), part('disc', '#FF9FC5', [0.95, 0.1, 0.95], [0, -0.9, 0])], 1.15),
  },
  crown: {
    aliases: ['tiara'],
    spec: item('crown', ['hat', 'glowing'], [part('cylinder', '#FFD25E', [0.92, 0.42, 0.92]), part('cone', '#FFD25E', [0.26, 0.42, 0.26], [-0.6, 0.66, 0]), part('cone', '#FFD25E', [0.26, 0.5, 0.26], [0, 0.72, 0.3]), part('cone', '#FFD25E', [0.26, 0.42, 0.26], [0.6, 0.66, 0]), part('ball', '#F0524F', [0.16, 0.16, 0.16], [0, 0.05, 0.9])], 1.1),
  },
  sunglasses: {
    aliases: ['shades'],
    spec: item('sunglasses', ['glasses'], [part('box', '#2B2140', [0.2, 0.08, 0.12]), part('box', '#2B2140', [0.56, 0.42, 0.14], [-0.74, -0.06, 0]), part('box', '#2B2140', [0.56, 0.42, 0.14], [0.74, -0.06, 0])], 1.25),
  },
  teddy: {
    aliases: ['teddy bear', 'plushie', 'stuffed animal'],
    spec: item('teddy', ['soft', 'cozy'], [part('ball', '#C99A6B', [0.9, 1, 0.82]), part('ball', '#C99A6B', [0.72, 0.68, 0.66], [0, 1.3, 0.1]), part('ball', '#B98558', [0.26, 0.26, 0.2], [-0.56, 1.86, 0.1]), part('ball', '#B98558', [0.26, 0.26, 0.2], [0.56, 1.86, 0.1]), part('ball', '#F1D9BC', [0.3, 0.24, 0.2], [0, 1.16, 0.66])], 1.05, 1),
  },
  pillow: { aliases: ['cushion'], spec: item('pillow', ['soft', 'cozy'], [part('box', '#EDE6FF', [1.25, 0.5, 0.9])], 1.25) },
  drum: {
    aliases: ['boombox', 'bongo'],
    spec: item('drum', ['musical'], [part('cylinder', '#F0524F', [0.95, 0.7, 0.95]), part('disc', '#FFF3DC', [0.9, 0.08, 0.9], [0, 0.72, 0]), part('disc', '#FFD25E', [1.02, 0.07, 1.02], [0, 0.42, 0])], 1.15),
  },
  balloon: {
    aliases: ['ballon'],
    spec: item('balloon', ['floaty', 'bouncy'], [part('ball', '#F0524F', [0.86, 1.05, 0.86]), part('cone', '#D9413F', [0.16, 0.16, 0.16], [0, -1.12, 0])], 1.25),
  },
  duck: {
    aliases: ['rubber duck', 'ducky', 'duckling'],
    spec: item('rubber duck', ['bouncy', 'soft'], [part('ball', '#FFD84D', [1, 0.78, 0.86]), part('ball', '#FFD84D', [0.58, 0.58, 0.56], [0.5, 0.98, 0]), part('cone', '#FF9A3D', [0.22, 0.26, 0.2], [1.12, 0.92, 0], -90), part('cone', '#FFD84D', [0.3, 0.4, 0.2], [-0.98, 0.34, 0], 62)], 1.05, 1),
  },
  cactus: {
    aliases: ['succulent'],
    spec: item('cactus', ['prickly'], [part('cylinder', '#D98A5B', [0.62, 0.42, 0.62]), part('cylinder', '#6CC08B', [0.42, 0.98, 0.42], [0, 1.3, 0]), part('cylinder', '#6CC08B', [0.2, 0.42, 0.2], [-0.6, 1.5, 0], 24), part('cylinder', '#6CC08B', [0.2, 0.36, 0.2], [0.6, 1.2, 0], -24)], 1.05, 1),
  },
  ghost: {
    aliases: ['spook'],
    spec: item('ghost', ['scary', 'floaty'], [part('drop', '#F6F2FF', [0.9, 1.05, 0.8], [0, 0, 0], 180)], 1.2, 0),
  },
  'ice cube': { aliases: ['icecube'], spec: item('ice cube', ['cold'], [part('box', '#BFE6FF', [0.82, 0.82, 0.82])]) },
  star: { aliases: [], spec: item('star', ['glowing', 'bouncy'], [part('star', '#FFD25E', [1, 1, 0.42])], 1.1) },
  heart: { aliases: ['love heart'], spec: item('heart', ['soft'], [part('heart', '#FF6F9C', [1, 1, 0.55])], 1.05) },
  basketball: {
    aliases: ['basket ball'],
    spec: item('basketball', ['bouncy'], [painted(part('ball', '#F08A3C'), 'seams', '#4A2F5C')], 1.15),
  },
  'soccer ball': {
    aliases: ['football', 'soccerball', 'footy'],
    spec: item('soccer ball', ['bouncy'], [painted(part('ball', '#EBEBEB'), 'patches', '#2B2140')], 1.1),
  },
  // A hoop and a goal are drawn by scene/fixtures.ts; the parts are their colours (frame, then net or board) and a rough likeness.
  hoop: {
    aliases: ['basketball hoop', 'basket', 'basketball net'],
    spec: item('hoop', ['hoop', 'heavy'], [part('box', '#F4F0FF', [0.9, 0.62, 0.12]), part('ring', '#F0524F', [0.5, 0.5, 0.3], [0, -0.5, 0.6]), part('cylinder', '#B9A6FF', [0.1, 0.9, 0.1], [0, -1.3, -0.2])], 1.7),
  },
  goal: {
    aliases: ['soccer goal', 'football goal', 'goalpost', 'goalposts', 'goal post', 'net'],
    spec: item('goal', ['goal', 'heavy'], [part('box', '#F4F0FF', [1.2, 0.1, 0.1]), part('cylinder', '#F4F0FF', [0.1, 0.8, 0.1], [-1.1, -0.8, 0]), part('cylinder', '#F4F0FF', [0.1, 0.8, 0.1], [1.1, -0.8, 0])], 1.7),
  },
}

const place = (p: Omit<PlaceSpec, 'gravity' | 'slippery' | 'dark' | 'stars' | 'scenery'> & Partial<PlaceSpec>): PlaceSpec => ({
  gravity: 1, slippery: false, dark: false, stars: false, scenery: [], ...p,
})

/** `studio` is Lim's own room: no spec, the page shows through. */
export const PLACES: Record<string, { spec: PlaceSpec; aliases: string[] }> = {
  beach: {
    aliases: ['seaside', 'seashore'],
    spec: place({ name: 'beach', scenery: ['palms', 'rocks', 'clouds'], sky: ['#7FD3F7', '#FFE9C7'], floor: '#F6DFAE', dots: '#EBCB8E', rug: '#FFB59E', pattern: 'dots', horizon: 'waves', horizonColor: '#4FB6D9', orb: 'sun', orbColor: '#FFE27A', weather: 'none', weatherColor: '#FFFFFF', mood: 'hot' }),
  },
  snow: {
    aliases: ['arctic', 'north pole', 'tundra'],
    spec: place({ name: 'snow', scenery: ['pines', 'snowmen', 'clouds', 'mist'], sky: ['#BFD9F2', '#F4F8FF'], floor: '#F7FAFF', dots: '#DCE8F7', rug: '#BFE6FF', pattern: 'plain', horizon: 'mountains', horizonColor: '#C9D8EE', orb: 'none', orbColor: '#FFFFFF', weather: 'snow', weatherColor: '#FFFFFF', slippery: true, mood: 'cold' }),
  },
  space: {
    aliases: ['outer space', 'galaxy', 'cosmos'],
    spec: place({ name: 'space', scenery: ['craters', 'rocks'], sky: ['#120C2E', '#3A2470'], floor: '#8E86B8', dots: '#6F6798', rug: '#C7B6FF', pattern: 'dots', horizon: 'dunes', horizonColor: '#6F6798', orb: 'planet', orbColor: '#FF9FC5', stars: true, weather: 'none', weatherColor: '#FFFFFF', gravity: 0.3, dark: true, mood: 'floaty' }),
  },
  meadow: {
    aliases: ['countryside'],
    spec: place({ name: 'meadow', scenery: ['trees', 'flowers', 'mushrooms', 'clouds'], sky: ['#9EDCFF', '#EAF9E1'], floor: '#B9E59B', dots: '#9CD67C', rug: '#FFE27A', pattern: 'dots', horizon: 'hills', horizonColor: '#86CC7A', orb: 'sun', orbColor: '#FFF1A8', weather: 'petals', weatherColor: '#FFB7D2', mood: 'calm' }),
  },
  underwater: {
    aliases: ['under the sea', 'aquarium', 'reef', 'deep sea'],
    spec: place({ name: 'underwater', scenery: ['coral', 'seaweed', 'fish', 'rocks'], sky: ['#1F6FA8', '#7FD6D9'], floor: '#E4D3A2', dots: '#CDB983', rug: '#7FD6B5', pattern: 'waves', horizon: 'dunes', horizonColor: '#3F9DB5', orb: 'none', orbColor: '#FFFFFF', weather: 'bubbles', weatherColor: '#DDF6FF', gravity: 0.42, mood: 'floaty' }),
  },
  volcano: {
    aliases: [],
    spec: place({ name: 'volcano', scenery: ['volcano', 'rocks', 'deadtrees', 'clouds'], sky: ['#3B1420', '#E0603A'], floor: '#5A3A40', dots: '#7A4A44', rug: '#FF8B5A', pattern: 'checks', horizon: 'mountains', horizonColor: '#2A1418', orb: 'sun', orbColor: '#FFB05A', weather: 'embers', weatherColor: '#FFB05A', dark: true, mood: 'hot' }),
  },
  haunted: {
    aliases: ['graveyard', 'haunted house'],
    spec: place({ name: 'haunted', scenery: ['deadtrees', 'graves', 'mist'], sky: ['#17132B', '#3B2E5C'], floor: '#4A4470', dots: '#3B3660', rug: '#6CC08B', pattern: 'stripes', horizon: 'trees', horizonColor: '#120E22', orb: 'moon', orbColor: '#F3EDFF', stars: true, weather: 'fireflies', weatherColor: '#C8FF9E', dark: true, mood: 'spooky' }),
  },
  disco: {
    aliases: ['dance floor', 'rave'],
    spec: place({ name: 'disco', scenery: ['buildings', 'spotlights'], sky: ['#2B1650', '#7A3FA8'], floor: '#3B2A66', dots: '#FF9FC5', rug: '#9FD3FF', pattern: 'checks', horizon: 'city', horizonColor: '#1C1038', orb: 'none', orbColor: '#FFFFFF', stars: true, weather: 'none', weatherColor: '#FFFFFF', dark: true, mood: 'party' }),
  },
}

/* ── Reading a message without the model ─────────────────────────── */

/*
 * The model decides what a message means (the chat's system prompt teaches it
 * to answer a world order with `@@world {json}`, see server/src/lim/world.ts).
 * This is only the shortcut in front of it: an order whose WHOLE text parses
 * and names something Lim already knows (the catalog, something made earlier,
 * something in the world) is acted out at once, with no model call. Anything
 * that does not parse exactly ("give him a break", "remove all the fluff",
 * "Can he play music?") is left for the model, which answers it normally.
 */
/** How the model's answer starts when it is an order for the world. */
export const WORLD_MARK = '@@world'

const END = String.raw`(?:\s+(?:please|pls|now|too|again))*[\s.!?]*$`
/** For forms that would also read as a question ("zero gravity?"). */
const END_FLAT = String.raw`(?:\s+(?:please|pls|now))*[\s.!]*$`
const START = String.raw`^\s*(?:(?:please|pls|hey|ok|okay|now|lim)[,!]?\s+)*(?:(?:can|could|would|will) you (?:please )?)?`
const WHO = String.raw`(?:lim|him|her)`
const DET = String.raw`(?:a|an|some|the|another|more|his|her|lim's)`
/** One to five words. */
const THING = String.raw`((?:[\p{L}\p{N}'-]+\s+){0,4}[\p{L}\p{N}'-]+)`
const rx = (body: string, end = END) => new RegExp(START + body + end, 'iu')

const GIVE = [
  rx(String.raw`(?:give|bring|get|hand|toss|throw|buy) ${WHO} ${DET} ${THING}`),
  rx(String.raw`(?:give|bring|hand|toss|throw) ${DET} ${THING} to ${WHO}`),
  rx(String.raw`(?:can|could|may) (?:lim|he|she) (?:please )?(?:have|get) ${DET} ${THING}`),
  rx(String.raw`lim (?:needs|wants|deserves|should have|should get) ${DET} ${THING}`),
]
const DRESS = [
  rx(String.raw`put ${DET} ${THING} on (?:${WHO}|his head|her head|lim's head)`),
  rx(String.raw`(?:can|could|may) (?:lim|he|she) (?:please )?(?:wear|try on) ${DET} ${THING}`),
  rx(String.raw`lim should wear ${DET} ${THING}`),
]
const GO = [
  rx(String.raw`(?:take|send|bring|teleport|move) ${WHO} to (?:(?:a|an|the) )?${THING}`),
  rx(String.raw`(?:can|could|may) (?:lim|he|she) (?:please )?(?:go to|visit) (?:a|an|the) ${THING}`),
]
/** No one named: only a place Lim knows. */
const GO_SELF = rx(String.raw`go to (?:(?:a|an|the) )?${THING}`)
const HOME = rx(String.raw`(?:(?:take|send|bring) ${WHO} (?:home|back home|back to the studio)|go home|go back home|(?:go )?back to the studio)`)
const FEED = rx(String.raw`feed ${WHO} (?:the|a|an|that|this|his|her|some) ${THING}`)
const ACT = rx(
  String.raw`(?:(?:make|let|have) ${WHO} )?(eat|wear|try on|put on|kick|punt|hug|cuddle|snuggle|bounce|juggle|shoot|dunk|nap on|sleep on|dance to|dance with|remove|take off|take away|put away|get rid of) (?:the|a|an|that|this|his|her|lim's|some) ${THING}`,
)
/** A game: whatever is missing is fetched, then Lim takes a shot. */
const SPORT = rx(String.raw`(?:(?:let'?s|lets|make ${WHO}|have ${WHO}|let ${WHO}) )?play (?:some |a game of )?(soccer|football|footy|basketball|hoops)(?: with (?:${WHO}|me))?`)
const PLAY = rx(String.raw`(?:(?:make|let|have) ${WHO} )?play with (?:the|a|an|that|this) ${THING}`)
const TAKE_OFF = rx(String.raw`take (?:(?:(it|that)|(?:the|his|her) (hat|glasses)) off|off (?:the|his|her|lim's) (hat|glasses))`)
const CLEAR = rx(
  String.raw`(?:(?:tidy up|clean up|clear up|clear|remove|get rid of|put away) (?:all )?(?:the |his |her |lim's )toys|(?:tidy up|clean up|clear up) (?:the |his |her |lim's )(?:room|stage)|reset (?:the |lim's )(world|room|stage))`,
  END_FLAT,
)
const RAIN = rx(String.raw`(?:make|let) it (rain|snow)`)
const DRY = rx(String.raw`(?:stop|no more|clear) (?:the )?(?:rain|snow|weather)`)
const FLOAT = rx(String.raw`(?:(?:make it|turn on|switch to) )?(?:low|zero|no|moon) ?-?gravity`, END_FLAT)
const HEAVY = rx(String.raw`(?:(?:make it|turn on|switch to|back to) )?(?:normal|regular|earth) ?-?gravity`, END_FLAT)
/** The air, in words the catalog doesn't cover: the model picks the weather. */
const SKY = rx(String.raw`(?:make it (?:night|nighttime|day|daytime|dark|sunny|windy|foggy|misty|stormy|cloudy|winter|summer|autumn|spring|cold|hot)|change the weather(?: to ${THING})?)`)

/** The site owner, the visitor, or the conversation itself: never Lim's world. */
const NOT_THE_WORLD =
  /\b(anthony|anthony's|resume|résumé|cv|career|jobs?|works?|worked|working|experience|skills?|projects?|contact|email|hire|hiring|school|college|degree|company|companies|github|linkedin|background|portfolio|salary|interview|meeting|office|role|promotion|website|languages?|stack|team|clients?|topic|subject|question|answer|chat|conversation|messages?|list|table|summary|tl;?dr|details?|poem|story|joke|code|links?|page|site|mode|theme|section|points?|examples?|paragraph|sentence|words?|thread|facts?|jargon|formatting|intro)\b/i
/** Not things: what "give him a …" usually ends in when it is a figure of speech. */
const ABSTRACT = new Set(
  `break chance hand shout shoutout raise credit try shot minute second moment sec name call ring regards thanks feedback go say visa contract hell
  rating attack rest look lift job offer note number hint clue tip idea reason compliment review vote pass turn voice title nickname heads-up favor
  favour time while bit lot listen read watch test trial tour demo talk chat word push nudge boost pat five applause mind me my mine us our you your
  yours this that it him them here there at in over about by to on for up out off next one same other else everything anything something nothing`.split(/\s+/),
)
const concrete = (thing: string) => !thing.split(/\s+/).some((w) => ABSTRACT.has(w))

/** The captured phrase without the politeness the grammar let through. */
const tidy = (thing: string) => thing.toLowerCase().replace(/(?:\s+(?:please|pls|now|too|again))+$/, '').trim()

const thingOf = (text: string, patterns: RegExp[]): string | null => {
  for (const re of patterns) {
    const m = re.exec(text)
    const thing = m?.[m.length - 1] ? tidy(m[m.length - 1]) : undefined
    if (thing && concrete(thing)) return thing
  }
  return null
}

/**
 * Shaped like an order for something Lim doesn't know yet. The model has the
 * final say; this only keeps a typed trick ("tiny", "pop") from firing on
 * "can he have a tiny castle", so a wrong guess costs nothing.
 */
export function looksLikeWorldRequest(text: string): boolean {
  const s = text.trim()
  if (!s || s.length > 120 || NOT_THE_WORLD.test(s)) return false
  return thingOf(s, GIVE) !== null || thingOf(s, DRESS) !== null || thingOf(s, GO) !== null || SKY.test(s)
}

const VERBS: Record<string, Action> = {
  eat: 'eat', wear: 'wear', 'try on': 'wear', 'put on': 'wear', kick: 'kick', punt: 'kick', hug: 'hug', cuddle: 'hug', snuggle: 'hug',
  bounce: 'bounce', juggle: 'bounce', shoot: 'shoot', dunk: 'shoot', 'nap on': 'nap', 'sleep on': 'nap', 'dance to': 'dance', 'dance with': 'dance',
  remove: 'remove', 'take off': 'remove', 'take away': 'remove', 'put away': 'remove', 'get rid of': 'remove',
}

/** Things the model made earlier for this visitor: as good as catalog entries. */
export type Extra = { items: ItemSpec[]; places: PlaceSpec[] }

const same = (thing: string, word: string) => thing === word || thing === `${word}s` || `${thing}s` === word
const catalogWords = (name: string): string[] => {
  const hit = Object.entries(ITEMS).find(([, x]) => x.spec.name === name)
  return hit ? [hit[0], ...hit[1].aliases] : []
}
/** The item a phrase names exactly: by its name, its catalog id or an alias. */
function itemNamed(thing: string, extra?: Extra): ItemSpec | null {
  for (const [id, { spec, aliases }] of Object.entries(ITEMS)) if ([id, spec.name, ...aliases].some((w) => same(thing, w))) return spec
  return extra?.items.find((spec) => same(thing, spec.name)) ?? null
}
function placeNamed(thing: string, extra?: Extra): PlaceSpec | null {
  for (const [id, { spec, aliases }] of Object.entries(PLACES)) if ([id, ...aliases].some((w) => same(thing, w))) return spec
  return extra?.places.find((spec) => same(thing, spec.name)) ?? null
}

/** "a ball", "an apple", "some sunglasses". */
const plural = (name: string) => /glasses$/.test(name) || (/s$/.test(name) && !/(ss|us|is|ns)$/.test(name))
/** By sound, near enough: "a unicorn", "an hourglass". */
const an = (name: string) => (/^[aeiou]/.test(name) && !/^(uni|use|usa|uku|eu|one)/.test(name)) || /^(hour|honest|heir)/.test(name)
export const withArticle = (name: string) => (plural(name) ? `some ${name}` : an(name) ? `an ${name}` : `a ${name}`)
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export type LocalIntent = { ops: WorldOp[]; reply: string }

/**
 * The free path: an order that names something in the catalog, something made
 * earlier, or something already in the world needs no model. Returns null when
 * the message isn't one, so the caller can ask the model to invent it
 * (`looksLikeWorldRequest`) or just answer the question.
 */
export function localIntent(text: string, inWorld: ItemSpec[] = [], extra?: Extra, worn: string[] = []): LocalIntent | null {
  const s = text.trim()
  if (!s || s.length > 120) return null
  const clear = CLEAR.exec(s)
  if (clear) return { ops: [{ op: 'clear', what: clear[1] ? 'all' : 'items' }], reply: 'All tidy!' }
  // The air, not the place: "make it snow" keeps Lim where it is.
  const rain = RAIN.exec(s)
  if (rain) {
    const weather = rain[1].toLowerCase() === 'snow' ? 'snow' : 'rain'
    return { ops: [{ op: 'tweak', set: { weather, weatherColor: weather === 'rain' ? '#9CC7EE' : '#FFFFFF' } }], reply: weather === 'rain' ? 'Drip, drop!' : 'Snow day!' }
  }
  if (DRY.test(s)) return { ops: [{ op: 'tweak', set: { weather: 'none' } }], reply: 'All clear.' }
  if (FLOAT.test(s)) return { ops: [{ op: 'tweak', set: { gravity: 0.3 } }], reply: 'Wheee, floaty!' }
  if (HEAVY.test(s)) return { ops: [{ op: 'tweak', set: { gravity: 1 } }], reply: 'Feet on the ground.' }
  if (HOME.test(s)) return { ops: [{ op: 'place', spec: null }], reply: 'Home sweet home.' }
  if (NOT_THE_WORLD.test(s)) return null

  // By name, catalog word, or its last word: "the ball" is the soccer ball if that is the ball here.
  const here = (thing: string) =>
    inWorld.find((item) => [item.name, ...catalogWords(item.name)].some((w) => same(thing, w))) ??
    inWorld.find((item) => item.name.includes(' ') && same(thing, item.name.split(' ').pop()!)) ??
    null
  const sport = SPORT.exec(s)
  if (sport) {
    const hoops = /basket|hoops/i.test(sport[1])
    const ball = ITEMS[hoops ? 'basketball' : 'soccer ball'].spec
    const target = ITEMS[hoops ? 'hoop' : 'goal'].spec
    const has = (spec: ItemSpec) => inWorld.some((item) => item.name === spec.name)
    const ops: WorldOp[] = []
    if (!has(target)) ops.push({ op: 'item', spec: target })
    ops.push(has(ball) ? { op: 'act', action: 'shoot', target: ball.name } : { op: 'item', spec: ball, then: 'shoot' })
    return { ops, reply: hoops ? 'Game on! First to swish wins.' : 'Game on! Watch this shot.' }
  }
  const off = TAKE_OFF.exec(s)
  if (off) {
    // "The hat" is the hat Lim has on; "it" is whatever went on last. Nothing on: not ours to answer.
    const kind = (off[2] ?? off[3])?.toLowerCase() as 'hat' | 'glasses' | undefined
    const on = [...worn].reverse().find((name) => !kind || inWorld.find((item) => item.name === name)?.traits.includes(kind))
    return on ? { ops: [{ op: 'act', action: 'remove', target: on }], reply: 'Off it comes!' } : null
  }

  // "feed him the bean" is "eat the bean"; "play with the drum" is whatever that item is best for.
  const fed = thingOf(s, [FEED])
  const act = ACT.exec(s)
  const played = thingOf(s, [PLAY])
  if (fed || act || played) {
    const thing = fed ?? played ?? tidy(act![2])
    const present = here(thing)
    const spec = present ?? itemNamed(thing, extra)
    if (!spec) return null
    const able = actionsFor(spec)
    const action: Action = fed ? 'eat' : played ? ((['bounce', 'dance', 'hug', 'shoot'] as const).find((a) => able.includes(a)) ?? 'look') : VERBS[act![1].toLowerCase()]
    const said = fed ? 'eat' : played ? 'play with' : act![1].toLowerCase()
    if (!able.includes(action)) {
      // Only worth saying about something that is actually here.
      return present ? { ops: [], reply: `Hmm, I don't think I can ${said} ${withArticle(spec.name)}.` } : null
    }
    if (present) {
      const takenOff = action === 'remove' && worn.includes(present.name)
      return { ops: [{ op: 'act', action, target: present.name }], reply: takenOff ? 'Off it comes!' : actReply(action, present.name) }
    }
    // Not here: putting it away is moot; anything else, bring it and then do it.
    if (action === 'remove') return { ops: [], reply: `There ${plural(spec.name) ? 'are' : 'is'} no ${spec.name} here.` }
    return { ops: [{ op: 'item', spec, then: action }], reply: actReply(action, spec.name) }
  }

  const dress = thingOf(s, DRESS)
  if (dress) {
    const spec = here(dress) ?? itemNamed(dress, extra)
    if (!spec) return null
    if (!actionsFor(spec).includes('wear')) return here(dress) ? { ops: [], reply: `Hmm, I don't think I can wear ${withArticle(spec.name)}.` } : null
    return here(dress)
      ? { ops: [{ op: 'act', action: 'wear', target: spec.name }], reply: actReply('wear', spec.name) }
      : { ops: [{ op: 'item', spec, then: 'wear' }], reply: actReply('wear', spec.name) }
  }

  const given = thingOf(s, GIVE)
  if (given) {
    const spec = itemNamed(given, extra)
    return spec ? { ops: [{ op: 'item', spec }], reply: `${cap(withArticle(spec.name))}, coming up!` } : null
  }

  const where = thingOf(s, GO) ?? thingOf(s, [GO_SELF])
  if (where) {
    if (same(where, 'studio')) return { ops: [{ op: 'place', spec: null }], reply: 'Home sweet home.' }
    const spec = placeNamed(where, extra)
    return spec ? { ops: [{ op: 'place', spec }], reply: `Scene change: ${spec.name}!` } : null
  }

  // Just a catalog name, asked for politely: "a ball please", "the beach please".
  const bare = /^\s*(?:(?:a|an|the|some)\s+)?([\p{L}' -]+?)\s+(?:please|pls)[\s.!]*$/iu.exec(s)
  if (bare) {
    const thing = bare[1].trim().toLowerCase()
    const item = itemNamed(thing)
    if (item) return { ops: [{ op: 'item', spec: item }], reply: `${cap(withArticle(item.name))}, coming up!` }
    // "some space please" is a figure of speech, not a trip.
    const spot = /^\s*some\b/i.test(s) ? null : placeNamed(thing)
    if (spot) return { ops: [{ op: 'place', spec: spot }], reply: `Scene change: ${spot.name}!` }
  }
  return null
}

const actReply = (action: Action, name: string) =>
  ({
    look: `Ooh, the ${name}.`,
    kick: `Watch this ${name} fly!`,
    bounce: `Keepy-uppy with the ${name}!`,
    eat: `Don't mind if I do.`,
    wear: `How do I look?`,
    hug: `Come here, ${name}.`,
    nap: `Just five minutes…`,
    dance: `Hit it!`,
    remove: `Bye, ${name}!`,
    shoot: `Here goes!`,
  })[action]

/* ── What the model sends back ───────────────────────────────────── */

/** Turn the model's JSON into safe ops. Unknown or broken entries are dropped. */
export function cleanOps(raw: unknown): WorldOp[] {
  const list = Array.isArray(raw) ? raw : []
  const ops: WorldOp[] = []
  for (const entry of list.slice(0, 4)) {
    const o = obj(entry)
    if (!o) continue
    if (o.op === 'item') {
      // By catalog id, display name or alias: the model sees names ("jelly bean"), the catalog keys are ids ("bean").
      const known = typeof o.id === 'string' ? itemNamed(cleanName(o.id)) : null
      const spec = known ?? cleanItem(o.spec)
      const then = pick(o.then, ACTIONS, 'look')
      if (spec) ops.push({ op: 'item', spec, then: o.then && then !== 'remove' ? then : undefined })
    } else if (o.op === 'place') {
      const id = typeof o.id === 'string' ? cleanName(o.id) : ''
      if (id === 'studio') ops.push({ op: 'place', spec: null })
      else {
        const spec = (id ? placeNamed(id) : null) ?? cleanPlace(o.spec)
        if (spec) ops.push({ op: 'place', spec })
      }
    } else if (o.op === 'tweak') {
      const set = cleanTweak(o.set)
      if (set) ops.push({ op: 'tweak', set })
    } else if (o.op === 'act') {
      ops.push({ op: 'act', action: pick(o.action, ACTIONS, 'look'), target: cleanName(o.target) })
    } else if (o.op === 'clear') {
      ops.push({ op: 'clear', what: pick(o.what, ['items', 'place', 'all'] as const, 'items') })
    }
  }
  return ops
}
