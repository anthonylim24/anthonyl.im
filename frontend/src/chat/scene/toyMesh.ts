/**
 * A catalog toy's Blender model on the stage (`bun art/render.ts meshes`; the file format is in
 * `art/toys.py` `export`). The model is fitted over the item's own body, and every frame it is
 * carried by that soft body: its turn, squash and stretch exactly, and the wobble as a smooth share
 * of the nearby particles' give. No three.js here, so it can be tested on its own.
 */
import { Effect } from 'effect'
import { DecodeError, HttpStatusError } from '@/effect/errors'
import { fetchExternal } from '@/effect/http'
import { runPromise } from '@/effect/runtime'
import type { Jelly, Vec3 } from '../../three/jelly'
import { cleanItem, ITEMS, type ItemSpec, type Part } from '../world/spec'

/** World radius of a size-1 item's body. */
export const ITEM_R = 0.3

/** One colour of the model; `glass` parts let light through (the lit look draws them as glass). */
export type ToyGroup = { start: number; count: number; color: string; glass: boolean }
/** Positions (three.js axes, standing on y = 0), triangles, and one index range per colour. */
export type ToyMesh = { positions: Float32Array; index: Uint16Array; groups: ToyGroup[] }
export type Box = { lo: Vec3; hi: Vec3 }

const TAG = 0x31594f54
const GLASS = 1 << 24

export function parseToyMesh(buffer: ArrayBuffer): ToyMesh {
  const view = new DataView(buffer)
  if (buffer.byteLength < 40 || view.getUint32(0, true) !== TAG) throw new Error('not a toy mesh')
  const vertices = view.getUint32(4, true)
  const indices = view.getUint32(8, true)
  const count = view.getUint32(12, true)
  if (40 + count * 12 + vertices * 6 + indices * 2 > buffer.byteLength) throw new Error('toy mesh is cut short')
  const lo = [0, 1, 2].map((i) => view.getFloat32(16 + i * 4, true))
  const hi = [0, 1, 2].map((i) => view.getFloat32(28 + i * 4, true))
  const groups: ToyGroup[] = []
  let at = 40
  for (let g = 0; g < count; g++, at += 12) {
    const word = view.getUint32(at + 8, true)
    groups.push({
      start: view.getUint32(at, true),
      count: view.getUint32(at + 4, true),
      color: `#${(word & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`,
      glass: (word & GLASS) !== 0,
    })
  }
  const packed = new Uint16Array(buffer, at, vertices * 3)
  const positions = new Float32Array(vertices * 3)
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3
    positions[i] = lo[axis] + (packed[i] / 65535) * (hi[axis] - lo[axis])
  }
  const index = new Uint16Array(buffer.slice(at + vertices * 6, at + vertices * 6 + indices * 2))
  return { positions, index, groups }
}

/** Half-sizes of a box turned by `tilt` degrees about z. */
function turned(half: Vec3, tilt: number): Vec3 {
  const c = Math.abs(Math.cos((tilt * Math.PI) / 180))
  const s = Math.abs(Math.sin((tilt * Math.PI) / 180))
  return [c * half[0] + s * half[1], s * half[0] + c * half[1], half[2]]
}

/** The box around an item's parts in its body's rest frame (the body is centred on the origin). */
export function itemBounds(spec: ItemSpec): Box {
  const R = ITEM_R * spec.size
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  spec.parts.forEach((part: Part, i) => {
    const half = turned([part.scale[0] * R, part.scale[1] * R, part.scale[2] * R], part.tilt)
    const at = i === 0 ? [0, 0, 0] : part.at.map((v) => v * R)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], at[k] - half[k])
      hi[k] = Math.max(hi[k], at[k] + half[k])
    }
  })
  return { lo, hi }
}

export function boundsOf(positions: Float32Array): Box {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], positions[i + k])
      hi[k] = Math.max(hi[k], positions[i + k])
    }
  }
  return { lo, hi }
}

/**
 * The model in its body's rest frame: one scale, the mean of what fits its width and its height to
 * the item's parts, standing where the parts stand and centred on them.
 */
