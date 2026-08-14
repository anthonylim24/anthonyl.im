import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { syncThemeColor } from '@/lib/themeColor'

/** BreathFlow "Forest" canvas colors for the browser chrome. */
const BREATHFLOW_THEME_COLORS = { light: '#EFEDE6', dark: '#101613' }

/** Applies the persisted theme to <html> and paints the browser chrome. */
export function useBreathflowTheme() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    syncThemeColor(theme, BREATHFLOW_THEME_COLORS)

    return () => {
      root.classList.remove('dark')
    }
  }, [theme])

  return { theme, setTheme }
}
