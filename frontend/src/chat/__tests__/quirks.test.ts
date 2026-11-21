import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../three/jelly'
import { QUIRKS, tickTraits, type QuirkToy, type Stage } from '../scene/quirks'
import { ITEMS, type Trait } from '../world/spec'

function makeToy(key: string | null, at: Vec3, traits: Trait[] = []) {
  const kicks: Vec3[] = []
  const toy: QuirkToy & { kicks: Vec3[] } = {
    key,
    has: (trait) => traits.includes(trait),
    center: at,
    held: false,
    kick: (vx, vy, vz) => void kicks.push([vx, vy, vz]),
    spin: () => {},
    memo: {},
    kicks,
  }
  return toy
}

function makeStage(toys: QuirkToy[], night = 0) {
  const queue: { at: number; fn: () => void }[] = []
  const seen = { emotes: [] as string[], faces: [] as string[], glows: [] as string[], sleepy: 0, dizzy: 0, particles: 0 }
  const s: Stage & { advance(seconds: number): void } = {
    t: 0,
    night,
    toys,
    sparkle: () => void seen.particles++,
    flakes: () => void seen.particles++,
    bubbles: () => void seen.particles++,
    puff: () => void seen.particles++,
    glow: (_toy, hex) => void seen.glows.push(hex),
    later: (delay, fn) => void queue.push({ at: s.t + delay, fn }),
    emote: (word) => void seen.emotes.push(word),
    lim: {
      center: [0, 0.8, 0],
      dancing: false,
      kick: () => {},
      face: (name) => void seen.faces.push(name),
      dance: () => {},
      dizzy: () => void seen.dizzy++,
      sleepy: () => void seen.sleepy++,
      point: () => {},
    },
    advance(seconds) {
      const end = s.t + seconds
      while (s.t < end) {
        ;(s as { t: number }).t = Math.min(end, s.t + 1 / 30)
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i].at <= s.t) queue.splice(i, 1)[0].fn()
        for (const toy of toys) QUIRKS[toy.key ?? '']?.tick?.(s, toy, 1 / 30)
      }
    },
  }
  return { s, seen }
}

describe('toy quirks', () => {
  it('belong to catalog toys only', () => {
    for (const key of Object.keys(QUIRKS)) expect(ITEMS, key).toHaveProperty([key])
  })

  it('launches the rocket a beat after a tap, and not again straight away', () => {
    const rocket = makeToy('rocket', [1, 0.5, 0])
    const { s, seen } = makeStage([rocket])
    QUIRKS.rocket.tap!(s, rocket)
    QUIRKS.rocket.tap!(s, rocket)
    expect(rocket.kicks).toHaveLength(0)
    s.advance(0.5)
    expect(rocket.kicks).toEqual([[0, 16, 0]])
    expect(seen.emotes).toContain('liftoff!')
    expect(seen.glows.length).toBeGreaterThan(0)
  })

  it('pulls nearby toys toward the magnet and leaves far ones alone', () => {
    const magnet = makeToy('magnet', [0, 0.4, 0])
    const near = makeToy(null, [1.5, 0.4, 0])
    const far = makeToy(null, [4, 0.4, 0])
    const { s } = makeStage([magnet, near, far])
    s.advance(0.2)
    expect(near.kicks.length).toBeGreaterThan(0)
    expect(near.kicks.every(([vx]) => vx < 0)).toBe(true)
    expect(far.kicks).toHaveLength(0)
  })

  it('lulls Lim to sleep after the music box plays', () => {
    const box = makeToy('music box', [1, 0.4, 0])
    const { s, seen } = makeStage([box])
    QUIRKS['music box'].tap!(s, box)
    s.advance(1)
    expect(seen.sleepy).toBe(0)
    s.advance(2.5)
    expect(seen.sleepy).toBe(1)
  })

  it('gives Lim a brain freeze when it eats the ice cream', () => {
    const cone = makeToy('ice cream', [0.5, 0.4, 0])
    const { s, seen } = makeStage([cone])
    QUIRKS['ice cream'].eaten!(s, cone)
    s.advance(1)
    expect(seen.emotes).toContain('brain freeze!')
  })

  it('makes Lim dizzy when it watches the spinning top up close', () => {
    const top = makeToy('spinning top', [1, 0.4, 0])
    const { s, seen } = makeStage([top])
    QUIRKS['spinning top'].tap!(s, top)
    s.advance(3)
    expect(seen.dizzy).toBe(1)
  })

  it('lights the floor under a glowing invented toy, and the lantern by its own quirk', () => {
    const lamp = makeToy(null, [0, 0.4, 0], ['glowing'])
    const plain = makeToy(null, [1, 0.4, 0])
    const lantern = makeToy('lantern', [2, 0.4, 0], ['glowing'])
    const { s, seen } = makeStage([lamp, plain, lantern], 1)
    for (const toy of [lamp, plain, lantern]) tickTraits(s, toy, '#FFD25E')
    expect(seen.glows).toEqual(['#FFD25E'])
  })
})
