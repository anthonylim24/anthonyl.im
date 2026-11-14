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
    skinJelly(geo, jelly, 0.15, -0.5)
    const out = geo.attributes.position.array as Float32Array
    let worst = 0
    let lowest = Infinity
    for (let i = 0; i < out.length; i += 3) {
      const onFloor = out[i + 1] === -0.5
      const d = Math.hypot(out[i] - jelly.goal[i], onFloor ? 0 : out[i + 1] - jelly.goal[i + 1], out[i + 2] - jelly.goal[i + 2])
      worst = Math.max(worst, d)
      lowest = Math.min(lowest, out[i + 1])
    }
    expect(worst).toBeLessThanOrEqual(0.15 + 1e-6)
    expect(lowest).toBeGreaterThanOrEqual(-0.5)
  })
})
