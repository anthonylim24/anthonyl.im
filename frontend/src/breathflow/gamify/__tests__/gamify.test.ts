import { describe, expect, it } from 'vitest'
import type { CompletedSession } from '@/stores/historyStore'
import { calculateXP } from '../xp'
import { getLevelProgress, getLevelTitle, levelForXP, xpForLevel } from '../levels'
import { BADGES, checkBadgeUnlocks } from '../badges'
import { DEFAULT_ORB_THEME_ID, isOrbThemeUnlocked, ORB_THEMES, resolveOrbTheme } from '../orbThemes'

function makeSession(overrides: Partial<CompletedSession> = {}): CompletedSession {
  return {
    id: crypto.randomUUID(),
    techniqueId: 'box_breathing',
    date: '2026-08-14T12:00:00.000Z',
    durationSeconds: 304,
    rounds: 19,
    holdTimes: [4, 4],
    maxHoldTime: 4,
    avgHoldTime: 4,
    ...overrides,
  }
}

describe('XP formula', () => {
  it('round((base + extraRounds*5) * min(1 + streak*0.1, 2.0))', () => {
    expect(calculateXP('box_breathing', 19, 0)).toBe(50)
    expect(calculateXP('cyclic_sighing', 30, 1)).toBe(Math.round(55 * 1.1))
    expect(calculateXP('box_breathing', 24, 0)).toBe(50 + 5 * 5)
    expect(calculateXP('pursed_lip_recovery', 50, 0)).toBe(45)
  })

  it('extra rounds only count above the default', () => {
    expect(calculateXP('box_breathing', 5, 0)).toBe(50)
  })

  it('caps the streak multiplier at 2.0', () => {
    expect(calculateXP('box_breathing', 19, 10)).toBe(100)
    expect(calculateXP('box_breathing', 19, 50)).toBe(100)
  })
})

describe('levels', () => {
  it('xp thresholds follow sum of 80 + 20i', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(100)
    expect(xpForLevel(3)).toBe(220)
    expect(xpForLevel(4)).toBe(360)
  })

  it('maps xp to levels, capped at 50', () => {
    expect(levelForXP(0)).toBe(1)
    expect(levelForXP(99)).toBe(1)
    expect(levelForXP(100)).toBe(2)
    expect(levelForXP(xpForLevel(50) + 5000)).toBe(50)
  })

  it('titles follow the spec thresholds', () => {
    expect(getLevelTitle(1)).toBe('Beginner')
    expect(getLevelTitle(2)).toBe('Regular')
    expect(getLevelTitle(4)).toBe('Regular')
    expect(getLevelTitle(5)).toBe('Consistent')
    expect(getLevelTitle(10)).toBe('Skilled')
    expect(getLevelTitle(15)).toBe('Advanced')
    expect(getLevelTitle(20)).toBe('Expert')
    expect(getLevelTitle(30)).toBe('Veteran')
    expect(getLevelTitle(40)).toBe('Seasoned')
    expect(getLevelTitle(50)).toBe('Long-term')
  })

  it('reports progress into the current level', () => {
    const progress = getLevelProgress(150)
    expect(progress.level).toBe(2)
    expect(progress.xpIntoLevel).toBe(50)
    expect(progress.xpForNextLevel).toBe(120)
  })
})

