// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BREATH_PHASES, TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import { addLocalDays, getLocalDayStart } from '@/lib/localDates'
import type { PersonalBest } from '../historyStore'
import {
  HISTORY_STORAGE_VERSION,
  migratePersistedHistoryState,
  useHistoryStore,
} from '../historyStore'

describe('historyStore', () => {
  beforeEach(() => {
    vi.useRealTimers()
    useHistoryStore.setState({
      sessions: [],
      personalBests: {} as Record<TechniqueId, PersonalBest | undefined>,
      vo2MaxManual: null,
      vo2MaxHistory: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears sessions, personal bests, and VO2 records', () => {
    useHistoryStore.setState({
      sessions: [
        {
          id: 'session-1',
          techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
          date: '2026-05-01T10:00:00.000Z',
          durationSeconds: 120,
          rounds: 3,
          holdTimes: [20],
          maxHoldTime: 20,
          avgHoldTime: 20,
        },
      ],
      personalBests: {
        [TECHNIQUE_IDS.BOX_BREATHING]: {
          techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
          maxHoldTime: 20,
          date: '2026-05-01T10:00:00.000Z',
        },
      } as Record<TechniqueId, PersonalBest | undefined>,
      vo2MaxManual: 45,
      vo2MaxHistory: [{ value: 45, date: '2026-05-01T10:00:00.000Z' }],
    })

    useHistoryStore.getState().clearHistory()

    expect(useHistoryStore.getState()).toMatchObject({
      sessions: [],
      personalBests: {},
      vo2MaxManual: null,
      vo2MaxHistory: [],
    })
  })

  it('calculates streaks from local calendar days', () => {
    const today = getLocalDayStart(new Date(2026, 4, 2, 12))
    const yesterday = addLocalDays(today, -1)
    const twoDaysAgo = addLocalDays(today, -2)

    vi.useFakeTimers()
    vi.setSystemTime(today)

    useHistoryStore.setState({
      sessions: [
        {
          id: 'late-yesterday',
          techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
          date: new Date(
            yesterday.getFullYear(),
            yesterday.getMonth(),
            yesterday.getDate(),
            23,
            30
          ).toISOString(),
          durationSeconds: 300,
          rounds: 30,
          holdTimes: [],
          maxHoldTime: 0,
          avgHoldTime: 0,
        },
        {
          id: 'two-days-ago',
          techniqueId: TECHNIQUE_IDS.CYCLIC_SIGHING,
          date: new Date(
            twoDaysAgo.getFullYear(),
            twoDaysAgo.getMonth(),
            twoDaysAgo.getDate(),
            8,
            0
          ).toISOString(),
          durationSeconds: 300,
          rounds: 30,
          holdTimes: [],
          maxHoldTime: 0,
          avgHoldTime: 0,
        },
      ],
    })

    expect(useHistoryStore.getState().getStreak()).toBe(2)
  })

  it('versions and migrates persisted history state', () => {
    const migrated = migratePersistedHistoryState({
      sessions: [
        {
          id: 'session-custom',
          techniqueId: TECHNIQUE_IDS.BOX_BREATHING,
          date: '2026-05-01T10:00:00.000Z',
          durationSeconds: 120,
          rounds: 3,
          customPhaseDurations: {
            [BREATH_PHASES.INHALE]: 6,
          },
          holdTimes: [],
          maxHoldTime: 0,
          avgHoldTime: 0,
        },
      ],
      personalBests: {},
    })

    expect(HISTORY_STORAGE_VERSION).toBeGreaterThan(0)
    expect(migrated.sessions[0].customPhaseDurations).toEqual({
      [BREATH_PHASES.INHALE]: 6,
    })
    expect(migrated.vo2MaxManual).toBeNull()
    expect(migrated.vo2MaxHistory).toEqual([])
    expect(migratePersistedHistoryState(undefined)).toEqual({
      sessions: [],
      personalBests: {},
      vo2MaxManual: null,
      vo2MaxHistory: [],
    })
  })
})
