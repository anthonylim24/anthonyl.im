import { describe, expect, it } from 'vitest'
import { Jelly, icosphere } from '../jelly'
import { reachAlong, shapeCentre, type BodyShape } from '../physics'

const body = () => new Jelly(icosphere(1, 1).positions, { gravity: [0, 0, 0], floor: null })
const rod: BodyShape = { centre: [0, 0, 0], half: [1, 0.2, 0.2], round: 0 }

describe('reachAlong', () => {
  it('reaches a long thing at its end along its length, and at its side across it', () => {
    const j = body()
    expect(reachAlong(j, rod, 1, 0, 0)).toBeCloseTo(1)
    expect(reachAlong(j, rod, 0, 1, 0)).toBeCloseTo(0.2)
  })

  it('turns with the body', () => {
    const j = body()
    j.rotate(0, 0, 1, Math.PI / 2)
    j.step(1 / 60)
    expect(reachAlong(j, rod, 0, 1, 0)).toBeCloseTo(1, 1)
    expect(reachAlong(j, rod, 1, 0, 0)).toBeCloseTo(0.2, 1)
  })

  it('squashes and grows with the body', () => {
    const j = body()
    j.squash = [1, 0.5, 1]
    j.scale = 2
    expect(reachAlong(j, rod, 0, 1, 0)).toBeCloseTo(0.2)
    expect(reachAlong(j, rod, 1, 0, 0)).toBeCloseTo(2)
  })

  it('rounds a box toward its ellipsoid on the diagonal', () => {
    const j = body()
    const cube = (round: number): BodyShape => ({ centre: [0, 0, 0], half: [1, 1, 1], round })
    const d = Math.SQRT1_2
    expect(reachAlong(j, cube(0), d, d, 0)).toBeCloseTo(2 * d)
    expect(reachAlong(j, cube(1), d, d, 0)).toBeCloseTo(1)
  })
})

describe('shapeCentre', () => {
  it('carries an off-centre shape round with the body', () => {
    const j = body()
    const top: BodyShape = { centre: [0, 0.5, 0], half: [0.2, 0.2, 0.2], round: 1 }
    const at = shapeCentre(j, top, [0, 0, 0])
    expect(at[1] - j.center[1]).toBeCloseTo(0.5, 1)
    j.rotate(0, 0, 1, Math.PI / 2)
    j.step(1 / 60)
    shapeCentre(j, top, at)
    expect(at[0] - j.center[0]).toBeCloseTo(-0.5, 1)
    expect(at[1] - j.center[1]).toBeCloseTo(0, 1)
  })
})