export function fitToyMesh(mesh: ToyMesh, spec: ItemSpec): Float32Array {
  const m = boundsOf(mesh.positions)
  const b = itemBounds(spec)
  const k = ((b.hi[0] - b.lo[0]) / (m.hi[0] - m.lo[0]) + (b.hi[1] - b.lo[1]) / (m.hi[1] - m.lo[1])) / 2
  const mx = (m.lo[0] + m.hi[0]) / 2
  const mz = (m.lo[2] + m.hi[2]) / 2
  const bx = (b.lo[0] + b.hi[0]) / 2
  const bz = (b.lo[2] + b.hi[2]) / 2
  const out = new Float32Array(mesh.positions.length)
  for (let i = 0; i < out.length; i += 3) {
    out[i] = (mesh.positions[i] - mx) * k + bx
    out[i + 1] = (mesh.positions[i + 1] - m.lo[1]) * k + b.lo[1]
    out[i + 2] = (mesh.positions[i + 2] - mz) * k + bz
  }
  return out
}

/** For each model vertex, the body particles within reach and their weights (a compressed row list). */
export type SkinBind = { start: Uint32Array; near: Uint16Array; weight: Float32Array }

/**
 * Weights fall smoothly to nothing at `reach`, so neighbouring vertices never part. They are shared
 * out where the model hugs the body and fade where it leaves it, so a stem or an ear rides rigidly.
 */
export function bindToBody(model: Float32Array, body: Float32Array, reach: number): SkinBind {
  const count = model.length / 3
  const r2 = reach * reach
  const start = new Uint32Array(count + 1)
  const near: number[] = []
  const weight: number[] = []
  for (let v = 0; v < count; v++) {
    const x = model[v * 3]
    const y = model[v * 3 + 1]
    const z = model[v * 3 + 2]
    const first = near.length
    let total = 0
    for (let p = 0; p < body.length; p += 3) {
      const d2 = (body[p] - x) ** 2 + (body[p + 1] - y) ** 2 + (body[p + 2] - z) ** 2
      if (d2 >= r2) continue
      const w = (1 - d2 / r2) ** 3
      near.push(p / 3)
      weight.push(w)
      total += w
    }
    const share = 1 / Math.max(total, 1)
    for (let j = first; j < weight.length; j++) weight[j] *= share
    start[v + 1] = near.length
  }
  return { start, near: Uint16Array.from(near), weight: Float32Array.from(weight) }
}

/** How far a body's particles reach to carry the model: a few particle spacings. */
export function reachOf(body: Float32Array, radius: number): number {
  return 2.5 * Math.sqrt((4 * Math.PI * radius * radius) / (body.length / 3))
}

const ORIGIN: Vec3 = [0, 0, 0]
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const at0: Vec3 = [0, 0, 0]
const cols: Vec3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]

/**
 * Where the model is now: its rest position through the body's turn, squash and stretch, plus its
 * weighted share of the drawn skin's give (`skin` minus the goal shape), lifted whole if it would
 * dip under `floor`. Allocates nothing.
 */
export function carryToy(model: Float32Array, bind: SkinBind, jelly: Jelly, skin: ArrayLike<number>, out: Float32Array, floor: number) {
  jelly.attach(ORIGIN, at0)
  for (let k = 0; k < 3; k++) {
    jelly.attach(AXES[k], cols[k])
    cols[k][0] -= at0[0]
    cols[k][1] -= at0[1]
    cols[k][2] -= at0[2]
  }
  const [ax, ay, az] = cols
  const { goal } = jelly
  const { start, near, weight } = bind
  let low = Infinity
  for (let v = 0, i = 0; i < out.length; v++, i += 3) {
    const x = model[i]
    const y = model[i + 1]
    const z = model[i + 2]
    let px = at0[0] + ax[0] * x + ay[0] * y + az[0] * z
    let py = at0[1] + ax[1] * x + ay[1] * y + az[1] * z
    let pz = at0[2] + ax[2] * x + ay[2] * y + az[2] * z
    for (let j = start[v]; j < start[v + 1]; j++) {
      const p = near[j] * 3
      const w = weight[j]
      px += w * (skin[p] - goal[p])
      py += w * (skin[p + 1] - goal[p + 1])
      pz += w * (skin[p + 2] - goal[p + 2])
    }
    out[i] = px
    out[i + 1] = py
    out[i + 2] = pz
    if (py < low) low = py
  }
  if (low < floor) for (let i = 1; i < out.length; i += 3) out[i] += floor - low
}

