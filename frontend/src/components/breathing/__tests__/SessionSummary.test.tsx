import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionSummary } from '../SessionSummary'
import { TECHNIQUE_IDS } from '@/lib/constants'

const hapticsMock = vi.hoisted(() => ({
  trigger: vi.fn(),
}))

vi.mock('@/hooks/useHaptics', () => ({
  useHaptics: () => ({ trigger: hapticsMock.trigger }),
}))

const defaultProps = {
  techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
  xpEarned: 75,
  newBadges: ['first_session'],
  rounds: 4,
  durationSeconds: 300,
  holdTimes: [18, 22, 20],
  isNewPersonalBest: true,
  onClose: vi.fn(),
}

const gentleProps = {
  ...defaultProps,
  techniqueId: TECHNIQUE_IDS.RESONANCE_BREATHING,
  xpEarned: 55,
  holdTimes: [],
  isNewPersonalBest: false,
}

describe('SessionSummary', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('displays XP earned', async () => {
    render(<SessionSummary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('+75 XP')).toBeTruthy()
    })
  })

  it('displays round count', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText('4')).toBeTruthy()
  })

  it('shows personal best indicator', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText(/personal best/i)).toBeTruthy()
  })

  it('shows new badges', () => {
    render(<SessionSummary {...defaultProps} />)
    expect(screen.getByText('First Breath')).toBeTruthy()
  })

  it('shows hold stats', async () => {
    render(<SessionSummary {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('22s')).toBeTruthy()
    })
  })

  it('shows protocol-specific insight and next step guidance', () => {
    render(<SessionSummary {...defaultProps} />)

    expect(screen.getByText(/CO2 Tolerance Table/)).toBeTruthy()
    expect(screen.getAllByText('Full protocol').length).toBeGreaterThan(0)
    expect(screen.getByText('CO2 tolerance exposure')).toBeTruthy()
    expect(screen.getByText(/progressive holds practice/i)).toBeTruthy()
    expect(screen.getByText(/relaxed nasal breathing/i)).toBeTruthy()
  })

  it('fires the initial celebration haptic once', () => {
    const { rerender } = render(<SessionSummary {...defaultProps} />)

    expect(hapticsMock.trigger).toHaveBeenCalledWith(
      [100, 50, 100, 50, 150],
      { intensity: 0.9 }
    )

    rerender(<SessionSummary {...gentleProps} newBadges={[]} />)

    expect(hapticsMock.trigger).toHaveBeenCalledTimes(1)
  })

  it('exposes the summary as an accessible dialog', () => {
    render(<SessionSummary {...defaultProps} />)

    expect(screen.getByRole('dialog', { name: /session complete/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /close session summary/i })).toBeTruthy()
  })

  it('uses a semantic scrim token for the dialog backdrop', () => {
    render(<SessionSummary {...defaultProps} />)

    const dialog = screen.getByRole('dialog', { name: /session complete/i })

    expect(dialog.className).toContain('bg-[color:var(--bw-dialog-scrim)]')
    expect(dialog.className).not.toContain('bg-black')
    expect(dialog.className).not.toContain('backdrop-blur')
  })

  it('uses 44px minimum hit areas for summary actions', () => {
    render(<SessionSummary {...defaultProps} onRepeat={vi.fn()} />)

    expect(screen.getByRole('button', { name: /close session summary/i })).toHaveClass('h-11', 'w-11')
    expect(screen.queryByRole('button', { name: /repeat/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toHaveClass('min-h-11')
  })

  it('shows recovery guidance instead of repeat for advanced protocols', () => {
    render(<SessionSummary {...defaultProps} onRepeat={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /repeat/i })).not.toBeInTheDocument()
    expect(screen.getByText('Recovery first')).toBeTruthy()
    expect(screen.getByText(/relaxed nasal breathing before another advanced set/i)).toBeTruthy()
  })

  it('can repeat a gentle completed session', async () => {
    const user = userEvent.setup()
    const onRepeat = vi.fn()
    render(<SessionSummary {...gentleProps} onRepeat={onRepeat} />)

    const repeatButton = screen.getByRole('button', { name: /repeat/i })
    expect(repeatButton).toHaveClass('min-h-11')
    await user.click(repeatButton)

    expect(onRepeat).toHaveBeenCalledTimes(1)
  })

  it('focuses the primary action when the summary opens', async () => {
    render(<SessionSummary {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue/i })).toHaveFocus()
    })
  })

  it('closes from the Escape key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SessionSummary {...defaultProps} onClose={onClose} />)

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps keyboard tabbing inside the summary dialog', async () => {
    const user = userEvent.setup()
    render(<SessionSummary {...defaultProps} />)

    const closeButton = screen.getByRole('button', { name: /close session summary/i })
    const continueButton = screen.getByRole('button', { name: /continue/i })

    await waitFor(() => {
      expect(continueButton).toHaveFocus()
    })

    await user.tab()
    expect(closeButton).toHaveFocus()

    await user.tab({ shift: true })
    expect(continueButton).toHaveFocus()
  })
})
