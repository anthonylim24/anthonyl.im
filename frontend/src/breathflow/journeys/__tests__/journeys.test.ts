import { beforeEach, describe, expect, it } from 'vitest'
import { migratePersistedPracticeState, usePracticeStore } from '@/stores/practiceStore'
import { getDailyGoalStatus } from '../../gamify/dailyGoal'
import { isAdvancedTechnique } from '../../protocols/catalog'
import { buildSessionSearch, parseSessionSearch } from '../../session/urlParams'
import { JOURNEYS, nextStepIndex, stepSession } from '../catalog'

describe('journey catalog', () => {
  it('never prescribes a safety-gated technique, and lands near each step length', () => {
    for (const journey of JOURNEYS) {
      for (const step of journey.steps) {
        expect(isAdvancedTechnique(step.techniqueId)).toBe(false)
        const { plannedSeconds } = stepSession(step)
        expect(Math.abs(plannedSeconds - step.seconds)).toBeLessThanOrEqual(15)
      }
    }
  })

  it('offers the first step not yet done', () => {
    const [journey] = JOURNEYS
    expect(nextStepIndex(journey, [])).toBe(0)
    expect(nextStepIndex(journey, [0, 2])).toBe(1)
    expect(nextStepIndex(journey, journey.steps.map((_, i) => i))).toBeNull()
  })
})

describe('journey deep links', () => {
  it('round-trips a journey step', () => {
    const search = buildSessionSearch({ ...stepSession(JOURNEYS[0].steps[1]), journey: { id: 'first_week', step: 1 } })
    expect(parseSessionSearch(search).journey).toEqual({ id: 'first_week', step: 1 })
  })

  it('drops the journey when the technique is not the one the step prescribes', () => {
    expect(parseSessionSearch('technique=box_breathing&rounds=5&journey=first_week&step=0').journey).toBeUndefined()
    expect(parseSessionSearch('technique=cyclic_sighing&journey=nope&step=0').journey).toBeUndefined()
    expect(parseSessionSearch('technique=cyclic_sighing&journey=first_week&step=99').journey).toBeUndefined()
    expect(buildSessionSearch({ techniqueId: 'box_breathing', rounds: 5, journey: { id: 'first_week', step: 0 } }))
      .not.toContain('journey')
  })
})

describe('practice store', () => {
  beforeEach(() => {
    usePracticeStore.getState().resetPractice()
  })

  it('walks a journey to its end, once per step', () => {
    const { startJourney, completeJourneyStep } = usePracticeStore.getState()
    startJourney('wind_down')
    expect(usePracticeStore.getState().activeJourneyId).toBe('wind_down')

    expect(completeJourneyStep('wind_down', 0)).toBe(false)
    expect(completeJourneyStep('wind_down', 0)).toBe(false) // already done
    expect(completeJourneyStep('wind_down', 12)).toBe(false) // no such step
    for (const step of [1, 2, 3]) completeJourneyStep('wind_down', step)
    expect(completeJourneyStep('wind_down', 4)).toBe(true)
    expect(usePracticeStore.getState().journeys.wind_down?.done).toEqual([0, 1, 2, 3, 4])
  })

  it('resumes an unfinished journey and restarts a finished one', () => {
    const { startJourney, completeJourneyStep, leaveJourney } = usePracticeStore.getState()
    startJourney('steady_focus')
    completeJourneyStep('steady_focus', 0)
    leaveJourney()
    startJourney('steady_focus')
    expect(usePracticeStore.getState().journeys.steady_focus?.done).toEqual([0])

    for (const step of [1, 2, 3, 4]) completeJourneyStep('steady_focus', step)
    startJourney('steady_focus')
    expect(usePracticeStore.getState().journeys.steady_focus?.done).toEqual([])
  })

  it('cleans untrusted state', () => {
    const cleaned = migratePersistedPracticeState({
      dailyGoalMinutes: 999,
      activeJourneyId: 'first_week',
      journeys: {
        first_week: { startedAt: 'not a date', done: [0, 0, 3, 42, 'x', -1] },
        made_up: { startedAt: '2026-01-01T00:00:00Z', done: [0] },
      },
    })
    expect(cleaned.dailyGoalMinutes).toBe(5)
    expect(cleaned.activeJourneyId).toBe('first_week')
    expect(cleaned.journeys.first_week?.done).toEqual([0, 3])
    expect(Object.keys(cleaned.journeys)).toEqual(['first_week'])
    expect(migratePersistedPracticeState({ activeJourneyId: 'wind_down' }).activeJourneyId).toBeNull()
    expect(migratePersistedPracticeState('junk')).toEqual({ dailyGoalMinutes: 5, activeJourneyId: null, journeys: {} })
  })
})

describe('daily goal', () => {
  const session = (date: string, durationSeconds: number) => ({
    id: date, techniqueId: 'box_breathing' as const, date, durationSeconds,
    rounds: 1, holdTimes: [], maxHoldTime: 0, avgHoldTime: 0,
  })

  it('counts only today, and caps progress at the goal', () => {
    const now = new Date(2026, 10, 14, 15, 0)
    const today = new Date(2026, 10, 14, 8, 0).toISOString()
    const yesterday = new Date(2026, 10, 13, 23, 0).toISOString()

    const partial = getDailyGoalStatus([session(today, 120), session(yesterday, 600)], 5, now)
    expect(partial).toMatchObject({ seconds: 120, goalSeconds: 300, met: false })
    expect(partial.progress).toBeCloseTo(0.4)

    const over = getDailyGoalStatus([session(today, 120), session(today, 400)], 5, now)
    expect(over).toMatchObject({ seconds: 520, met: true, progress: 1 })
  })
})
