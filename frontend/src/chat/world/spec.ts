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
  'edible', 'bouncy', 'heavy', 'floaty', 'hat', 'glasses', 'soft', 'cozy', 'musical', 'scary', 'hot', 'cold', 'glowing', 'prickly',
] as const
export type Trait = (typeof TRAITS)[number]

export type Part = {
  shape: Shape
  color: string
  /** Offset from the body's centre, in body radii. */
  at: [number, number, number]
  /** Half-extents in body radii. */
  scale: [number, number, number]
  /** Lean about the view axis, degrees. */
  tilt: number
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

export const ACTIONS = ['look', 'kick', 'bounce', 'eat', 'wear', 'hug', 'nap', 'dance', 'remove'] as const
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
    parts.push({
      shape: pick(q.shape, SHAPES, 'ball'),
      color: soften(hex(q.color, '#FF9FC5')),
      at: parts.length === 0 ? [0, 0, 0] : triple(q.at, -1.8, 1.8, 0),
      scale: triple(q.scale, 0.08, 1.6, parts.length === 0 ? 1 : 0.4),
      tilt: clamp(q.tilt, -180, 180, 0),
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
  const out: Action[] = ['look', 'kick', 'hug', 'remove']
  if (has('bouncy') || has('floaty')) out.push('bounce')
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
}

const place = (p: Omit<PlaceSpec, 'gravity' | 'slippery' | 'dark' | 'stars'> & Partial<PlaceSpec>): PlaceSpec => ({
  gravity: 1, slippery: false, dark: false, stars: false, ...p,
})

/** `studio` is Lim's own room: no spec, the page shows through. */
export const PLACES: Record<string, { spec: PlaceSpec; aliases: string[] }> = {
  beach: {
    aliases: ['seaside', 'seashore'],
    spec: place({ name: 'beach', sky: ['#7FD3F7', '#FFE9C7'], floor: '#F6DFAE', dots: '#EBCB8E', rug: '#FFB59E', pattern: 'dots', horizon: 'waves', horizonColor: '#4FB6D9', orb: 'sun', orbColor: '#FFE27A', weather: 'none', weatherColor: '#FFFFFF', mood: 'hot' }),
  },
  snow: {
    aliases: ['arctic', 'north pole', 'tundra'],
    spec: place({ name: 'snow', sky: ['#BFD9F2', '#F4F8FF'], floor: '#F7FAFF', dots: '#DCE8F7', rug: '#BFE6FF', pattern: 'plain', horizon: 'mountains', horizonColor: '#C9D8EE', orb: 'none', orbColor: '#FFFFFF', weather: 'snow', weatherColor: '#FFFFFF', slippery: true, mood: 'cold' }),
  },
  space: {
    aliases: ['outer space', 'galaxy', 'cosmos'],
    spec: place({ name: 'space', sky: ['#120C2E', '#3A2470'], floor: '#8E86B8', dots: '#6F6798', rug: '#C7B6FF', pattern: 'dots', horizon: 'dunes', horizonColor: '#6F6798', orb: 'planet', orbColor: '#FF9FC5', stars: true, weather: 'none', weatherColor: '#FFFFFF', gravity: 0.3, dark: true, mood: 'floaty' }),
  },
  meadow: {
    aliases: ['countryside'],
    spec: place({ name: 'meadow', sky: ['#9EDCFF', '#EAF9E1'], floor: '#B9E59B', dots: '#9CD67C', rug: '#FFE27A', pattern: 'dots', horizon: 'hills', horizonColor: '#86CC7A', orb: 'sun', orbColor: '#FFF1A8', weather: 'petals', weatherColor: '#FFB7D2', mood: 'calm' }),
  },
  underwater: {
    aliases: ['under the sea', 'aquarium', 'reef', 'deep sea'],
    spec: place({ name: 'underwater', sky: ['#1F6FA8', '#7FD6D9'], floor: '#E4D3A2', dots: '#CDB983', rug: '#7FD6B5', pattern: 'waves', horizon: 'dunes', horizonColor: '#3F9DB5', orb: 'none', orbColor: '#FFFFFF', weather: 'bubbles', weatherColor: '#DDF6FF', gravity: 0.42, mood: 'floaty' }),
  },
  volcano: {
    aliases: [],
    spec: place({ name: 'volcano', sky: ['#3B1420', '#E0603A'], floor: '#5A3A40', dots: '#7A4A44', rug: '#FF8B5A', pattern: 'checks', horizon: 'mountains', horizonColor: '#2A1418', orb: 'sun', orbColor: '#FFB05A', weather: 'embers', weatherColor: '#FFB05A', dark: true, mood: 'hot' }),
  },
  haunted: {
    aliases: ['graveyard', 'haunted house'],
    spec: place({ name: 'haunted', sky: ['#17132B', '#3B2E5C'], floor: '#4A4470', dots: '#3B3660', rug: '#6CC08B', pattern: 'stripes', horizon: 'trees', horizonColor: '#120E22', orb: 'moon', orbColor: '#F3EDFF', stars: true, weather: 'fireflies', weatherColor: '#C8FF9E', dark: true, mood: 'spooky' }),
  },
  disco: {
    aliases: ['dance floor', 'rave'],
    spec: place({ name: 'disco', sky: ['#2B1650', '#7A3FA8'], floor: '#3B2A66', dots: '#FF9FC5', rug: '#9FD3FF', pattern: 'checks', horizon: 'city', horizonColor: '#1C1038', orb: 'none', orbColor: '#FFFFFF', stars: true, weather: 'none', weatherColor: '#FFFFFF', dark: true, mood: 'party' }),
  },
}

/* ── Reading a message without the model ─────────────────────────── */

/*
 * Intercepting a message means the visitor gets Lim's one-liner instead of an
 * answer, so the bar is high: only an explicit order ("give him…", "take Lim
 * to…", "make it rain") or a wish on Lim's behalf ("can he have…") counts.
 * A question, a remark, or anything about Anthony always goes to the chat.
 */
const LEAD = String.raw`(?:(?:please|pls|hey|hi|ok|okay|now|so|and|lim)[,!]?\s+)*`
const LIM = String.raw`(?:lim|him|her|it|them)`
const ORDER = new RegExp(
  String.raw`^\s*${LEAD}(?:(?:can|could|would|will) you (?:please )?|let'?s )?` +
    String.raw`(?:(?:give|bring|feed|hand|toss|throw|get|buy) ${LIM}\b|(?:give|drop|toss|throw|bring|summon|conjure|spawn) (?:a|an|some|the|another|more)\b|gimme\b|` +
    String.raw`put (?:(?:a|an|some|the) .*\bon (?:lim|him|her|it|his|its|her)\b|${LIM} (?:in|on|at|under|by)\b)|take ${LIM} (?:to|home|back)\b|send ${LIM} (?:to|home|back)\b|` +
    String.raw`go (?:to (?:the|a|an|outer)\b|home\b|back (?:home|to the studio)\b)|teleport\b|(?:wear|eat|kick|hug|cuddle|bounce|juggle|play with|nap on|sleep on|dance with) (?:a|an|some|the|that|this|it)\b|` +
    String.raw`tidy\b|clean up\b|clear (?:up|everything|all|the (?:toys|items|things|stuff|room|stage|weather|sky))\b|(?:remove|get rid of|put away|take away|take off) (?:the|that|this|all|everything|${LIM}'?s?)\b|` +
    String.raw`reset the (?:world|room|stage)\b|make it (?:rain|snow|night|nighttime|day|daytime|dark|sunny|windy|winter|summer|autumn|spring|cold|hot|foggy|stormy)\b|let it (?:rain|snow)\b|` +
    String.raw`make (?:lim|him|her|them) (?:a|an|some|wear|eat|kick|hug|dance|bounce|nap)\b|stop the (?:rain|snow|weather)\b|no more (?:rain|snow)\b|(?:turn|switch) (?:on|off) the (?:rain|snow|gravity)\b|` +
    String.raw`change the (?:weather|place|scene|scenery|background|floor|sky)\b|set the (?:weather|scene|gravity)\b|decorate\b|build ${LIM}\b)`,
  'i',
)
const WISH =
  /\b(?:can|could|may) (?:lim|he|she|it|they) (?:please )?(?:have|get|wear|try on|eat|go to|visit|play with)\b|\blim (?:needs|wants|deserves|should have|should get|should wear) (?:a|an|some|the)\b|\bi want (?:lim|him|her|it|them) to (?:have|get|wear|eat|go|visit)\b/i
const AIR =
  /^\s*(?:please )?(?:make|let) it (?:rain|snow)\b|^\s*(?:please )?(?:(?:make|set|turn on|switch to|give (?:lim|him|her|it|them)) (?:it )?)?(?:low|zero|no|moon|normal|regular|earth) ?-?gravity(?: please)?[.!]*$|^\s*(?:stop|no more|clear) (?:the )?(?:rain|snow|weather)\b/i
/** The site owner, the visitor, or the conversation itself: never Lim's world. */
const ABOUT_ANTHONY =
  /\b(anthony|anthony's|resume|résumé|cv|career|jobs?|works?|worked|working|experience|skills?|projects?|contact|email|hire|hiring|school|college|degree|company|companies|github|linkedin|background|portfolio|salary|interview|call|meeting|office|role|offer|promotion|website|languages?|stack|team|clients?|touch|coffee with|lunch|week|tomorrow|today)\b|\b(?:with|for|to|at|about) (?:me|us|my|our)\b|\b(?:give|bring|throw|toss|hand|get|buy|show|tell|send) (?:me|us)\b/i
const ABOUT_THE_CHAT =
  /\b(topic|subject|question|answer|chat|conversation|messages?|list|table|summary|tl;?dr|details?|poem|story|joke|code|links?|page|site|mode|theme|section|points?|examples?|shorter|longer|short|brief|simple|simpler|clear(?:er)?ly|again|bullet|paragraph|sentence|words?)\b/i

/** Worth asking the model what this means for Lim's world. Anything else is chat. */
export function looksLikeWorldRequest(text: string): boolean {
  const s = text.trim()
  if (!s || s.length > 220 || ABOUT_ANTHONY.test(s) || ABOUT_THE_CHAT.test(s)) return false
  return ORDER.test(s) || WISH.test(s) || AIR.test(s)
}

const ACTION_WORDS: [RegExp, Action][] = [
  [/\b(eat|feed|munch|nom|taste|bite)\b/i, 'eat'],
  [/\b(wear|put on|try on)\b/i, 'wear'],
  [/\b(kick|punt|boot|throw|toss)\b/i, 'kick'],
  [/\b(bounce|juggle|play (with|catch))\b/i, 'bounce'],
  [/\b(hug|cuddle|snuggle)\b/i, 'hug'],
  [/\b(nap|sleep) on\b/i, 'nap'],
  [/\bdance\b/i, 'dance'],
  [/\b(remove|take away|put away|get rid of)\b/i, 'remove'],
]

const mentions = (text: string, word: string) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(text)

const catalogWords = (name: string): string[] => {
  const hit = Object.entries(ITEMS).find(([, x]) => x.spec.name === name)
  return hit ? [hit[0], ...hit[1].aliases] : []
}

/** Things the model made earlier for this visitor: as good as catalog entries. */
export type Extra = { items: ItemSpec[]; places: PlaceSpec[] }
type Noun = { kind: 'item'; spec: ItemSpec; words: string[] } | { kind: 'place'; spec: PlaceSpec; words: string[] } | { kind: 'studio'; words: string[] }

function nouns(extra?: Extra): Noun[] {
  const list: Noun[] = []
  for (const [id, { spec, aliases }] of Object.entries(ITEMS)) list.push({ kind: 'item', spec, words: [id, spec.name, ...aliases] })
  for (const [id, { spec, aliases }] of Object.entries(PLACES)) list.push({ kind: 'place', spec, words: [id, ...aliases] })
  for (const spec of extra?.items ?? []) list.push({ kind: 'item', spec, words: [spec.name] })
  for (const spec of extra?.places ?? []) list.push({ kind: 'place', spec, words: [spec.name] })
  list.push({ kind: 'studio', words: ['studio', 'go home', 'back home', 'his room', 'its room'] })
  return list
}

function findNoun(text: string, extra?: Extra): Noun | null {
  // Longest names first, so "beach ball" is the ball and not the beach.
  const hits = nouns(extra).flatMap((noun) => noun.words.map((word) => ({ word, noun })))
  hits.sort((a, b) => b.word.length - a.word.length)
  return hits.find(({ word }) => mentions(text, word))?.noun ?? null
}

/** The whole message is a catalog name: "beach!", "a rubber duck please". */
function bareNoun(text: string): Noun | null {
  const core = text.toLowerCase().replace(/[!.\s]+$/g, '').replace(/^(a|an|the|some)\s+/, '').replace(/\s+(please|pls)$/, '').trim()
  // A lone word is just a word ("apple", "sweet!"); "a ball", "space please" or
  // a two-word name ("rubber duck") is a request. Catalog names only.
  const asked = /^(a|an|the|some)\s/i.test(text.trim()) || /\b(please|pls)[!.\s]*$/i.test(text) || core.includes(' ')
  if (!asked) return null
  return nouns().find((noun) => noun.kind !== 'studio' && noun.words.some((w) => w === core)) ?? null
}

const FILLER = new Set(
  `a an the some one another to for with at in on into of and please pls now me him her it them they he she lim lims blob jelly his its
  give gimme drop toss throw add spawn bring hand feed put place summon conjure make get let lets go take send move teleport can could may would will
  have has want wants need needs like love i you we us up down over here there out back off away new more again too also then just
  eat wear kick hug cuddle bounce juggle play nap sleep dance try that this my your world room stage hey hi ok okay yes should deserves`.split(/\s+/),
)
/** Words in the message that are neither filler nor part of the noun that matched. */
function extraWords(text: string, noun: Noun): number {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean)
  const own = new Set(noun.words.flatMap((w) => w.split(' ')))
  return words.filter((w) => !FILLER.has(w) && !own.has(w) && !own.has(w.replace(/s$/, ''))).length
}

export type LocalIntent = { ops: WorldOp[]; reply: string }

/**
 * The free path: a clear request for something in the catalog (or made
 * earlier) needs no model. Returns null when the message isn't one, so the
 * caller can ask the model, or just answer the question.
 */
export function localIntent(text: string, inWorld: ItemSpec[] = [], extra?: Extra): LocalIntent | null {
  const s = text.trim()
  if (!s || s.length > 120 || ABOUT_ANTHONY.test(s)) return null
  const bare = bareNoun(s)
  if (!bare && !looksLikeWorldRequest(s)) return null
  if (/\b(tidy|clean) up\b|\b(clear|remove|get rid of) (everything|all|the (toys|items|things|stuff))\b|\breset the (world|room|stage)\b/i.test(s)) {
    return { ops: [{ op: 'clear', what: /everything|all\b|reset/i.test(s) ? 'all' : 'items' }], reply: 'All tidy!' }
  }
  // The air, not the place: "make it snow" keeps Lim where it is.
  if (AIR.test(s) && extraWords(s.replace(/\b(rain|snow|gravity|weather|low|zero|no|moon|normal|regular|earth|weightless|stop|clear|raining|snowing)\b/gi, ''), { kind: 'studio', words: [] }) === 0) {
    if (/\b(stop|no more|clear)\b/i.test(s)) return { ops: [{ op: 'tweak', set: { weather: 'none' } }], reply: 'All clear.' }
    if (/\b(normal|regular|earth)\b/i.test(s)) return { ops: [{ op: 'tweak', set: { gravity: 1 } }], reply: 'Feet on the ground.' }
    if (/gravity|weightless/i.test(s)) return { ops: [{ op: 'tweak', set: { gravity: 0.3 } }], reply: 'Wheee, floaty!' }
    const weather = /snow/i.test(s) ? 'snow' : 'rain'
    return { ops: [{ op: 'tweak', set: { weather, weatherColor: weather === 'rain' ? '#9CC7EE' : '#FFFFFF' } }], reply: weather === 'rain' ? 'Drip, drop!' : 'Snow day!' }
  }
  const action = ACTION_WORDS.find(([re]) => re.test(s))?.[1]
  // Something already here, named with an action: just do it.
  // Known by its name, or by what the catalog calls it ("the bean", "the duck").
  const here = inWorld.find((item) => [item.name, ...catalogWords(item.name)].some((w) => mentions(s, w)))
  if (here && action) {
    const can = actionsFor(here).includes(action)
    return { ops: [{ op: 'act', action, target: here.name }], reply: can ? actReply(action, here.name) : `Hmm, I don't think I can ${action} a ${here.name}.` }
  }
  const noun = bare ?? findNoun(s, extra)
  if (!noun) return null
  // Something the model made earlier has an everyday name ("coffee", "office"):
  // only a plain order brings it back.
  if (!bare && !nouns().some((n) => n.kind === noun.kind && n.words[0] === noun.words[0]) && !ORDER.test(s)) return null
  // Only when that is all the message says: "a candy castle" or "the beach at
  // night" is more than the catalog's candy or beach, and goes to the model.
  if (extraWords(s, noun) > 0) return null
  if (noun.kind === 'studio') return { ops: [{ op: 'place', spec: null }], reply: 'Home sweet home.' }
  if (noun.kind === 'place') return { ops: [{ op: 'place', spec: noun.spec }], reply: `Next stop: ${noun.spec.name}!` }
  const then = action && action !== 'remove' && actionsFor(noun.spec).includes(action) ? action : undefined
  return { ops: [{ op: 'item', spec: noun.spec, then }], reply: then ? actReply(then, noun.spec.name) : `One ${noun.spec.name}, coming up!` }
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
      const known = typeof o.id === 'string' ? ITEMS[o.id.toLowerCase()] : undefined
      const spec = known?.spec ?? cleanItem(o.spec)
      const then = pick(o.then, ACTIONS, 'look')
      if (spec) ops.push({ op: 'item', spec, then: o.then && then !== 'remove' ? then : undefined })
    } else if (o.op === 'place') {
      const id = typeof o.id === 'string' ? o.id.toLowerCase() : ''
      if (id === 'studio') ops.push({ op: 'place', spec: null })
      else {
        const spec = PLACES[id]?.spec ?? cleanPlace(o.spec)
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
