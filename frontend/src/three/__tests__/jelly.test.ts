import { describe, expect, it } from 'vitest'
import { Jelly, extractRotation, icosphere } from '../jelly'

/** Worst deviation of any particle from the unit sphere around the centroid. */
const deviation = (j: Jelly) => {
  let max = 0
  for (let i = 0; i < j.count; i++) {
    const d = Math.hypot(j.x[i * 3] - j.center[0], j.x[i * 3 + 1] - j.center[1], j.x[i * 3 + 2] - j.center[2])
    max = Math.max(max, Math.abs(d - 1))
  }
  return max
}

describe('Jelly', () => {
  it('builds a closed indexed icosphere', () => {
    const { positions, index } = icosphere(1, 2)
    expect(positions.length / 3).toBe(162)
    expect(index.length / 3).toBe(320)
    expect(Math.max(...index)).toBe(161)
  })

  it('recovers a pure rotation', () => {
    const c = Math.cos(0.7)
    const s = Math.sin(0.7)
    const q: [number, number, number, number] = [0, 0, 0, 1]
    extractRotation([c, -s, 0, s, c, 0, 0, 0, 1], q, 20)
    expect(q[2]).toBeCloseTo(Math.sin(0.35), 4)
    expect(q[3]).toBeCloseTo(Math.cos(0.35), 4)
  })

  it('springs back to its rest shape after a poke', () => {
    const { positions } = icosphere(1, 3)
    const j = new Jelly(positions)
    j.impulse([0, 0, 1], [0, 0, -6], 0.8)
    for (let i = 0; i < 6; i++) j.step(1 / 60)
    const disturbed = deviation(j)
    for (let i = 0; i < 600; i++) j.step(1 / 60)
    expect(disturbed).toBeGreaterThan(0.03)
    expect(deviation(j)).toBeLessThan(0.01)
  })

  it('rests on the floor and inflates with scale', () => {
    const { positions } = icosphere(1, 2)
    const j = new Jelly(positions, { gravity: [0, -9.8, 0], floor: -2, beta: 0.4 })
    for (let i = 0; i < 600; i++) j.step(1 / 60)
    let minY = Infinity
    for (let i = 0; i < j.count; i++) minY = Math.min(minY, j.x[i * 3 + 1])
    expect(minY).toBeGreaterThanOrEqual(-2 - 1e-6)
    expect(j.contacts).toBeGreaterThan(0)
    expect(j.center[1]).toBeGreaterThan(-1.3) // squashed, not flattened

    const floating = new Jelly(positions)
    floating.scale = 1.4
    for (let i = 0; i < 400; i++) floating.step(1 / 60)
    expect(floating.radius).toBeCloseTo(1.4 * 0.99, 1)
  })
})
