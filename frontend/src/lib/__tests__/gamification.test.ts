// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  calculateXP,
  getXPForLevel,
  getLevelForXP,
  getLevelTitle,
  BADGES,
  checkBadgeUnlocks,
  ORB_THEMES,
  getUnlockedThemes,
} from '../gamification'
import { TECHNIQUE_IDS } from '@/lib/constants'

describe('calculateXP', () => {
  it('returns base XP for each technique with default rounds and no streak', () => {
    // box_breathing: base 50, defaultRounds=4, streak=0
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 4, 0)).toBe(50)
    // co2_tolerance: base 75, defaultRounds=8, streak=0
    expect(calculateXP(TECHNIQUE_IDS.CO2_TOLERANCE, 8, 0)).toBe(75)
    // power_breathing: base 60, defaultRounds=3, streak=0
    expect(calculateXP(TECHNIQUE_IDS.POWER_BREATHING, 3, 0)).toBe(60)
  })

  it('adds +5 per extra round beyond default', () => {
    // box_breathing default is 4, doing 6 rounds = 50 + 2*5 = 60
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 6, 0)).toBe(60)
    // co2_tolerance default is 8, doing 10 rounds = 75 + 2*5 = 85
    expect(calculateXP(TECHNIQUE_IDS.CO2_TOLERANCE, 10, 0)).toBe(85)
  })

  it('applies streak multiplier', () => {
    // streak=5 => multiplier = 1 + 5*0.1 = 1.5
    // box base 50 * 1.5 = 75
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 4, 5)).toBe(75)
  })

  it('caps streak multiplier at 2.0', () => {
    // streak=15 => raw multiplier = 1 + 15*0.1 = 2.5, capped to 2.0
    // box base 50 * 2.0 = 100
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 4, 15)).toBe(100)
  })

  it('gives no bonus for fewer rounds than default', () => {
    // box_breathing default is 4, doing 2 rounds => still base 50
    expect(calculateXP(TECHNIQUE_IDS.BOX_BREATHING, 2, 0)).toBe(50)
  })
})

describe('getXPForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(getXPForLevel(1)).toBe(0)
  })

  it('returns 100 for level 2', () => {
    // sum of (80 + 20*i) for i=1..1 = 80 + 20 = 100
    expect(getXPForLevel(2)).toBe(100)
  })

  it('increases progressively for higher levels', () => {
    // level 3: sum of (80+20*1) + (80+20*2) = 100 + 120 = 220
    expect(getXPForLevel(3)).toBe(220)
    // level 4: 100 + 120 + 140 = 360
    expect(getXPForLevel(4)).toBe(360)
  })
})

describe('getLevelForXP', () => {
  it('returns level 1 for 0 XP', () => {
    expect(getLevelForXP(0)).toBe(1)
  })

  it('returns level 2 for 100 XP', () => {
    expect(getLevelForXP(100)).toBe(2)
  })

  it('returns correct level for large XP', () => {
    // level 3 requires 220, so 219 should be level 2
    expect(getLevelForXP(219)).toBe(2)
    expect(getLevelForXP(220)).toBe(3)
  })

  it('caps at level 50', () => {
    expect(getLevelForXP(999999)).toBe(50)
  })
})

describe('getLevelTitle', () => {
  it('returns "First Breath" for level 1', () => {
    expect(getLevelTitle(1)).toBe('First Breath')
  })

  it('returns "Breath Master" for level 50', () => {
    expect(getLevelTitle(50)).toBe('Breath Master')
  })

  it('returns the highest matching title for levels between defined thresholds', () => {
    // level 7 should get level 5 title "Breath Student"
    expect(getLevelTitle(7)).toBe('Breath Student')
    // level 12 should get level 10 title "Rhythm Keeper"
    expect(getLevelTitle(12)).toBe('Rhythm Keeper')
  })
})

describe('BADGES', () => {
  it('has 12 badges', () => {
    expect(BADGES).toHaveLength(12)
  })

  it('has secret badges for night_owl, early_bird, marathon', () => {
    const nightOwl = BADGES.find((b) => b.id === 'night_owl')
    const earlyBird = BADGES.find((b) => b.id === 'early_bird')
    const marathon = BADGES.find((b) => b.id === 'marathon')
    expect(nightOwl?.secret).toBe(true)
    expect(earlyBird?.secret).toBe(true)
    expect(marathon?.secret).toBe(true)
  })
})

describe('checkBadgeUnlocks', () => {
  const defaultCtx = {
    totalSessions: 0,
    streak: 0,
    totalSeconds: 0,
    sessionsByTechnique: {} as Record<string, number>,
    maxHoldByTechnique: {} as Record<string, number>,
    sessionHour: 12,
    sessionDurationSeconds: 300,
  }

  it('returns first_session when totalSessions >= 1', () => {
    const result = checkBadgeUnlocks({ ...defaultCtx, totalSessions: 1 })
    expect(result).toContain('first_session')
  })

  it('returns night_owl for sessions at hour 23', () => {
    const result = checkBadgeUnlocks({
      ...defaultCtx,
      totalSessions: 1,
      sessionHour: 23,
    })
    expect(result).toContain('night_owl')
  })

  it('returns marathon for sessions lasting >= 30 minutes', () => {
    const result = checkBadgeUnlocks({
      ...defaultCtx,
      totalSessions: 1,
      sessionDurationSeconds: 1800,
    })
    expect(result).toContain('marathon')
  })

  it('returns streak_7 when streak >= 7', () => {
    const result = checkBadgeUnlocks({
      ...defaultCtx,
      totalSessions: 7,
      streak: 7,
    })
    expect(result).toContain('streak_7')
  })

  it('returns streak_30 when streak >= 30', () => {
    const result = checkBadgeUnlocks({
      ...defaultCtx,
      totalSessions: 30,
      streak: 30,
    })
    expect(result).toContain('streak_30')
  })
})

describe('ORB_THEMES', () => {
  it('has 9 themes', () => {
    expect(ORB_THEMES).toHaveLength(9)
  })

  it('has default theme at unlock level 1', () => {
    const defaultTheme = ORB_THEMES.find((t) => t.id === 'default')
    expect(defaultTheme?.unlockLevel).toBe(1)
  })
})

describe('getUnlockedThemes', () => {
  it('returns only default at level 1', () => {
    const themes = getUnlockedThemes(1)
    expect(themes).toHaveLength(1)
    expect(themes[0].id).toBe('default')
  })

  it('includes aurora at level 5', () => {
    const themes = getUnlockedThemes(5)
    expect(themes.some((t) => t.id === 'aurora')).toBe(true)
  })

  it('returns all themes at level 50', () => {
    const themes = getUnlockedThemes(50)
    expect(themes).toHaveLength(9)
  })
})
