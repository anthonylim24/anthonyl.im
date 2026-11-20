/**
 * What toys do on their own: each catalog toy has a quirk (the rocket takes off, the music box lulls
 * Lim to sleep), and every toy, an invented one too, answers by its traits. A quirk is made only of
 * the stage's own pieces (`Stage`), so it plays the same in the toon and lit looks. Under reduced
 * motion the stage drops particles and motion, and the sounds and words remain.
 *
 * Nothing here is saved: a quirk's state lives in the toy's `memo` and goes with the toy.
 */
import type { Vec3 } from '../../three/jelly'
import { sound } from '../sound'
import type { Trait } from '../world/spec'
import type { FaceName } from './limLook'

export type QuirkToy = {
  readonly key: string | null
  has(trait: Trait): boolean
  readonly center: Vec3
  readonly held: boolean
  kick(vx: number, vy: number, vz: number): void
  spin(wx: number, wy: number, wz: number): void
  /** Timers and flags for this toy's quirk. */
  readonly memo: Record<string, number>
}

export type Stage = {
  /** Seconds on the scene clock (frozen under reduced motion). */
  readonly t: number
  readonly still: boolean
  /** 0 by day, 1 by night. */
  readonly night: number
  readonly toys: readonly QuirkToy[]
  sparkle(at: Vec3, count: number, power?: number, colours?: readonly string[]): void
  /** Flakes thrown from a point: feathers, seeds, rain. */
  flakes(at: Vec3, count: number, power: number, colours: readonly string[]): void
  bubbles(at: Vec3, count: number): void
  puff(at: Vec3, count: number, power: number, radius?: number): void
  /** Light on the floor under a toy, this frame only. */
  glow(toy: QuirkToy, hex: string, strength: number): void
  later(delay: number, fn: () => void): void
  emote(word: string): void
  lim: {
    readonly center: Vec3
    readonly dancing: boolean
    kick(vx: number, vy: number, vz: number): void
    face(name: FaceName, seconds: number): void
    dance(seconds: number): void
    dizzy(): void
    sleepy(): void
    /** The tuft leans toward a point. */
    point(at: Vec3): void
  }
}

export type Quirk = {
  /** The visitor tapped it. */
  tap?(s: Stage, toy: QuirkToy): void
  /** Lim or another toy ran into it; `power` is the impulse (a hard knock is above 6). */
  hit?(s: Stage, toy: QuirkToy, by: 'lim' | 'toy', power: number): void
  tick?(s: Stage, toy: QuirkToy, dt: number): void
  /** Lim ate it. */
  eaten?(s: Stage, toy: QuirkToy): void
}

const RAINBOW = ['#FF6B6B', '#FFB84D', '#FFE66B', '#7BE07B', '#6BC7FF', '#B98CFF'] as const
const SPARKS = ['#FFE66B', '#FFFFFF', '#FFB84D'] as const
const FEATHERS = ['#FFD25E', '#FFB84D', '#FF8A5C'] as const

const up = (p: Vec3, y: number): Vec3 => [p[0], p[1] + y, p[2]]

/** True at most once every `gap` seconds for this toy and name. */
function ready(s: Stage, toy: QuirkToy, name: string, gap: number) {
  if (s.t < (toy.memo[name] ?? -Infinity)) return false
  toy.memo[name] = s.t + gap
  return true
}
const during = (s: Stage, toy: QuirkToy, name: string) => s.t < (toy.memo[name] ?? -Infinity)
const near = (a: Vec3, b: Vec3, d: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) < d

/** Lim hops back from something that startled it. */
function startle(s: Stage, toy: QuirkToy, word: string) {
  s.lim.face('shock', 0.9)
  s.lim.kick(Math.sign(s.lim.center[0] - toy.center[0] || 1) * 2.5, 4, 0)
  s.emote(word)
}

