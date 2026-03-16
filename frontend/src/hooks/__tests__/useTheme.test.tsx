import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useTheme } from '../useTheme'

// Mock the settingsStore to avoid zustand persist/localStorage issues
const mockState = { theme: 'light' as 'dark' | 'light' }
const listeners = new Set<() => void>()

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector?: (s: typeof mockState & { setTheme: (t: 'dark' | 'light') => void }) => unknown) => {
      const state = {
        ...mockState,
        setTheme: (t: 'dark' | 'light') => {
          mockState.theme = t
          listeners.forEach((l) => l())
        },
      }
      return selector ? selector(state) : state
    },
    {
      getState: () => ({
        ...mockState,
        setTheme: (t: 'dark' | 'light') => {
          mockState.theme = t
          listeners.forEach((l) => l())
        },
      }),
      setState: (partial: Partial<typeof mockState>) => {
        Object.assign(mockState, partial)
        listeners.forEach((l) => l())
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  ),
}))

function Probe() {
  const { theme } = useTheme()
  return <div data-testid="theme">{theme}</div>
}

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    mockState.theme = 'light'
  })

  it('light theme: no dark class on documentElement', () => {
    render(<Probe />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('dark theme: dark class added to documentElement', () => {
    mockState.theme = 'dark'
    render(<Probe />)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('toggle: class updates when theme changes', async () => {
    const { rerender } = render(<Probe />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    act(() => {
      mockState.theme = 'dark'
      listeners.forEach((l) => l())
    })
    rerender(<Probe />)
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => {
      mockState.theme = 'light'
      listeners.forEach((l) => l())
    })
    rerender(<Probe />)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
