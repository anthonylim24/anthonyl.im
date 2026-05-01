import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CadenceEditor } from '../CadenceEditor'
import { clampCadenceDuration } from '../cadenceDurations'
import { breathingProtocols } from '@/lib/breathingProtocols'
import { BREATH_PHASES, TECHNIQUE_IDS, type BreathPhase, type TechniqueId } from '@/lib/constants'

function Harness({ techniqueId = TECHNIQUE_IDS.RESONANCE_BREATHING }: {
  techniqueId?: TechniqueId
}) {
  const [customDurations, setCustomDurations] =
    useState<Partial<Record<BreathPhase, number>>>({})
  const protocol = breathingProtocols[techniqueId]

  return (
    <CadenceEditor
      protocol={protocol}
      customDurations={customDurations}
      onDurationChange={(phase, duration) =>
        setCustomDurations((currentDurations) => ({
          ...currentDurations,
          [phase]: duration,
        }))
      }
      onReset={() => setCustomDurations({})}
    />
  )
}

describe('CadenceEditor', () => {
  it('renders accessible steppers for each protocol phase', () => {
    render(<Harness />)

    expect(screen.getByRole('heading', { name: 'Cadence' })).toBeInTheDocument()
    expect(screen.getByRole('group', {
      name: /Resonance Breathing cadence controls/i,
    })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
    expect(screen.getByRole('button', {
      name: /Increase Breathe In duration, currently 5 seconds/i,
    })).toHaveClass('h-11', 'w-11')
    expect(screen.getByRole('button', {
      name: /Decrease Breathe Out duration, currently 5 seconds/i,
    })).toHaveClass('h-11', 'w-11')
  })

  it('marks customized values and can reset them', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', {
      name: /Increase Breathe In duration, currently 5 seconds/i,
    }))

    expect(screen.getByText('6s')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).not.toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.queryByText('Custom')).not.toBeInTheDocument()
    expect(screen.queryByText('6s')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('names hold controls by position so same-label phases stay distinct', () => {
    render(<Harness techniqueId={TECHNIQUE_IDS.BOX_BREATHING} />)

    expect(screen.getByRole('button', {
      name: /Increase Hold after inhale duration/i,
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: /Increase Hold after exhale duration/i,
    })).toBeInTheDocument()
  })

  it('clamps cadence durations within phase-specific guardrails', () => {
    expect(clampCadenceDuration(BREATH_PHASES.INHALE, 30)).toBe(12)
    expect(clampCadenceDuration(BREATH_PHASES.EXHALE, 0)).toBe(1)
    expect(clampCadenceDuration(BREATH_PHASES.HOLD_IN, 29.6)).toBe(30)
  })
})
