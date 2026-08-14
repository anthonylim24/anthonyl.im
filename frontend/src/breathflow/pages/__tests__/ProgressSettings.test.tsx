import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Keep the account section out of unit tests — cloud sync is covered by
// useCloudSync.test.ts and needs a real ClerkProvider.
vi.mock('@/lib/clerk', () => ({ CLERK_PUBLISHABLE_KEY: '', CLERK_ENABLED: false }))
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { xpForLevel } from '../../gamify/levels'
import { BadgeGrid } from '../../components/BadgeGrid'
import { ProgressPage } from '../ProgressPage'
import { SettingsPage } from '../SettingsPage'

function seedSession(overrides: Partial<Parameters<ReturnType<typeof useHistoryStore.getState>['addSession']>[0]> = {}) {
  useHistoryStore.getState().addSession({
    techniqueId: 'box_breathing',
    date: new Date().toISOString(),
    durationSeconds: 304,
    rounds: 19,
    holdTimes: [4, 4],
    maxHoldTime: 4,
    avgHoldTime: 4,
    ...overrides,
  })
}

beforeEach(() => {
  localStorage.clear()
  useHistoryStore.getState().clearHistory()
  useGamificationStore.getState().resetProgress()
  useSettingsStore.getState().resetSettings()
})

describe('ProgressPage', () => {
  it('shows the empty state with a Box Breathing entry point', () => {
    render(<MemoryRouter><ProgressPage /></MemoryRouter>)
    expect(screen.getByText('No sessions yet.')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /start box breathing/i })
    expect(cta).toHaveAttribute('href', expect.stringContaining('technique=box_breathing'))
    expect(cta).toHaveAttribute('href', expect.stringContaining('rounds=19'))
  })

  it('renders week stats, history rows, and repeat links with custom cadence', () => {
    seedSession({ customPhaseDurations: { inhale: 5, hold_in: 5, exhale: 5, hold_out: 5 }, durationSeconds: 200, rounds: 10 })
    render(<MemoryRouter><ProgressPage /></MemoryRouter>)

    expect(screen.getByText(/1 active day this week/)).toBeInTheDocument()
    expect(screen.getByText('custom cadence')).toBeInTheDocument()

    const repeat = screen.getByRole('link', { name: /repeat box breathing session/i })
    expect(repeat).toHaveAttribute(
      'href',
      '/breathwork/session?technique=box_breathing&rounds=10&phase_inhale=5&phase_hold_in=5&phase_exhale=5&phase_hold_out=5',
    )
  })

  it('requires confirmation before clearing history', () => {
    seedSession()
    render(<MemoryRouter><ProgressPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /clear history/i }))
    expect(useHistoryStore.getState().sessions).toHaveLength(1)
    expect(screen.getByRole('button', { name: /delete history/i })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: /delete history/i }))
    expect(useHistoryStore.getState().sessions).toHaveLength(0)
  })
})

describe('BadgeGrid secrets', () => {
  it('hides secret badges until earned', () => {
    const { rerender } = render(<BadgeGrid earnedBadgeIds={[]} />)
    expect(screen.queryByText('Night Owl')).not.toBeInTheDocument()
    expect(screen.queryByText('Early Bird')).not.toBeInTheDocument()
    expect(screen.queryByText('Marathon')).not.toBeInTheDocument()
    expect(screen.getByText('First Breath')).toBeInTheDocument()

    rerender(<BadgeGrid earnedBadgeIds={['night_owl']} />)
    expect(screen.getByText('Night Owl')).toBeInTheDocument()
    expect(screen.queryByText('Early Bird')).not.toBeInTheDocument()
  })
})

describe('SettingsPage', () => {
  it('locks orb colors above the current level and falls back to Default', () => {
    // Level 1 user with a saved high-level theme.
    useGamificationStore.getState().setSelectedTheme('transcend')
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    const clarity = screen.getByRole('button', { name: /clarity, unlocks at level 50/i })
    expect(clarity).toBeDisabled()

    // The active swatch renders as Default (stored selection is preserved).
    const defaultSwatch = screen.getByRole('button', { name: 'Default' })
    expect(defaultSwatch).toHaveAttribute('aria-pressed', 'true')
    expect(useGamificationStore.getState().selectedTheme).toBe('transcend')
  })

  it('unlocks orb colors once the level is reached', () => {
    useGamificationStore.getState().addXP(xpForLevel(5))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    const tidal = screen.getByRole('button', { name: 'Tidal' })
    expect(tidal).toBeEnabled()
    fireEvent.click(tidal)
    expect(useGamificationStore.getState().selectedTheme).toBe('tidal')
  })

  it('rejects invalid import files with an inline error', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    const input = screen.getByLabelText(/import breathflow data file/i)
    const file = new File(['{"nonsense": true}'], 'bad.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/import failed/i)
  })

  it('clears all data after two-tap confirm', () => {
    seedSession()
    useGamificationStore.getState().addXP(100)
    useSettingsStore.getState().setTheme('dark')
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /clear all data/i }))
    expect(useHistoryStore.getState().sessions).toHaveLength(1) // not yet
    expect(screen.getByRole('button', { name: /erase everything/i })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: /erase everything/i }))
    expect(useHistoryStore.getState().sessions).toHaveLength(0)
    expect(useGamificationStore.getState().xp).toBe(0)
    expect(useSettingsStore.getState().theme).toBe('light')
  })

  it('shows the wellness disclosure', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    expect(screen.getByText('Wellness education, not medical care')).toBeInTheDocument()
  })
})

describe('theme fallback in the session orb', () => {
  it('progress page renders personal bests for hold techniques', () => {
    seedSession({ techniqueId: 'co2_tolerance', holdTimes: [15, 20], maxHoldTime: 20, avgHoldTime: 17.5 })
    render(<MemoryRouter><ProgressPage /></MemoryRouter>)
    const section = screen.getByText('Personal bests').closest('section') as HTMLElement
    expect(within(section).getByText('20s hold')).toBeInTheDocument()
  })
})
