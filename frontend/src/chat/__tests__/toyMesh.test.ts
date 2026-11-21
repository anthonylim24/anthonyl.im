import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Jelly } from '../../three/jelly'
import {
  bindToBody,
  boundsOf,
  carryToy,
  catalogKey,
  fitToyMesh,
  itemBounds,
  MODELED,
  outlineWidths,
  parseToyMesh,
  type ToyMesh,
} from '../scene/toyMesh'
import { cleanItem, ITEMS } from '../world/spec'

function encode(positions: number[], index: number[], groups: [number, number, number][]): ArrayBuffer {
  const lo = [0, 1, 2].map((k) => Math.min(...positions.filter((_, i) => i % 3 === k)))
  const hi = [0, 1, 2].map((k) => Math.max(...positions.filter((_, i) => i % 3 === k)))
  const head = 40 + groups.length * 12
  const view = new DataView(new ArrayBuffer(head + positions.length * 2 + index.length * 2))
  view.setUint32(0, 0x31594f54, true)
  view.setUint32(4, positions.length / 3, true)
  view.setUint32(8, index.length, true)
  view.setUint32(12, groups.length, true)
  ;[...lo, ...hi].forEach((v, i) => view.setFloat32(16 + i * 4, v, true))
  groups.flat().forEach((v, i) => view.setUint32(40 + i * 4, v, true))
  positions.forEach((v, i) => {
    const k = i % 3
    view.setUint16(head + i * 2, Math.round(((v - lo[k]) / (hi[k] - lo[k] || 1)) * 65535), true)
  })
  index.forEach((v, i) => view.setUint16(head + positions.length * 2 + i * 2, v, true))
  return view.buffer
}

const shipped = (key: string): ToyMesh => {
  const file = readFileSync(join(process.cwd(), 'src/chat/toys', `${key.replace(/ /g, '-')}.mesh`))
  return parseToyMesh(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
}

const isFixture = (key: string) => ITEMS[key].spec.traits.some((t) => t === 'hoop' || t === 'goal')

describe('toy meshes', () => {
  it('reads back what was written', () => {
    const mesh = parseToyMesh(encode([0, 0, 0, 1, 0, 0, 0, 2, -1], [0, 1, 2], [[0, 3, 0xf0524f]]))
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 2, -1])
    expect(Array.from(mesh.index)).toEqual([0, 1, 2])
    expect(mesh.groups).toEqual([{ start: 0, count: 3, color: '#F0524F' }])
  })

  it('refuses a file that is not a toy mesh or is cut short', () => {
    expect(() => parseToyMesh(new ArrayBuffer(64))).toThrow('not a toy mesh')
    expect(() => parseToyMesh(encode([0, 0, 0, 1, 1, 1, 2, 0, 1], [0, 1, 2], [[0, 3, 0]]).slice(0, 50))).toThrow('cut short')
  })

  it('has a stage model for every catalog toy but the hoop and the goal', () => {
    expect(MODELED.sort()).toEqual(Object.keys(ITEMS).filter((key) => !isFixture(key)).sort())
  })

  it.each(MODELED)('ships a whole, light model for %s', (key) => {
    const mesh = shipped(key)
    const vertices = mesh.positions.length / 3
    expect(mesh.index.length / 3).toBeLessThanOrEqual(3000)
    expect(Math.max(...mesh.index)).toBeLessThan(vertices)
    expect(mesh.groups.reduce((n, g) => n + g.count, 0)).toBe(mesh.index.length)
    expect(boundsOf(mesh.positions).lo[1]).toBeCloseTo(0, 3)
  })

  it('knows a catalog toy by its spec, and nothing else', () => {
    expect(catalogKey(ITEMS.teddy.spec)).toBe('teddy')
    expect(catalogKey({ ...ITEMS.teddy.spec, size: ITEMS.teddy.spec.size * 2 })).toBeNull()
    expect(catalogKey({ ...ITEMS.teddy.spec, parts: ITEMS.teddy.spec.parts.slice(1) })).toBeNull()
    expect(catalogKey(ITEMS.hoop.spec)).toBeNull()
  })

  it.each(MODELED)('still knows %s after its spec is saved and cleaned', (key) => {
    expect(catalogKey(cleanItem(JSON.parse(JSON.stringify(ITEMS[key].spec)))!)).toBe(key)
  })

  it('stands the model where the parts stand, centred on them', () => {
    const spec = ITEMS.cactus.spec
    const fit = boundsOf(fitToyMesh(shipped('cactus'), spec))
    const item = itemBounds(spec)
    expect(fit.lo[1]).toBeCloseTo(item.lo[1], 5)
    expect((fit.lo[0] + fit.hi[0]) / 2).toBeCloseTo((item.lo[0] + item.hi[0]) / 2, 5)
    expect((fit.lo[2] + fit.hi[2]) / 2).toBeCloseTo((item.lo[2] + item.hi[2]) / 2, 5)
  })
})