describe('badges', () => {
  it('defines exactly the fifteen persisted badge ids', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'first_session', 'streak_7', 'streak_30', 'sessions_100',
      'hour_total', 'ten_hours',
      'box_master', 'co2_explorer', 'power_adept',
      'protocol_sampler', 'resonance_keeper', 'sleep_ritual',
      'night_owl', 'early_bird', 'marathon',
    ])
    expect(BADGES.filter((b) => b.secret).map((b) => b.id)).toEqual([
      'night_owl', 'early_bird', 'marathon',
    ])
  })

  it('awards first_session on the first completion', () => {
    const session = makeSession()
    const unlocked = checkBadgeUnlocks({
      sessions: [session],
      completedSession: session,
      streak: 1,
      earnedBadgeIds: [],
    })
    expect(unlocked).toContain('first_session')
  })

  it('never re-awards earned badges', () => {
    const session = makeSession()
    const unlocked = checkBadgeUnlocks({
      sessions: [session],
      completedSession: session,
      streak: 1,
      earnedBadgeIds: ['first_session'],
    })
    expect(unlocked).not.toContain('first_session')
  })

  it('awards streak badges from the streak value', () => {
    const session = makeSession()
    const ctx = { sessions: [session], completedSession: session, earnedBadgeIds: [] }
    expect(checkBadgeUnlocks({ ...ctx, streak: 7 })).toContain('streak_7')
    expect(checkBadgeUnlocks({ ...ctx, streak: 30 })).toContain('streak_30')
    expect(checkBadgeUnlocks({ ...ctx, streak: 6 })).not.toContain('streak_7')
  })

  it('night_owl uses the local 22:00–03:59 window', () => {
    const at = (hour: number) => {
      const date = new Date(2026, 7, 14, hour, 30, 0)
      const session = makeSession({ date: date.toISOString() })
      return checkBadgeUnlocks({
        sessions: [session],
        completedSession: session,
        streak: 1,
        earnedBadgeIds: ['first_session'],
      })
    }
    expect(at(22)).toContain('night_owl')
    expect(at(3)).toContain('night_owl')
    expect(at(4)).not.toContain('night_owl')
    expect(at(21)).not.toContain('night_owl')
  })

  it('early_bird uses 05:00–06:59; marathon needs 30 planned minutes', () => {
    const five = makeSession({ date: new Date(2026, 7, 14, 5, 0).toISOString() })
    expect(checkBadgeUnlocks({
      sessions: [five], completedSession: five, streak: 1, earnedBadgeIds: ['first_session'],
    })).toContain('early_bird')

    const seven = makeSession({ date: new Date(2026, 7, 14, 7, 0).toISOString() })
    expect(checkBadgeUnlocks({
      sessions: [seven], completedSession: seven, streak: 1, earnedBadgeIds: ['first_session'],
    })).not.toContain('early_bird')

    const long = makeSession({ date: new Date(2026, 7, 14, 12, 0).toISOString(), durationSeconds: 1800 })
    expect(checkBadgeUnlocks({
      sessions: [long], completedSession: long, streak: 1, earnedBadgeIds: ['first_session'],
    })).toContain('marathon')
  })

  it('counts technique mastery and sampler badges', () => {
    const sessions = [
      ...Array.from({ length: 50 }, () => makeSession({ techniqueId: 'box_breathing' })),
      makeSession({ techniqueId: 'cyclic_sighing' }),
      makeSession({ techniqueId: 'resonance_breathing' }),
      makeSession({ techniqueId: 'extended_exhale' }),
    ]
    const unlocked = checkBadgeUnlocks({
      sessions,
      completedSession: sessions[0],
      streak: 1,
      earnedBadgeIds: ['first_session'],
    })
    expect(unlocked).toContain('box_master')
    expect(unlocked).toContain('protocol_sampler')
    expect(unlocked).not.toContain('co2_explorer')
  })

  it('accumulates hour badges from total planned duration', () => {
    const sessions = Array.from({ length: 12 }, () => makeSession({ durationSeconds: 300 }))
    const unlocked = checkBadgeUnlocks({
      sessions,
      completedSession: sessions[0],
      streak: 1,
      earnedBadgeIds: ['first_session'],
    })
    expect(unlocked).toContain('hour_total')
    expect(unlocked).not.toContain('ten_hours')
  })
})

describe('orb themes', () => {
  it('keeps the nine persisted ids with spec display names and unlock levels', () => {
    expect(ORB_THEMES.map((t) => [t.id, t.name, t.unlockLevel])).toEqual([
      ['default', 'Default', 1],
      ['tidal', 'Tidal', 5],
      ['ember', 'Ember', 10],
      ['coral', 'Coral', 15],
      ['grove', 'Grove', 20],
      ['midnight', 'Nocturne', 25],
      ['dawn', 'Dawn', 30],
      ['arctic', 'Arctic', 40],
      ['transcend', 'Clarity', 50],
    ])
  })

  it('locks themes above the current level', () => {
    expect(isOrbThemeUnlocked('tidal', 4)).toBe(false)
    expect(isOrbThemeUnlocked('tidal', 5)).toBe(true)
  })

  it('renders Default when the saved theme is above the current level', () => {
    expect(resolveOrbTheme('transcend', 10).id).toBe(DEFAULT_ORB_THEME_ID)
    expect(resolveOrbTheme('tidal', 10).id).toBe('tidal')
    expect(resolveOrbTheme('unknown-id', 1).id).toBe(DEFAULT_ORB_THEME_ID)
  })
})