export const QUIRKS: Record<string, Quirk> = {
  rocket: {
    tap(s, toy) {
      if (!ready(s, toy, 'launch', 3)) return
      sound.fizz(0.4)
      s.later(0.4, () => {
        toy.kick(0, 16, 0)
        toy.memo.burn = s.t + 0.9
        s.puff(toy.center, 8, 1.2, 0.5)
        sound.whoosh()
        s.emote('liftoff!')
      })
    },
    tick(s, toy) {
      if (!during(s, toy, 'burn')) return
      s.glow(toy, '#FFB84D', 1.2)
      if (ready(s, toy, 'trail', 0.04)) s.sparkle(up(toy.center, -0.35), 1, 0.35, SPARKS)
    },
  },
  'bubble wand': {
    tap(s, toy) {
      if (!ready(s, toy, 'blow', 0.8)) return
      s.bubbles(up(toy.center, 0.3), 6)
      sound.bubbles(5)
    },
    hit(s, toy, by) {
      if (by === 'lim' && ready(s, toy, 'blow', 2)) s.bubbles(up(toy.center, 0.3), 3)
    },
  },
  'snow globe': {
    tap(s, toy) {
      toy.memo.snow = s.t + 2.5
      sound.chime()
      if (near(toy.center, s.lim.center, 2.2) && ready(s, toy, 'brr', 6)) s.emote('brrr!')
    },
    hit(s, toy, _by, power) {
      if (power > 3) toy.memo.snow = s.t + 1.5
    },
    tick(s, toy) {
      if (during(s, toy, 'snow') && ready(s, toy, 'flake', 0.08)) s.flakes(up(toy.center, 0.6), 1, 0.15, ['#FFFFFF', '#DDF3FF'])
    },
  },
  'lava lamp': {
    tick(s, toy) {
      s.glow(toy, '#FF7E6B', 0.5 + 0.2 * Math.sin(s.t * 1.3))
    },
    tap(s, toy) {
      if (!ready(s, toy, 'groove', 4)) return
      sound.gulp()
      s.lim.dance(2.5)
      s.emote('groovy~')
    },
  },
  'disco ball': {
    tick(s, toy) {
      s.glow(toy, RAINBOW[Math.floor(s.t * 2) % RAINBOW.length], 0.8)
    },
    tap(s, toy) {
      if (!ready(s, toy, 'party', 4.5)) return
      s.lim.dance(4)
      for (let k = 0; k < 16; k++) s.later(k * 0.25, () => sound.beat(k))
      s.sparkle(toy.center, 12, 1, RAINBOW)
      s.emote('party!')
    },
  },
  'jack-in-the-box': {
    tap(s, toy) {
      if (!ready(s, toy, 'wind', 3)) return
      sound.tune([0, 2, 4, 5, 7, 4, 0], 0.15)
      s.later(1.2, () => {
        toy.kick(0, 9, 0)
        s.flakes(up(toy.center, 0.4), 20, 1, RAINBOW)
        sound.pop()
        if (near(toy.center, s.lim.center, 3)) startle(s, toy, 'eek!')
      })
    },
  },
  'rubber chicken': {
    tap(s, toy) {
      sound.squawk()
      s.flakes(up(toy.center, 0.2), 8, 0.6, FEATHERS)
    },
    hit(s, toy, _by, power) {
      if (power > 4 && ready(s, toy, 'squawk', 0.5)) {
        sound.squawk()
        s.flakes(up(toy.center, 0.2), 4, 0.5, FEATHERS)
      }
    },
  },
  magnet: {
    tick(s, toy, dt) {
      if (s.still) return
      for (const other of s.toys) {
        if (other === toy || other.held) continue
        const dx = toy.center[0] - other.center[0]
        const dz = toy.center[2] - other.center[2]
        const d = Math.hypot(dx, dz)
        if (d < 0.5 || d > 2.4) continue
        const pull = (during(s, toy, 'surge') ? 9 : 1.6) * dt
        other.kick((dx / d) * pull, 0, (dz / d) * pull)
      }
      if (near(toy.center, s.lim.center, 3) && ready(s, toy, 'point', 0.6)) s.lim.point(toy.center)
    },
    tap(s, toy) {
      toy.memo.surge = s.t + 0.8
      sound.bonk(0.5)
      s.sparkle(toy.center, 4, 0.6, ['#9FD3FF', '#FFFFFF'])
    },
  },
  sparkler: {
    tick(s, toy) {
      s.glow(toy, '#FFD25E', 0.9)
      if (ready(s, toy, 'spark', 0.07)) s.sparkle(up(toy.center, 0.55), 1, 0.7, SPARKS)
    },
    tap(s, toy) {
      s.sparkle(up(toy.center, 0.55), 10, 1.2, SPARKS)
      sound.sparkle()
      sound.fizz(0.6)
    },
  },
  umbrella: {
    tap(s, toy) {
      if (!ready(s, toy, 'shower', 3)) return
      toy.memo.rain = s.t + 2.5
      sound.rain(2.5)
      s.emote('pitter patter')
    },
    tick(s, toy) {
      if (during(s, toy, 'rain') && ready(s, toy, 'drop', 0.06)) {
        const x = (Math.random() - 0.5) * 1.4
        s.flakes([toy.center[0] + x, toy.center[1] + 1.6, toy.center[2]], 1, 0.05, ['#9FD3FF', '#C9E8FF'])
      }
    },
  },
  kite: {
    tap(s, toy) {
      toy.memo.breeze = s.t + 5
      toy.kick(1.5, 7, 0)
      sound.whoosh()
      s.emote('wheee!')
    },
    tick(s, toy) {
      if (during(s, toy, 'breeze') && !toy.held && ready(s, toy, 'gust', 0.5)) toy.kick(Math.sin(s.t * 1.7) * 1.4, 4.2, 0)
    },
  },
  'music box': {
    tap(s, toy) {
      if (!ready(s, toy, 'song', 6)) return
      sound.tune([12, 16, 19, 16, 14, 12, 7, 9, 12, 7, 4, 0], 0.22, 'sine')
      s.sparkle(up(toy.center, 0.4), 5, 0.4, ['#FFFFFF', '#B9A6FF'])
      s.later(3, () => {
        s.lim.sleepy()
        s.emote('so cozy…')
      })
    },
  },
  crystal: {
    tick(s, toy) {
      if (s.night > 0.1) s.glow(toy, '#B9A6FF', 0.55 * s.night)
    },
    tap(s, toy) {
      s.sparkle(toy.center, 14, 1, RAINBOW)
      sound.chime()
      if (near(toy.center, s.lim.center, 3)) s.lim.face('love', 1.4)
    },
  },
  lantern: {
    tick(s, toy, dt) {
      s.glow(toy, '#FFD25E', 0.35 + 0.65 * s.night)
      if (during(s, toy, 'float') && !toy.held) toy.kick(0, 15 * dt, 0)
    },
    tap(s, toy) {
      toy.memo.float = s.t + 3
      toy.kick(0, 5, 0)
      sound.chime()
    },
  },
  watermelon: {
    tap(s, toy) {
      s.flakes(up(toy.center, 0.3), 10, 0.8, ['#2B2622', '#3B302A'])
      sound.bonk(0.3)
    },
    eaten(s) {
      s.flakes(s.lim.center, 12, 1, ['#2B2622', '#FF6B6B'])
      s.emote('juicy!')
    },
  },
  'ice cream': {
    tick(s, toy) {
      if (!toy.held && ready(s, toy, 'drip', 1.6)) s.flakes(up(toy.center, -0.1), 1, 0.05, ['#FFB3C7'])
    },
    eaten(s) {
      s.later(0.5, () => {
        s.lim.face('worried', 1.6)
        for (let k = 0; k < 5; k++) s.later(k * 0.08, () => s.lim.kick(k % 2 ? -1.2 : 1.2, 0, 0))
        s.emote('brain freeze!')
      })
    },
  },
  robot: {
    tick(s, toy) {
      if (toy.held) return
      const gap = s.lim.dancing ? 0.5 : 1.8
      if (!ready(s, toy, 'step', gap)) return
      const dir = s.lim.dancing ? (Math.floor(s.t / 0.5) % 2 ? 1 : -1) : Math.sign(s.lim.center[0] - toy.center[0]) || 1
      toy.kick(dir * 1.4, s.lim.dancing ? 4 : 2.6, 0)
      sound.beep()
    },
    tap(s, toy) {
      for (let k = 0; k < 3; k++) s.later(k * 0.12, () => sound.beep())
      toy.spin(0, 14, 0)
      s.emote('beep boop!')
    },
  },
  'whoopee cushion': {
    tap(s, toy) {
      if (!ready(s, toy, 'toot', 0.8)) return
      sound.toot()
      s.puff(toy.center, 6, 0.6, 0.4)
    },
    hit(s, toy, by, power) {
      if (by !== 'lim' || power < 2 || !ready(s, toy, 'toot', 1.2)) return
      sound.toot()
      s.puff(toy.center, 8, 0.8, 0.5)
      s.lim.face('squint', 1.4)
      s.emote('oops!')
    },
  },
  'spinning top': {
    tap(s, toy) {
      if (!ready(s, toy, 'whirl', 3.5)) return
      toy.spin(0, 40, 0)
      toy.memo.whirl = s.t + 2.6
      sound.hum(2.6)
      if (near(toy.center, s.lim.center, 3.5)) s.later(2, () => s.lim.dizzy())
      s.later(2.6, () => toy.kick((Math.random() - 0.5) * 2, 1.5, 0))
    },
    tick(s, toy) {
      if (during(s, toy, 'whirl') && ready(s, toy, 'keep', 0.2)) toy.spin(0, 18, 0)
    },
  },
  mushroom: {
    hit(s, toy, by, power) {
      if (power < 2 || !ready(s, toy, 'boing', 0.6)) return
      if (by === 'lim' && s.lim.center[1] > toy.center[1]) s.lim.kick(0, 11, 0)
      sound.boing(1)
      s.sparkle(up(toy.center, 0.3), 6, 0.5, ['#E8FFD0', '#FFF3DC'])
    },
    tap(s, toy) {
      toy.kick(0, 6, 0)
      sound.boing(0.7)
      s.sparkle(up(toy.center, 0.3), 6, 0.5, ['#E8FFD0', '#FFF3DC'])
    },
  },
}

/** What any toy does by its traits when tapped, before its own quirk. */
export function tapTraits(s: Stage, toy: QuirkToy) {
  if (toy.has('musical')) sound.tune([[0, 4, 7, 12][Math.floor(Math.random() * 4)]], 0.2)
  if (toy.has('cold')) s.sparkle(toy.center, 5, 0.6, ['#FFFFFF', '#DDF3FF'])
  if (toy.has('hot')) s.sparkle(toy.center, 5, 0.6, ['#FFB84D', '#FF6B6B'])
}

/** What any toy does each frame by its traits: glowing ones light the floor, more so at night. */
export function tickTraits(s: Stage, toy: QuirkToy, hex: string) {
  if (toy.has('glowing') && !QUIRKS[toy.key ?? '']?.tick) s.glow(toy, hex, 0.25 + 0.6 * s.night)
}

/** Two toys knocked together hard: a clink and a glint where they met. */
export function clink(s: Stage, at: Vec3) {
  s.sparkle(at, 3, 0.5, ['#FFFFFF'])
  sound.clink()
}
