import { useCallback, useEffect, useState } from 'react'

export const CHAT_APPEARANCE_KEY = 'chat-appearance:v1'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface StoredAppearance {
  theme: ThemePreference
  ambience: boolean
}

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function canUseMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function readSystemTheme(): ResolvedTheme {
  if (!canUseMatchMedia()) return 'light'
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light'
}

function readReducedMotion(): boolean {
  return canUseMatchMedia() && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function readStoredAppearance(): StoredAppearance | null {
  try {
    const raw = localStorage.getItem(CHAT_APPEARANCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredAppearance>
    const theme =
      parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
        ? parsed.theme
        : null
    if (!theme || typeof parsed.ambience !== 'boolean') return null
    return { theme, ambience: parsed.ambience }
  } catch {
    return null
  }
}

function persistAppearance(value: StoredAppearance): void {
  try {
    localStorage.setItem(CHAT_APPEARANCE_KEY, JSON.stringify(value))
  } catch {
    // Private mode and quota errors are non-fatal.
  }
}

export function useChatAppearance() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    return readStoredAppearance()?.theme ?? 'system'
  })
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => readSystemTheme())
  const [ambience, setAmbience] = useState<boolean>(() => {
    const stored = readStoredAppearance()
    if (stored) return stored.ambience
    return !readReducedMotion()
  })

  const theme: ResolvedTheme =
    themePreference === 'system' ? systemTheme : themePreference

  useEffect(() => {
    if (!canUseMatchMedia()) return
    const media = window.matchMedia(COLOR_SCHEME_QUERY)
    const sync = () => {
      setSystemTheme(media.matches ? 'dark' : 'light')
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    persistAppearance({ theme: themePreference, ambience })
  }, [themePreference, ambience])

  const toggleTheme = useCallback(() => {
    setThemePreference((current) => {
      const resolved = current === 'system' ? readSystemTheme() : current
      return resolved === 'dark' ? 'light' : 'dark'
    })
  }, [])

  const toggleAmbience = useCallback(() => {
    setAmbience((current) => !current)
  }, [])

  return {
    theme,
    themePreference,
    ambience,
    toggleTheme,
    toggleAmbience,
  }
}
