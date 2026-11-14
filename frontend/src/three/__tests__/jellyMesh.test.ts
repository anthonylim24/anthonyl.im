import { describe, expect, it } from 'vitest'
import { Jelly, icosphere } from '../jelly'
import { skinJelly, skinnedJellyGeometry } from '../jellyMesh'

describe('skinJelly', () => {
  it('draws the particles exactly while the body is at rest', () => {
    const { positions, index } = icosphere(1, 2)
    const jelly = new Jelly(positions)
    const geo = skinnedJellyGeometry(jelly, index)
    skinJelly(geo, jelly, 0.15)
    const out = geo.attributes.position.array as Float32Array
    expect(out).not.toBe(jelly.x)
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo(jelly.x[i], 5)
  })

  it('keeps every drawn vertex within the limit of its goal, however rough the particles', () => {
    const { positions, index } = icosphere(1, 2)
    const jelly = new Jelly(positions)
    const geo = skinnedJellyGeometry(jelly, index)
    // A wild, uneven shove: the particles scatter, the skin must not.
    for (let i = 0; i < jelly.count; i++) jelly.v[i * 3] = i % 2 ? 90 : -90
    jelly.step(1 / 60)
    skinJelly(geo, jelly, 0.15)
    const out = geo.attributes.position.array as Float32Array
    let worst = 0
    let rough = 0
    for (let i = 0; i < out.length; i += 3) {
      worst = Math.max(worst, Math.hypot(out[i] - jelly.goal[i], out[i + 1] - jelly.goal[i + 1], out[i + 2] - jelly.goal[i + 2]))
      rough = Math.max(rough, Math.hypot(jelly.x[i] - jelly.goal[i], jelly.x[i + 1] - jelly.goal[i + 1], jelly.x[i + 2] - jelly.goal[i + 2]))
    }
    expect(rough).toBeGreaterThan(0.3)
    expect(worst).toBeLessThanOrEqual(0.15 + 1e-6)
  })

  it('lifts a skin that dips under the floor whole, without flattening it', () => {
    const { positions, index } = icosphere(1, 2)
    const jelly = new Jelly(positions)
    const free = skinnedJellyGeometry(jelly, index)
    const grounded = skinnedJellyGeometry(jelly, index)
    skinJelly(free, jelly, 0.15)
    skinJelly(grounded, jelly, 0.15, -0.4)
    const a = free.attributes.position.array as Float32Array
    const b = grounded.attributes.position.array as Float32Array
    let low = Infinity
    for (let i = 0; i < b.length; i += 3) {
      low = Math.min(low, b[i + 1])
      // Same shape, moved straight up by 0.6 (the sphere's base was at -1).
      expect(b[i]).toBeCloseTo(a[i], 5)
      expect(b[i + 1] - a[i + 1]).toBeCloseTo(0.6, 5)
    }
    expect(low).toBeCloseTo(-0.4, 5)
  })
})
