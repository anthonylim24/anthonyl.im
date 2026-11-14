import { describe, expect, it } from 'vitest'
import type { CompletedSession } from '@/stores/historyStore'
import { weekCardLines } from '../../share/weekCard'
import { getCalmByTechnique, getDayPart, getDayParts, getLastSevenDays, getLifetime, getWeeklyMinutes } from '../patterns'

let n = 0
const session = (date: Date, over: Partial<CompletedSession> = {}): CompletedSession => ({
  id: `s${n++}`,
  techniqueId: 'box_breathing',
  date: date.toISOString(),
  durationSeconds: 300,
  rounds: 4,
  holdTimes: [],
  maxHoldTime: 0,
  avgHoldTime: 0,
  ...over,
})
/** Local time, so the tests hold in any time zone. */
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h)
// Saturday 14 November 2026; its week began Monday 9 November.
const NOW = at(2026, 11, 14, 15)

describe('getWeeklyMinutes', () => {
  it('buckets by Monday-start week, oldest first, ending this week', () => {
    const weeks = getWeeklyMinutes(
      [session(at(2026, 11, 9)), session(at(2026, 11, 14)), session(at(2026, 11, 8), { durationSeconds: 120 }), session(at(2026, 1, 1))],
      3,
      NOW,
    )
    expect(weeks.map((w) => w.startKey)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
    expect(weeks.map((w) => w.minutes)).toEqual([0, 2, 10])
    expect(weeks.map((w) => w.sessions)).toEqual([0, 1, 2])
  })

  it('ignores sessions with an unreadable date', () => {
    const weeks = getWeeklyMinutes([{ ...session(NOW), date: 'nope' }], 2, NOW)
    expect(weeks.every((w) => w.minutes === 0)).toBe(true)
  })
})

describe('day parts', () => {
  it('splits the day at 5, 12, 17 and 22', () => {
    expect([4, 5, 11, 12, 16, 17, 21, 22, 0].map((h) => getDayPart(at(2026, 11, 14, h)))).toEqual([
      'night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night',
    ])
  })

  it('names the busiest part, the earlier one on a tie', () => {
    const parts = getDayParts([session(at(2026, 11, 1, 7)), session(at(2026, 11, 2, 20)), session(at(2026, 11, 3, 20)), session(at(2026, 11, 4, 8))])
    expect(parts.counts).toEqual({ morning: 2, afternoon: 0, evening: 2, night: 0 })
    expect(parts.top).toBe('morning')
    expect(getDayParts([]).top).toBeNull()
  })
})

describe('getCalmByTechnique', () => {
  it('needs two rated sessions per technique and sorts by shift', () => {
    const calm = getCalmByTechnique([
      session(NOW, { moodBefore: 2, moodAfter: 4 }),
      session(NOW, { moodBefore: 3, moodAfter: 4 }),
      session(NOW, { techniqueId: 'cyclic_sighing', moodBefore: 1, moodAfter: 4 }),
      session(NOW, { techniqueId: 'cyclic_sighing', moodBefore: 2, moodAfter: 4 }),
      session(NOW, { techniqueId: 'resonance_breathing', moodBefore: 1, moodAfter: 5 }),
      session(NOW, { techniqueId: 'resonance_breathing' }),
    ])
    expect(calm).toEqual([
      { techniqueId: 'cyclic_sighing', count: 2, averageShift: 2.5 },
      { techniqueId: 'box_breathing', count: 2, averageShift: 1.5 },
    ])
  })
})

describe('getLifetime', () => {
  it('totals minutes and finds the longest run of days', () => {
    const life = getLifetime([
      session(at(2026, 11, 1)), session(at(2026, 11, 2)), session(at(2026, 11, 2, 20)), session(at(2026, 11, 3)),
      session(at(2026, 11, 10)), session(at(2026, 11, 11)),
    ])
    expect(life).toEqual({ sessions: 6, minutes: 30, days: 5, longestStreak: 3 })
    expect(getLifetime([])).toEqual({ sessions: 0, minutes: 0, days: 0, longestStreak: 0 })
  })
})

describe('getLastSevenDays', () => {
  it('ends today and sums each day', () => {
    const days = getLastSevenDays([session(at(2026, 11, 14)), session(at(2026, 11, 14, 20)), session(at(2026, 11, 8)), session(at(2026, 11, 7))], NOW)
    expect(days.map((d) => d.key)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
    expect(days.map((d) => d.minutes)).toEqual([5, 0, 0, 0, 0, 0, 10])
  })
})

describe('weekCardLines', () => {
  const card = {
    minutes: 27, activeDays: 4, streak: 2, level: 2, levelTitle: 'Regular', days: [], technique: null,
    pigment: { name: '', mass: '#000000', glaze: '#ffffff' }, night: false,
  }
  it('says the week in two lines and drops a zero streak', () => {
    expect(weekCardLines(card)).toEqual({ headline: '27 minutes of breathing', detail: '4 of 7 days   ·   2-day streak   ·   Level 2 · Regular' })
    expect(weekCardLines({ ...card, minutes: 1, streak: 0 })).toEqual({ headline: '1 minute of breathing', detail: '4 of 7 days   ·   Level 2 · Regular' })
  })
})