describe('carrying a model on its soft body', () => {
  const body = new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1])
  const model = new Float32Array([0.9, 0, 0, 0, 0.5, 0.5, 0, 3, 0])

  it('shares out no more than all of a vertex, and nothing beyond reach', () => {
    const bind = bindToBody(model, body, 0.8)
    for (let v = 0; v < 3; v++) {
      let total = 0
      for (let j = bind.start[v]; j < bind.start[v + 1]; j++) total += bind.weight[j]
      expect(total).toBeLessThanOrEqual(1 + 1e-6)
    }
    expect(bind.start[3] - bind.start[2]).toBe(0)
  })

  it('leaves the model as fitted while the body is at rest, and follows it when it moves', () => {
    const jelly = new Jelly(body)
    const bind = bindToBody(model, body, 0.8)
    const out = new Float32Array(model.length)
    carryToy(model, bind, jelly, jelly.goal, out, -Infinity)
    expect(Array.from(out)).toEqual(Array.from(model).map((v) => expect.closeTo(v, 6)))
    jelly.translate(2, 0.5, -1)
    carryToy(model, bind, jelly, jelly.goal, out, -Infinity)
    expect(Array.from(out)).toEqual(Array.from(model).map((v, i) => expect.closeTo(v + [2, 0.5, -1][i % 3], 6)))
  })

  it('takes its share of the skin giving, and is lifted whole off the floor', () => {
    const jelly = new Jelly(body)
    const bind = bindToBody(model, body, 0.8)
    const skin = Float32Array.from(jelly.goal)
    skin[0] += 0.2
    const out = new Float32Array(model.length)
    carryToy(model, bind, jelly, skin, out, -Infinity)
    expect(out[0]).toBeGreaterThan(model[0])
    expect(out[6]).toBeCloseTo(model[6], 6)
    carryToy(model, bind, jelly, jelly.goal, out, 0.25)
    expect(Math.min(out[1], out[4], out[7])).toBeCloseTo(0.25, 6)
    expect(out[7] - out[1]).toBeCloseTo(3, 6)
  })
})

describe('the ink line on a model', () => {
  it('is full on a whole shell, finer on a thin one, and absent on ink', () => {
    const big = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
    const thin = [3, 0, 0, 3.02, 0, 0, 3, 1, 0, 3, 0, 0.02]
    const eye = [5, 0, 0, 6, 0, 0, 5, 1, 0, 5, 0, 1]
    const index = [0, 1, 2, 0, 1, 3, 4, 5, 6, 4, 5, 7, 8, 9, 10, 8, 9, 11]
    const positions = new Float32Array([...big, ...thin, ...eye])
    const mesh: ToyMesh = {
      positions,
      index: Uint16Array.from(index),
      groups: [{ start: 0, count: 12, color: '#F0524F' }, { start: 12, count: 6, color: '#111111' }],
    }
    const width = outlineWidths(mesh, positions, 0.016)
    expect(width[0]).toBeCloseTo(0.016, 6)
    expect(width[4]).toBeCloseTo(0.006, 6)
    expect(width[8]).toBe(0)
  })
})
