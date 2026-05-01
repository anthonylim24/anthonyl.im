// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import type { PersonalBest } from '../historyStore'
import { useHistoryStore } from '../historyStore'

describe('historyStore', () => {
  beforeEach(() => {
    useHistoryStore.setState({
      sessions: [],
      personalBests: {} as Record<TechniqueId, PersonalBest | undefined>,
      vo2MaxManual: null,
      vo2MaxHistory: [],
    })
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
})
