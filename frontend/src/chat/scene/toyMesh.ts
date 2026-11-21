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
import type * as THREE from 'three/webgpu'
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

/**
 * Where a model is now, as one affine map for its matrix: its rest shape through the body's turn,
 * lean and squash (`jelly.attach`), with `wobble` of the particles' own squash and stretch blended in
 * (`jelly.fit`), so a landing still squishes it. Lifted whole if a corner of `box` would dip under
 * `floor`. The GPU applies it, so a toy costs the same each frame however detailed its model.
 */
export function carryMatrix(jelly: Jelly, box: { lo: Vec3; hi: Vec3 }, floor: number, wobble: number, out: THREE.Matrix4) {
  const { m, fit, squash, center, rest0 } = jelly
  const e = out.elements
  for (let row = 0; row < 3; row++) {
    const s = squash[row] * jelly.scale
    for (let col = 0; col < 3; col++) {
      const k = row * 3 + col
      // three's matrices are column-major.
      e[col * 4 + row] = s * (m[k] + wobble * (fit[k] - m[k]))
    }
    e[12 + row] = center[row] - e[row] * rest0[0] - e[4 + row] * rest0[1] - e[8 + row] * rest0[2]
  }
  e[3] = e[7] = e[11] = 0
  e[15] = 1
  let low = Infinity
  for (let c = 0; c < 8; c++) {
    const x = c & 1 ? box.hi[0] : box.lo[0]
    const y = c & 2 ? box.hi[1] : box.lo[1]
    const z = c & 4 ? box.hi[2] : box.lo[2]
    low = Math.min(low, e[1] * x + e[5] * y + e[9] * z + e[13])
  }
  if (low < floor) e[13] += floor - low
  return out
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
