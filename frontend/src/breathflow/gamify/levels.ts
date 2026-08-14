export const MAX_LEVEL = 50

/** Total XP required to reach level L: sum of (80 + 20i) for i in 1..L-1. */
export function xpForLevel(level: number): number {
  let total = 0
  for (let i = 1; i < level; i++) {
    total += 80 + 20 * i
  }
  return total
}

export function levelForXP(xp: number): number {
  let level = 1
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) {
    level++
  }
  return level
}

const LEVEL_TITLES: readonly [number, string][] = [
  [1, 'Beginner'],
  [2, 'Regular'],
  [5, 'Consistent'],
  [10, 'Skilled'],
  [15, 'Advanced'],
  [20, 'Expert'],
  [30, 'Veteran'],
  [40, 'Seasoned'],
  [50, 'Long-term'],
]

export function getLevelTitle(level: number): string {
  let title = LEVEL_TITLES[0][1]
  for (const [threshold, name] of LEVEL_TITLES) {
    if (level >= threshold) title = name
  }
  return title
}

export interface LevelProgress {
  level: number
  title: string
  /** XP accumulated inside the current level. */
  xpIntoLevel: number
  /** XP needed to go from this level to the next (0 at max level). */
  xpForNextLevel: number
}

export function getLevelProgress(xp: number): LevelProgress {
  const level = levelForXP(xp)
  const currentFloor = xpForLevel(level)
  const nextFloor = level >= MAX_LEVEL ? currentFloor : xpForLevel(level + 1)
  return {
    level,
    title: getLevelTitle(level),
    xpIntoLevel: xp - currentFloor,
    xpForNextLevel: nextFloor - currentFloor,
  }
}
