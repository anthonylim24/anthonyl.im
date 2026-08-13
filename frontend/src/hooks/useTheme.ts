import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { syncThemeColor } from '@/lib/themeColor'

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    syncThemeColor(theme === 'dark' ? 'dark' : 'light')

    return () => {
      root.classList.remove('dark')
    }
  }, [theme])

  return { theme, setTheme }
}
