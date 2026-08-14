import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { SessionPage } from '../SessionPage'

function renderSession(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/breathwork/session?${search}`]}>
      <Routes>
        <Route path="/breathwork/session" element={<SessionPage />} />
        <Route path="/breathwork/progress" element={<div>progress page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const BOX_FAST = 'technique=box_breathing&rounds=1&phase_inhale=1&phase_hold_in=1&phase_exhale=1&phase_hold_out=1'

describe('SessionPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useHistoryStore.getState().clearHistory()
    useGamificationStore.getState().resetProgress()
    useSettingsStore.getState().resetSettings()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('falls back to Cyclic Sighing for unknown techniques and default rounds', () => {
    renderSession('technique=juggling&rounds=nope')
    expect(screen.getByRole('heading', { level: 2, name: 'Cyclic Sighing' })).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('gates advanced protocols behind the full safety checklist', () => {
    renderSession('technique=co2_tolerance&rounds=8')
    const start = screen.getByRole('button', { name: /start/i })
    expect(start).toBeDisabled()

    // Hold ladder previews the progressive holds.
    expect(screen.getByText(/15s, 20s, 25s/)).toBeInTheDocument()

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(3)
    checkboxes.forEach((checkbox) => fireEvent.click(checkbox))
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled()

    // Unchecking one disables Start again.
    fireEvent.click(checkboxes[0])
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
  })

  it('does not show a safety checklist for gentle protocols', () => {
    renderSession('technique=box_breathing&rounds=19')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled()
  })

  it('blocks advanced Start during the 90s recovery window with a countdown', () => {
    useHistoryStore.getState().addSession({
      techniqueId: 'power_breathing',
      date: new Date().toISOString(),
      durationSeconds: 120,
      rounds: 30,
      holdTimes: [],
      maxHoldTime: 0,
      avgHoldTime: 0,
    })

    renderSession('technique=co2_tolerance&rounds=8')
    expect(screen.getByText('Recovery in progress')).toBeInTheDocument()
    expect(screen.getByText(/Breathe easy for \d+s/)).toBeInTheDocument()

    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox))
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
  })

  it('keeps gentle protocols available during recovery', () => {
    useHistoryStore.getState().addSession({
      techniqueId: 'co2_tolerance',
      date: new Date().toISOString(),
      durationSeconds: 388,
      rounds: 8,
      holdTimes: [15],
      maxHoldTime: 15,
      avgHoldTime: 15,
    })

    renderSession('technique=cyclic_sighing&rounds=30')
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled()
  })

  it('blocks advanced protocols in a constrained (in-car) viewport', () => {
    vi.stubGlobal('navigator', { ...navigator, userAgent: 'Mozilla/5.0 Tesla/2026.8 Chrome/126' })

    renderSession('technique=power_breathing&rounds=30')
    expect(screen.getByRole('alert')).toHaveTextContent(/Cyclic Sighing or Resonance/)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
  })

  it('runs a full session to the summary: history, XP, first badge, Repeat', () => {
    vi.useFakeTimers()
    renderSession(BOX_FAST)

    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(screen.getByText('Round 1 of 1')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(screen.getByText('Session complete')).toBeInTheDocument()
    expect(screen.getByText('+55')).toBeInTheDocument() // 50 XP * 1.1 streak
    expect(screen.getByText('First Breath')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /repeat/i })).toBeInTheDocument()

    const history = useHistoryStore.getState()
    expect(history.sessions).toHaveLength(1)
    expect(history.sessions[0].customPhaseDurations).toEqual({
      inhale: 1, hold_in: 1, exhale: 1, hold_out: 1,
    })
    expect(history.sessions[0].durationSeconds).toBe(4)
    expect(history.sessions[0].holdTimes).toEqual([1, 1])
    expect(useGamificationStore.getState().xp).toBeGreaterThan(0)
    expect(useGamificationStore.getState().earnedBadges).toContain('first_session')
  })

  it('offers no Repeat after an advanced session; reminds about recovery instead', () => {
    vi.useFakeTimers()
    renderSession('technique=co2_tolerance&rounds=1&phase_inhale=1&phase_hold_in=1&phase_exhale=1&phase_rest=1')

    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox))
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(screen.getByText('Session complete')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /repeat/i })).not.toBeInTheDocument()
    expect(screen.getByText(/90 seconds of easy breathing/)).toBeInTheDocument()
  })

  it('stop discards the session: no history, no XP', () => {
    vi.useFakeTimers()
    renderSession(BOX_FAST)

    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    fireEvent.click(screen.getByRole('button', { name: /stop and discard/i }))

    // Back to setup, nothing saved.
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    expect(useHistoryStore.getState().sessions).toHaveLength(0)
    expect(useGamificationStore.getState().xp).toBe(0)
  })

  it('announces phase changes through the live region', () => {
    vi.useFakeTimers()
    renderSession(BOX_FAST)

    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    act(() => {
      vi.advanceTimersByTime(1000) // inhale (1s) → hold
    })

    const liveRegions = screen.getAllByRole('status')
    expect(liveRegions.some((region) => /Hold/.test(region.textContent ?? ''))).toBe(true)
  })

  it('mood before the session persists onto the saved record', () => {
    vi.useFakeTimers()
    renderSession(BOX_FAST)

    fireEvent.click(screen.getByRole('radio', { name: 'Tense' }))
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    act(() => {
      vi.advanceTimersByTime(4000)
    })

    expect(useHistoryStore.getState().sessions[0].moodBefore).toBe(1)

    // After-mood from the summary persists too.
    fireEvent.click(screen.getByRole('radio', { name: 'Calm' }))
    expect(useHistoryStore.getState().sessions[0].moodAfter).toBe(5)
  })
})