const files = import.meta.glob<string>('../toys/*.mesh', { eager: true, query: '?url', import: 'default' })
const MESHES: Record<string, string> = Object.fromEntries(
  Object.keys(ITEMS).flatMap((key) => {
    const url = files[`../toys/${key.replace(/ /g, '-')}.mesh`]
    return url ? [[key, url]] : []
  }),
)
/** Catalog keys with a stage model. */
export const MODELED = Object.keys(MESHES)

const shapeOf = (spec: ItemSpec | null) => (spec ? JSON.stringify([spec.name, spec.size, spec.parts]) : '')
const CATALOG = new Map(MODELED.map((key) => [shapeOf(cleanItem(ITEMS[key].spec)), key]))

/**
 * The catalog toy a spec is, when its model can stand in for the body: the same name, size and
 * parts once both are cleaned, as a saved world is when it is read back. A toy the model made, or
 * a catalog toy it recoloured or resized, keeps the jelly look.
 */
export const catalogKey = (spec: ItemSpec): string | null => CATALOG.get(shapeOf(cleanItem(spec))) ?? null

const fetchMesh = Effect.fn('ToyMesh.fetch')(function* (url: string) {
  const res = yield* fetchExternal(url)
  if (!res.ok) return yield* new HttpStatusError({ status: res.status, message: `toy mesh: HTTP ${res.status}` })
  const buffer = yield* Effect.tryPromise({ try: () => res.arrayBuffer(), catch: (cause) => new DecodeError({ message: String(cause) }) })
  return yield* Effect.try({ try: () => parseToyMesh(buffer), catch: (cause) => new DecodeError({ message: String(cause) }) })
})

const loaded = new Map<string, ToyMesh | null>()
const loading = new Map<string, Promise<ToyMesh | null>>()

/** The model for a catalog key, fetched once. Null when there is none or it failed: the toy keeps its jelly look. */
export function loadToyMesh(key: string): Promise<ToyMesh | null> {
  let p = loading.get(key)
  if (!p) {
    const url = MESHES[key]
    p = url
      ? runPromise(fetchMesh(url).pipe(Effect.catchAll((error) => Effect.sync(() => {
          console.warn(`[chat] ${key} keeps its jelly look:`, error)
          return null
        }))))
      : Promise.resolve(null)
    p.then((mesh) => loaded.set(key, mesh))
    loading.set(key, p)
  }
  return p
}

/** The model if it has already arrived. */
export const toyMeshNow = (key: string): ToyMesh | null => loaded.get(key) ?? null

/** Near-black parts (eyes, lenses) are drawn in ink, like the jelly's eyes. */
export function isInk(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.16
}

/** The ink line's width per vertex: the body's line on whole shells, finer on thin ones (a stem, a sprinkle), none on ink. */
export function outlineWidths(mesh: ToyMesh, positions: Float32Array, full: number): Float32Array {
  const count = positions.length / 3
  const parent = Uint32Array.from({ length: count }, (_, i) => i)
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const { index } = mesh
  for (let t = 0; t < index.length; t += 3) {
    const a = root(index[t])
    parent[root(index[t + 1])] = a
    parent[root(index[t + 2])] = a
  }
  const lo = new Map<number, Vec3>()
  const hi = new Map<number, Vec3>()
  for (let v = 0; v < count; v++) {
    const r = root(v)
    const l = lo.get(r) ?? lo.set(r, [Infinity, Infinity, Infinity]).get(r)!
    const h = hi.get(r) ?? hi.set(r, [-Infinity, -Infinity, -Infinity]).get(r)!
    for (let k = 0; k < 3; k++) {
      l[k] = Math.min(l[k], positions[v * 3 + k])
      h[k] = Math.max(h[k], positions[v * 3 + k])
    }
  }
  const out = new Float32Array(count)
  for (let v = 0; v < count; v++) {
    const r = root(v)
    const l = lo.get(r)!
    const h = hi.get(r)!
    out[v] = Math.min(full, 0.3 * Math.min(h[0] - l[0], h[1] - l[1], h[2] - l[2]))
  }
  for (const g of mesh.groups) {
    if (!isInk(g.color)) continue
    for (let i = g.start; i < g.start + g.count; i++) out[index[i]] = 0
  }
  return out
}
