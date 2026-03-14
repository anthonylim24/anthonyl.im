import type { TechniqueId } from './constants'
import { TECHNIQUE_IDS } from './constants'
import { breathingProtocols } from './breathingProtocols'
import { ACCENT, ACCENT_BRIGHT } from './palette'

// ---------------------------------------------------------------------------
// XP Calculation
// ---------------------------------------------------------------------------

const BASE_XP: Record<TechniqueId, number> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: 50,
  [TECHNIQUE_IDS.CO2_TOLERANCE]: 75,
  [TECHNIQUE_IDS.POWER_BREATHING]: 60,
  [TECHNIQUE_IDS.CYCLIC_SIGHING]: 55,
}

export function calculateXP(
  techniqueId: TechniqueId,
  rounds: number,
  streak: number,
): number {
  const base = BASE_XP[techniqueId]
  const defaultRounds = breathingProtocols[techniqueId].defaultRounds
  const extraRounds = Math.max(0, rounds - defaultRounds)
  const roundBonus = extraRounds * 5
  const multiplier = Math.min(1 + streak * 0.1, 2.0)
  return Math.round((base + roundBonus) * multiplier)
}

// ---------------------------------------------------------------------------
// Leveling
// ---------------------------------------------------------------------------

export function getXPForLevel(level: number): number {
  if (level <= 1) return 0
  let total = 0
  for (let i = 1; i < level; i++) {
    total += 80 + 20 * i
  }
  return total
}

export function getLevelForXP(xp: number): number {
  for (let level = 50; level >= 1; level--) {
    if (xp >= getXPForLevel(level)) return level
  }
  return 1
}

// ---------------------------------------------------------------------------
// Level Titles
// ---------------------------------------------------------------------------

const LEVEL_TITLES: [number, string][] = [
  [1, 'First Breath'],
  [2, 'Beginner'],
  [3, 'Novice'],
  [4, 'Apprentice'],
  [5, 'Breath Student'],
  [10, 'Rhythm Keeper'],
  [15, 'Steady Breather'],
  [20, 'Breath Adept'],
  [25, 'Flow State'],
  [30, 'Breath Sage'],
  [35, 'Zen Practitioner'],
  [40, 'Air Bender'],
  [45, 'Breath Sensei'],
  [50, 'Breath Master'],
]

export function getLevelTitle(level: number): string {
  let title = LEVEL_TITLES[0][1]
  for (const [threshold, name] of LEVEL_TITLES) {
    if (level >= threshold) {
      title = name
    }
  }
  return title
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export interface Badge {
  id: string
  name: string
  description: string
  icon: string
  secret?: boolean
}

export const BADGES: Badge[] = [
  {
    id: 'first_session',
    name: 'First Breath',
    description: 'Complete your first breathing session',
    icon: 'Wind',
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: 'Flame',
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day streak',
    icon: 'Trophy',
  },
  {
    id: 'sessions_100',
    name: 'Century Club',
    description: 'Complete 100 sessions',
    icon: 'Award',
  },
  {
    id: 'hour_total',
    name: 'Hour of Power',
    description: 'Accumulate 1 hour of total breathing time',
    icon: 'Clock',
  },
  {
    id: 'ten_hours',
    name: 'Dedicated Breather',
    description: 'Accumulate 10 hours of total breathing time',
    icon: 'Timer',
  },
  {
    id: 'box_master',
    name: 'Box Master',
    description: 'Complete 50 box breathing sessions',
    icon: 'Square',
  },
  {
    id: 'co2_explorer',
    name: 'CO2 Explorer',
    description: 'Complete 50 CO2 tolerance sessions',
    icon: 'Beaker',
  },
  {
    id: 'power_adept',
    name: 'Power Adept',
    description: 'Complete 50 power breathing sessions',
    icon: 'Zap',
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Complete a session between 10 PM and 4 AM',
    icon: 'Moon',
    secret: true,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Complete a session between 5 AM and 7 AM',
    icon: 'Sunrise',
    secret: true,
  },
  {
    id: 'marathon',
    name: 'Marathon Breather',
    description: 'Complete a single session lasting 30 minutes or more',
    icon: 'Mountain',
    secret: true,
  },
]

// ---------------------------------------------------------------------------
// Badge Unlock Check
// ---------------------------------------------------------------------------

export interface BadgeCheckContext {
  totalSessions: number
  streak: number
  totalSeconds: number
  sessionsByTechnique: Record<string, number>
  maxHoldByTechnique: Record<string, number>
  sessionHour: number
  sessionDurationSeconds: number
}

export function checkBadgeUnlocks(ctx: BadgeCheckContext): string[] {
  const earned: string[] = []

  if (ctx.totalSessions >= 1) earned.push('first_session')
  if (ctx.streak >= 7) earned.push('streak_7')
  if (ctx.streak >= 30) earned.push('streak_30')
  if (ctx.totalSessions >= 100) earned.push('sessions_100')
  if (ctx.totalSeconds >= 3600) earned.push('hour_total')
  if (ctx.totalSeconds >= 36000) earned.push('ten_hours')

  if ((ctx.sessionsByTechnique[TECHNIQUE_IDS.BOX_BREATHING] ?? 0) >= 50) {
    earned.push('box_master')
  }
  if ((ctx.sessionsByTechnique[TECHNIQUE_IDS.CO2_TOLERANCE] ?? 0) >= 50) {
    earned.push('co2_explorer')
  }
  if ((ctx.sessionsByTechnique[TECHNIQUE_IDS.POWER_BREATHING] ?? 0) >= 50) {
    earned.push('power_adept')
  }

  // Secret badges
  if (ctx.sessionHour >= 22 || ctx.sessionHour < 4) {
    earned.push('night_owl')
  }
  if (ctx.sessionHour >= 5 && ctx.sessionHour < 7) {
    earned.push('early_bird')
  }
  if (ctx.sessionDurationSeconds >= 1800) {
    earned.push('marathon')
  }

  return earned
}

// ---------------------------------------------------------------------------
// Orb Themes
// ---------------------------------------------------------------------------

export interface OrbTheme {
  id: string
  name: string
  colors: [string, string]
  unlockLevel: number
}

export const ORB_THEMES: OrbTheme[] = [
  { id: 'default', name: 'Default', colors: [ACCENT, ACCENT_BRIGHT], unlockLevel: 1 },
  { id: 'tidal', name: 'Tidal', colors: ['#3D9088', '#7AD0C6'], unlockLevel: 5 },
  { id: 'ember', name: 'Ember', colors: ['#B58834', '#E8BE72'], unlockLevel: 10 },
  { id: 'coral', name: 'Coral', colors: ['#B45C56', '#EA9490'], unlockLevel: 15 },
  { id: 'grove', name: 'Grove', colors: ['#5E9A6C', '#9CD4A8'], unlockLevel: 20 },
  { id: 'midnight', name: 'Midnight', colors: ['#2A3370', '#4F46E5'], unlockLevel: 25 },
  { id: 'dawn', name: 'Dawn', colors: ['#D4A04A', '#EA9490'], unlockLevel: 30 },
  { id: 'arctic', name: 'Arctic', colors: ['#56B4A9', '#A0E5DD'], unlockLevel: 40 },
  { id: 'transcend', name: 'Transcend', colors: ['#D0D4FF', '#E8EAFF'], unlockLevel: 50 },
]

export function getUnlockedThemes(level: number): OrbTheme[] {
  return ORB_THEMES.filter((theme) => theme.unlockLevel <= level)
}
