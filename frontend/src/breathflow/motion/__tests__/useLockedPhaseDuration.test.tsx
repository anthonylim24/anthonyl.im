import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EngineStatus } from '../../engine/sessionEngine'
import { useLockedPhaseDuration } from '../useLockedPhaseDuration'

function Harness({
  phaseIndex,
  phaseSeconds,
  secondsLeftInPhase,
  status,
}: {
  phaseIndex: number
  phaseSeconds: number
  secondsLeftInPhase: number
  status: EngineStatus
}) {
  const duration = useLockedPhaseDuration(
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )
  return <div data-testid="duration">{duration}</div>
}

describe('useLockedPhaseDuration', () => {
  it('keeps the phase-start duration across 1s ticks', () => {
    const { rerender, getByTestId } = render(
      <Harness phaseIndex={0} phaseSeconds={4} secondsLeftInPhase={4} status="running" />,
    )
    expect(getByTestId('duration').textContent).toBe('4')

    rerender(
      <Harness phaseIndex={0} phaseSeconds={4} secondsLeftInPhase={2} status="running" />,
    )
    expect(getByTestId('duration').textContent).toBe('4')
  })

  it('uses remaining time when mounting mid-phase', () => {
    const { getByTestId } = render(
      <Harness phaseIndex={0} phaseSeconds={4} secondsLeftInPhase={1.5} status="running" />,
    )
    expect(getByTestId('duration').textContent).toBe('1.5')
  })

  it('relocks when the phase changes or the session resumes', () => {
    const { rerender, getByTestId } = render(
      <Harness phaseIndex={0} phaseSeconds={4} secondsLeftInPhase={4} status="running" />,
    )

    rerender(
      <Harness phaseIndex={1} phaseSeconds={6} secondsLeftInPhase={6} status="running" />,
    )
    expect(getByTestId('duration').textContent).toBe('6')

    rerender(
      <Harness phaseIndex={1} phaseSeconds={6} secondsLeftInPhase={3} status="paused" />,
    )
    rerender(
      <Harness phaseIndex={1} phaseSeconds={6} secondsLeftInPhase={3} status="running" />,
    )
    expect(getByTestId('duration').textContent).toBe('3')
  })
})
