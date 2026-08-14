import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { HomePage } from '../HomePage'

function renderHome() {
  return render(<MemoryRouter><HomePage /></MemoryRouter>)
}

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear()
    useHistoryStore.getState().clearHistory()
    useGamificationStore.getState().resetProgress()
    // Fix "now" at 2pm so the default goal is Calm and greeting is stable.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 14, 14, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('first run: greeting, five-minute promise, Begin → Cyclic Sighing autostart', () => {
    renderHome()
    expect(screen.getByRole('heading', { name: /good afternoon/i })).toBeInTheDocument()
    expect(screen.getByText(/About 5 minutes/)).toBeInTheDocument()

    const begin = screen.getByRole('link', { name: /begin/i })
    expect(begin).toHaveAttribute('href', expect.stringContaining('technique=cyclic_sighing'))
    expect(begin).toHaveAttribute('href', expect.stringContaining('rounds=30'))
    expect(begin).toHaveAttribute('href', expect.stringContaining('autostart=1'))
  })

  it('returning user sees streak status instead of first-run copy', () => {
    useHistoryStore.getState().addSession({
      techniqueId: 'cyclic_sighing',
      date: new Date().toISOString(),
      durationSeconds: 300,
      rounds: 30,
      holdTimes: [],
      maxHoldTime: 0,
      avgHoldTime: 0,
    })
    useGamificationStore.getState().recordSession()

    renderHome()
    expect(screen.queryByText(/About 5 minutes/)).not.toBeInTheDocument()
    expect(screen.getByText(/1-day streak\. Practiced today\./)).toBeInTheDocument()
    expect(screen.getByText('Pick up where you left off')).toBeInTheDocument()
  })

  it('Sleep + Long tunes the recommendation to 4-7-8 with window-matched rounds', () => {
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Sleep' }))
    fireEvent.click(screen.getByRole('button', { name: /long · 8 min/i }))

    const card = screen.getByLabelText('Recommended session')
    expect(card).toHaveTextContent('4-7-8 Downshift')
    expect(card).toHaveTextContent('25 rounds')
  })

  it('shows the recovery notice when Perform is selected during the window', () => {
    useHistoryStore.getState().addSession({
      techniqueId: 'power_breathing',
      date: new Date().toISOString(),
      durationSeconds: 120,
      rounds: 30,
      holdTimes: [],
      maxHoldTime: 0,
      avgHoldTime: 0,
    })

    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Perform' }))
    expect(screen.getByText('Recovery in progress')).toBeInTheDocument()
    // The blocked advanced protocols are not recommended.
    const card = screen.getByLabelText('Recommended session')
    expect(card).not.toHaveTextContent('Power Breathing')
    expect(card).not.toHaveTextContent('CO2 Tolerance Table')
  })

  it('lists all nine techniques in the catalog with safety flags on advanced ones', () => {
    renderHome()
    for (const name of [
      'Cyclic Sighing', 'Resonance Breathing', 'Diaphragmatic Reset', 'Extended Exhale',
      'Box Breathing', '4-7-8 Downshift', 'CO2 Tolerance Table', 'Pursed-Lip Recovery', 'Power Breathing',
    ]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText('Safety check').length).toBeGreaterThanOrEqual(2)
  })
})
