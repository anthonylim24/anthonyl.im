export interface OrbTheme {
  /**
   * Persisted id — never rename. Legacy ids 'midnight' and 'transcend'
   * display as "Nocturne" and "Clarity".
   */
  id: string
  name: string
  /** [core, halo] gradient stops for the session orb. */
  colors: [string, string]
  unlockLevel: number
}

export const DEFAULT_ORB_THEME_ID = 'default'

/** Cosmetic orb colors, unlocked by level. */
export const ORB_THEMES: readonly OrbTheme[] = [
  { id: DEFAULT_ORB_THEME_ID, name: 'Default', colors: ['#2E7D5B', '#7FC8A4'], unlockLevel: 1 },
  { id: 'tidal', name: 'Tidal', colors: ['#2F7E8A', '#7FC4CE'], unlockLevel: 5 },
  { id: 'ember', name: 'Ember', colors: ['#B0762F', '#E4B36C'], unlockLevel: 10 },
  { id: 'coral', name: 'Coral', colors: ['#B25A54', '#E59B93'], unlockLevel: 15 },
  { id: 'grove', name: 'Grove', colors: ['#4F8A5C', '#9BCCA4'], unlockLevel: 20 },
  { id: 'midnight', name: 'Nocturne', colors: ['#44506B', '#8B97B8'], unlockLevel: 25 },
  { id: 'dawn', name: 'Dawn', colors: ['#C08A4B', '#E7B7A0'], unlockLevel: 30 },
  { id: 'arctic', name: 'Arctic', colors: ['#4FA3B0', '#A7DCE2'], unlockLevel: 40 },
  { id: 'transcend', name: 'Clarity', colors: ['#6E9E7C', '#DCC97E'], unlockLevel: 50 },
]

export function getOrbTheme(id: string): OrbTheme {
  return ORB_THEMES.find((theme) => theme.id === id) ?? ORB_THEMES[0]
}

export function isOrbThemeUnlocked(id: string, level: number): boolean {
  return getOrbTheme(id).unlockLevel <= level
}

/**
 * The theme to render: the saved theme when unlocked, otherwise Default.
 * The stored selection is never overwritten by the fallback.
 */
export function resolveOrbTheme(selectedId: string, level: number): OrbTheme {
  const theme = getOrbTheme(selectedId)
  return theme.unlockLevel <= level ? theme : getOrbTheme(DEFAULT_ORB_THEME_ID)
}
