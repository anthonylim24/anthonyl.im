// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { addLocalDays, getLocalDayStart } from '@/lib/localDates'
import type { CompletedSession } from '@/stores/historyStore'
import { buildPracticeConsistencyInsight } from '../practiceAnalytics'

function session(
  id: string,
  date: string,
  techniqueId: TechniqueId = TECHNIQUE_IDS.RESONANCE_BREATHING,
): CompletedSession {
  return {
    id,
    techniqueId,
    date,
    durationSeconds: 300,
    rounds: 30,
    holdTimes: [],
    maxHoldTime: 0,
    avgHoldTime: 0,
  }
}

describe('buildPracticeConsistencyInsight', () => {
  const now = new Date('2026-05-01T12:00:00.000Z')

  it('summarizes weekly consistency and dominant protocol', () => {
    const insight = buildPracticeConsistencyInsight([
      session('today', '2026-05-01T08:00:00.000Z'),
      session('yesterday', '2026-04-30T08:00:00.000Z'),
      session('two-days', '2026-04-29T08:00:00.000Z', TECHNIQUE_IDS.CYCLIC_SIGHING),
      session('old', '2026-04-20T08:00:00.000Z', TECHNIQUE_IDS.BOX_BREATHING),
    ], now)

    expect(insight.activeDays).toBe(3)
    expect(insight.sessionCount).toBe(3)
    expect(insight.totalMinutes).toBe(15)
    expect(insight.label).toBe('Habit forming')
    expect(insight.dominantProtocolName).toBe('Resonance Breathing')
    expect(insight.dominantCategory).toBe('calm')
  })

  it('recommends recovery balance for frequent performance practice', () => {
    const insight = buildPracticeConsistencyInsight([
      session('d0', '2026-05-01T08:00:00.000Z', TECHNIQUE_IDS.CO2_TOLERANCE),
      session('d1', '2026-04-30T08:00:00.000Z', TECHNIQUE_IDS.CO2_TOLERANCE),
      session('d2', '2026-04-29T08:00:00.000Z', TECHNIQUE_IDS.POWER_BREATHING),
      session('d3', '2026-04-28T08:00:00.000Z', TECHNIQUE_IDS.CO2_TOLERANCE),
      session('d4', '2026-04-27T08:00:00.000Z', TECHNIQUE_IDS.POWER_BREATHING),
    ], now)

    expect(insight.label).toBe('Consistent rhythm')
    expect(insight.dominantCategory).toBe('performance')
    expect(insight.nextStep).toMatch(/gentle recovery or resonance/i)
  })

  it('returns an empty-state insight when there is no recent practice', () => {
    const insight = buildPracticeConsistencyInsight([], now)

    expect(insight.activeDays).toBe(0)
    expect(insight.sessionCount).toBe(0)
    expect(insight.totalMinutes).toBe(0)
    expect(insight.label).toBe('Ready to begin')
    expect(insight.dominantProtocolName).toBeNull()
  })

  it('includes the first day of the local seven-day window', () => {
    const localNow = new Date(2026, 4, 8, 23)
    const firstWindowDay = addLocalDays(getLocalDayStart(localNow), -6)
    const insight = buildPracticeConsistencyInsight([
      session(
        'first-window-day',
        new Date(
          firstWindowDay.getFullYear(),
          firstWindowDay.getMonth(),
          firstWindowDay.getDate(),
          0,
          15
        ).toISOString()
      ),
    ], localNow)

    expect(insight.activeDays).toBe(1)
    expect(insight.sessionCount).toBe(1)
  })
})
