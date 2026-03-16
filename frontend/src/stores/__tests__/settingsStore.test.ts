// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '../settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      theme: 'light',
      soundEnabled: true,
      soundVolume: 0.3,
      hapticsEnabled: true,
    })
  })

  it('defaults to light theme', () => {
    const { theme } = useSettingsStore.getState()
    expect(theme).toBe('light')
  })

  it('setTheme toggles between dark and light', () => {
    const { setTheme } = useSettingsStore.getState()

    setTheme('dark')
    expect(useSettingsStore.getState().theme).toBe('dark')

    setTheme('light')
    expect(useSettingsStore.getState().theme).toBe('light')
  })
})
