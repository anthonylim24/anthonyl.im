import { describe, expect, it } from 'vitest'
import type { CompletedSession } from '@/stores/historyStore'
import { getProtocol } from '../../protocols/catalog'
import { buildSessionInsight, getDoseLabel, getInsightLabel } from '../insights'
import { getWeekSummary } from '../practiceWeek'

function makeSession(overrides: Partial<CompletedSession> = {}): CompletedSession {
  return {
    id: crypto.randomUUID(),
    techniqueId: 'cyclic_sighing',
    date: new Date(2026, 7, 14, 12, 0).toISOString(),
    durationSeconds: 300,
    rounds: 30,
    holdTimes: [],
    maxHoldTime: 0,
    avgHoldTime: 0,
    ...overrides,
  }
}

describe('session insight', () => {
  it('dose labels: Brief < 120, Short < 240, Full < 420, else Long', () => {
    expect(getDoseLabel(60)).toBe('Brief')
    expect(getDoseLabel(120)).toBe('Short')
    expect(getDoseLabel(300)).toBe('Full')
    expect(getDoseLabel(500)).toBe('Long')
  })

  it('score labels: High ≥85, Strong ≥65, Steady ≥40, else Started', () => {
    expect(getInsightLabel(90)).toBe('High')
    expect(getInsightLabel(70)).toBe('Strong')
    expect(getInsightLabel(45)).toBe('Steady')
    expect(getInsightLabel(20)).toBe('Started')
  })

  it('scores a full default session in the target dose window at 65+', () => {
    const insight = buildSessionInsight({
      protocol: getProtocol('cyclic_sighing'),
      rounds: 30,
      durationSeconds: 300,
      holdTimes: [],
      isPersonalBest: false,
      newBadgeCount: 0,
    })
    expect(insight.score).toBe(65) // 40 dose + 25 finished
    expect(insight.label).toBe('Strong')
  })

  it('adds points for holds, PBs and new badges, clamped to 100', () => {
    const insight = buildSessionInsight({
      protocol: getProtocol('box_breathing'),
      rounds: 19,
      durationSeconds: 304,
      holdTimes: [4, 4],
      isPersonalBest: true,
      newBadgeCount: 2,
    })
    expect(insight.score).toBe(100)
    expect(insight.label).toBe('High')
  })

  it('uses CO2 and Power effect/next-step overrides', () => {
    const co2 = buildSessionInsight({
      protocol: getProtocol('co2_tolerance'),
      rounds: 8,
      durationSeconds: 388,
      holdTimes: [15, 20],
      isPersonalBest: false,
      newBadgeCount: 0,
    })
    expect(co2.nextStep).toMatch(/nasal/i)

    const power = buildSessionInsight({
      protocol: getProtocol('power_breathing'),
      rounds: 30,
      durationSeconds: 120,
      holdTimes: [],
      isPersonalBest: false,
      newBadgeCount: 0,
    })
    expect(power.nextStep).toMatch(/stay seated/i)
    expect(power.effect).not.toBe(co2.effect)
  })
})

describe('week summary', () => {
  const now = new Date(2026, 7, 14, 15, 0) // Friday Aug 14 2026, local

  const onDay = (daysAgo: number, overrides: Partial<CompletedSession> = {}) =>
    makeSession({
      date: new Date(2026, 7, 14 - daysAgo, 10, 0).toISOString(),
      ...overrides,
    })

  it('empty week: “Start with five minutes.”', () => {
    const summary = getWeekSummary([], now)
    expect(summary.activeDays).toBe(0)
    expect(summary.sessionCount).toBe(0)
    expect(summary.topTechniqueId).toBeNull()
    expect(summary.nextStep).toBe('Start with five minutes.')
  })

  it('1–2 active days: “Another five minutes tomorrow.”', () => {
    const summary = getWeekSummary([onDay(0), onDay(1)], now)
    expect(summary.activeDays).toBe(2)
    expect(summary.nextStep).toBe('Another five minutes tomorrow.')
  })

  it('3–4 active days: “Same protocol tomorrow, or an easier one.”', () => {
    const summary = getWeekSummary([onDay(0), onDay(1), onDay(2)], now)
    expect(summary.nextStep).toBe('Same protocol tomorrow, or an easier one.')
  })

  it('5+ days: hold intensity; performance-dominant weeks add a recovery note', () => {
    const calm = getWeekSummary([onDay(0), onDay(1), onDay(2), onDay(3), onDay(4)], now)
    expect(calm.nextStep).toBe('Same time of day. Do not add intensity.')
    expect(calm.performanceNote).toBeNull()

    const perf = getWeekSummary(
      [0, 1, 2, 3, 4].map((d) => onDay(d, { techniqueId: 'power_breathing' })),
      now,
    )
    expect(perf.dominantCategory).toBe('performance')
    expect(perf.performanceNote).toBe('Add one recovery or resonance session.')
  })

  it('only counts the last 7 local days and finds the top technique', () => {
    const summary = getWeekSummary(
      [
        onDay(0, { techniqueId: 'box_breathing', durationSeconds: 304 }),
        onDay(1, { techniqueId: 'box_breathing', durationSeconds: 304 }),
        onDay(2, { techniqueId: 'cyclic_sighing', durationSeconds: 300 }),
        onDay(8, { techniqueId: 'power_breathing', durationSeconds: 120 }), // outside window
      ],
      now,
    )
    expect(summary.sessionCount).toBe(3)
    expect(summary.topTechniqueId).toBe('box_breathing')
    expect(summary.minutes).toBe(Math.round((304 + 304 + 300) / 60))
  })
})
