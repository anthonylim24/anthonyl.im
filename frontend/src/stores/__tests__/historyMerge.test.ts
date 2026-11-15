// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { TechniqueId } from '@/lib/constants'
import { mergeHistoryStates, type PersistedHistoryState } from '../historyMerge'
import type { CompletedSession, PersonalBest } from '../sessionRecord'

function session(id: string, day: number, extra: Partial<CompletedSession> = {}): CompletedSession {
  return {
    id, techniqueId: 'co2_tolerance', date: new Date(Date.UTC(2026, 4, day, 9)).toISOString(),
    durationSeconds: 300, rounds: 4, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0, ...extra,
  }
}

function history(patch: Partial<PersistedHistoryState> = {}): PersistedHistoryState {
  return {
    sessions: [],
    personalBests: {} as Record<TechniqueId, PersonalBest | undefined>,
    vo2MaxManual: null,
    vo2MaxHistory: [],
    resetAt: null,
    ...patch,
  }
}

/** A small deterministic generator, so the property cases are the same every run. */
function* randomHistories(count: number): Generator<PersistedHistoryState> {
  let seed = 7
  const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647
  for (let i = 0; i < count; i++) {
    const sessions = Array.from({ length: Math.floor(next() * 6) }, () => {
      const id = `s${Math.floor(next() * 8)}`
      return session(id, Number(id.slice(1)) + 1, next() > 0.5 ? { moodAfter: 4 } : {})
    })
    const unique = [...new Map(sessions.map((s) => [s.id, s])).values()]
    const hold = Math.floor(next() * 90)
    yield history({
      sessions: unique,
      personalBests: { co2_tolerance: { techniqueId: 'co2_tolerance', maxHoldTime: hold, date: session('x', 1).date } } as Record<TechniqueId, PersonalBest | undefined>,
      vo2MaxHistory: next() > 0.5 ? [{ value: 40 + Math.floor(next() * 5), date: session('x', 2).date }] : [],
      resetAt: next() > 0.8 ? new Date(Date.UTC(2026, 4, 1 + Math.floor(next() * 4))).toISOString() : null,
    })
  }
}

const ids = (h: PersistedHistoryState) => h.sessions.map((s) => s.id).sort()

describe('mergeHistoryStates', () => {
  it('keeps every session either side holds, newest first', () => {
    const merged = mergeHistoryStates(history({ sessions: [session('a', 3)] }), history({ sessions: [session('b', 5), session('a', 3)] }))
    expect(merged.sessions.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('keeps the longer hold as the personal best and every VO2 reading once', () => {
    const best = (maxHoldTime: number): PersonalBest => ({ techniqueId: 'co2_tolerance', maxHoldTime, date: session('x', 1).date })
    const a = history({
      personalBests: { co2_tolerance: best(40) } as Record<TechniqueId, PersonalBest | undefined>,
      vo2MaxHistory: [{ value: 41, date: '2026-05-01T00:00:00.000Z' }],
      vo2MaxManual: 41,
    })
    const b = history({
      personalBests: { co2_tolerance: best(55) } as Record<TechniqueId, PersonalBest | undefined>,
      vo2MaxHistory: [{ value: 41, date: '2026-05-01T00:00:00.000Z' }, { value: 44, date: '2026-05-04T00:00:00.000Z' }],
      vo2MaxManual: 44,
    })
    const merged = mergeHistoryStates(a, b)
    expect(merged.personalBests.co2_tolerance?.maxHoldTime).toBe(55)
    expect(merged.vo2MaxHistory).toHaveLength(2)
    expect(merged.vo2MaxManual).toBe(44)
  })

  it('forgets what either side held from before the later clear', () => {
    const cleared = history({ resetAt: '2026-05-04T00:00:00.000Z', sessions: [session('after', 6)] })
    const stale = history({ sessions: [session('before', 2), session('after2', 7)] })
    for (const merged of [mergeHistoryStates(cleared, stale), mergeHistoryStates(stale, cleared)]) {
      expect(ids(merged)).toEqual(['after', 'after2'])
      expect(merged.resetAt).toBe('2026-05-04T00:00:00.000Z')
    }
  })

  it('properties: idempotent, commutative on what survives, and absorbs either input', () => {
    const cases = [...randomHistories(40)]
    for (const a of cases) {
      expect(mergeHistoryStates(a, a)).toEqual(mergeHistoryStates(a, history()))
      for (const b of cases.slice(0, 10)) {
        const ab = mergeHistoryStates(a, b)
        const ba = mergeHistoryStates(b, a)
        expect(ids(ab)).toEqual(ids(ba))
        expect(ab.resetAt).toBe(ba.resetAt)
        expect(ab.personalBests.co2_tolerance?.maxHoldTime).toBe(ba.personalBests.co2_tolerance?.maxHoldTime)
        expect(mergeHistoryStates(ab, b)).toEqual(ab)
        expect(mergeHistoryStates(ab, ab)).toEqual(ab)
      }
    }
  })
})
