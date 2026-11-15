import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { syncThemeColor } from '@/lib/themeColor'

/** The paper (`--bw-canvas` in index.css) for the browser chrome, so the toolbar meets the page without a seam. */
export const BREATHFLOW_THEME_COLORS = { light: '#F7F1E6', dark: '#15161C' }

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
