import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBreathingCycle } from '../useBreathingCycle'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'
import type { BreathPhase, TechniqueId } from '@/lib/constants'
import type { SessionConfig } from '@/lib/breathingProtocols'
import { useSessionStore } from '@/stores/sessionStore'

interface SavedSession {
  id: string
  techniqueId: TechniqueId
  date: string
  durationSeconds: number
  rounds: number
  holdTimes: number[]
  maxHoldTime: number
  avgHoldTime: number
}

const historyMock = vi.hoisted(() => {
  const state = {
    sessions: [] as SavedSession[],
    personalBests: {},
    vo2MaxManual: null as number | null,
    vo2MaxHistory: [] as { value: number; date: string }[],
  }

  const addSession = vi.fn((session: Omit<SavedSession, 'id'>) => {
    state.sessions = [{ ...session, id: `session-${state.sessions.length + 1}` }, ...state.sessions]
  })

  const setState = vi.fn((partial: Partial<typeof state>) => {
    Object.assign(state, partial)
  })

  const getState = () => ({
    ...state,
    addSession,
    clearHistory: vi.fn(),
    setVO2Max: vi.fn(),
    getSessionsByTechnique: vi.fn(),
    getRecentSessions: vi.fn(),
    getStreak: vi.fn(),
  })

  return { state, addSession, setState, getState }
})

vi.mock('@/stores/historyStore', () => ({
  useHistoryStore: Object.assign(() => historyMock.getState(), {
    getState: historyMock.getState,
    setState: historyMock.setState,
  }),
}))

interface ProbeProps {
  config: SessionConfig
  onPhaseChange?: (phase: BreathPhase) => void
  onRoundComplete?: (round: number) => void
  onSessionComplete?: () => void
  enableAudio?: boolean
  audioVolume?: number
}

function Probe({
  config,
  onPhaseChange,
  onRoundComplete,
  onSessionComplete,
  enableAudio = false,
  audioVolume,
}: ProbeProps) {
  const cycle = useBreathingCycle({
    enableAudio,
    audioVolume,
    onPhaseChange,
    onRoundComplete,
    onSessionComplete,
  })

  return (
    <>
      <button type="button" onClick={() => cycle.start(config)}>
        Start
      </button>
      <button type="button" onClick={cycle.pause}>
        Pause
      </button>
      <button type="button" onClick={cycle.stop}>
        Stop
      </button>
      <div data-testid="phase">{cycle.session?.currentPhase ?? 'none'}</div>
      <div data-testid="round">{cycle.session?.currentRound ?? 'none'}</div>
      <div data-testid="time">{cycle.session?.timeRemaining ?? 'none'}</div>
      <div data-testid="complete">{String(cycle.isComplete)}</div>
    </>
  )
}

function RerenderingProbe(props: ProbeProps) {
  const [updateCount, setUpdateCount] = useState(0)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setUpdateCount(1), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [])

  return (
    <>
      <div data-testid="parent-renders">{updateCount}</div>
      <Probe {...props} />
    </>
  )
}

async function advanceSeconds(seconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(seconds * 1000)
  })
}

describe('useBreathingCycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'))
    useSessionStore.getState().resetSession()
    historyMock.setState({
      sessions: [],
      personalBests: {},
      vo2MaxManual: null,
      vo2MaxHistory: [],
    })
    historyMock.addSession.mockClear()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    useSessionStore.getState().resetSession()
    historyMock.setState({
      sessions: [],
      personalBests: {},
      vo2MaxManual: null,
      vo2MaxHistory: [],
    })
    historyMock.addSession.mockClear()
    vi.unstubAllGlobals()
  })

  it('completes a one-round power session from the final 1-second phase', async () => {
    const onPhaseChange = vi.fn()
    const onRoundComplete = vi.fn()
    const onSessionComplete = vi.fn()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    render(
      <Probe
        config={{ techniqueId: TECHNIQUE_IDS.POWER_BREATHING, rounds: 1 }}
        onPhaseChange={onPhaseChange}
        onRoundComplete={onRoundComplete}
        onSessionComplete={onSessionComplete}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.INHALE)
    expect(screen.getByTestId('time')).toHaveTextContent('2')
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    await advanceSeconds(1)
    expect(screen.getByTestId('time')).toHaveTextContent('1')
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    await advanceSeconds(1)
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.EXHALE)
    expect(screen.getByTestId('time')).toHaveTextContent('2')
    expect(onPhaseChange).toHaveBeenCalledWith(BREATH_PHASES.EXHALE)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    await advanceSeconds(1)
    expect(screen.getByTestId('time')).toHaveTextContent('1')

    await advanceSeconds(1)
    expect(screen.getByTestId('complete')).toHaveTextContent('true')
    expect(onRoundComplete).toHaveBeenCalledWith(0)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)

    const [savedSession] = historyMock.getState().sessions
    expect(savedSession).toMatchObject({
      techniqueId: TECHNIQUE_IDS.POWER_BREATHING,
      durationSeconds: 4,
      rounds: 1,
      holdTimes: [],
      maxHoldTime: 0,
      avgHoldTime: 0,
    })
  })

  it('uses the configured audio volume for session beeps', () => {
    const gainSetValueAtTime = vi.fn()
    const gainRampToValueAtTime = vi.fn()
    const oscillatorStart = vi.fn()
    const oscillatorStop = vi.fn()

    class FakeAudioContext {
      currentTime = 12
      destination = {}

      createOscillator() {
        return {
          connect: vi.fn(),
          frequency: { value: 0 },
          type: 'sine',
          start: oscillatorStart,
          stop: oscillatorStop,
        }
      }

      createGain() {
        return {
          connect: vi.fn(),
          gain: {
            setValueAtTime: gainSetValueAtTime,
            exponentialRampToValueAtTime: gainRampToValueAtTime,
          },
        }
      }

      close() {
        return Promise.resolve()
      }
    }

    vi.stubGlobal('AudioContext', FakeAudioContext)

    render(
      <Probe
        config={{ techniqueId: TECHNIQUE_IDS.POWER_BREATHING, rounds: 1 }}
        enableAudio
        audioVolume={0.12}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(gainSetValueAtTime).toHaveBeenCalledWith(0.12, 12)
    expect(gainRampToValueAtTime).toHaveBeenCalledWith(0.01, 12.15)
    expect(oscillatorStart).toHaveBeenCalledWith(12)
    expect(oscillatorStop).toHaveBeenCalledWith(12.15)
  })

  it('keeps ticking through an unrelated StrictMode rerender during the final second', async () => {
    const onSessionComplete = vi.fn()

    render(
      <StrictMode>
        <RerenderingProbe
          config={{ techniqueId: TECHNIQUE_IDS.POWER_BREATHING, rounds: 1 }}
          onSessionComplete={onSessionComplete}
        />
      </StrictMode>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await advanceSeconds(3)
    expect(screen.getByTestId('parent-renders')).toHaveTextContent('1')
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.EXHALE)
    expect(screen.getByTestId('time')).toHaveTextContent('1')

    await advanceSeconds(1)
    expect(screen.getByTestId('complete')).toHaveTextContent('true')
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
  })

  it('runs and records sessions with custom phase durations', async () => {
    render(
      <Probe
        config={{
          techniqueId: TECHNIQUE_IDS.POWER_BREATHING,
          rounds: 1,
          customPhaseDurations: {
            [BREATH_PHASES.INHALE]: 1,
            [BREATH_PHASES.EXHALE]: 1,
          },
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.INHALE)
    expect(screen.getByTestId('time')).toHaveTextContent('1')

    await advanceSeconds(1)
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.EXHALE)
    expect(screen.getByTestId('time')).toHaveTextContent('1')

    await advanceSeconds(1)
    expect(screen.getByTestId('complete')).toHaveTextContent('true')

    const [savedSession] = historyMock.getState().sessions
    expect(savedSession).toMatchObject({
      techniqueId: TECHNIQUE_IDS.POWER_BREATHING,
      durationSeconds: 2,
      rounds: 1,
      customPhaseDurations: {
        [BREATH_PHASES.INHALE]: 1,
        [BREATH_PHASES.EXHALE]: 1,
      },
    })
  })

  it('records hold time before saving a completed CO2 tolerance session', async () => {
    render(
      <Probe
        config={{ techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE, rounds: 1 }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.INHALE)

    await advanceSeconds(3)
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.HOLD_IN)
    expect(screen.getByTestId('time')).toHaveTextContent('15')

    await advanceSeconds(15)
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.EXHALE)

    await advanceSeconds(13)
    expect(screen.getByTestId('complete')).toHaveTextContent('true')

    const [savedSession] = historyMock.getState().sessions
    expect(savedSession).toMatchObject({
      techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
      durationSeconds: 31,
      rounds: 1,
      holdTimes: [15],
      maxHoldTime: 15,
      avgHoldTime: 15,
    })
  })

  it('excludes paused time from hold records and completed duration', async () => {
    render(
      <Probe
        config={{ techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE, rounds: 1 }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    await advanceSeconds(3)
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.HOLD_IN)

    await advanceSeconds(5)
    expect(screen.getByTestId('time')).toHaveTextContent('10')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await advanceSeconds(30)
    expect(screen.getByTestId('time')).toHaveTextContent('10')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await advanceSeconds(10)
    expect(screen.getByTestId('phase')).toHaveTextContent(BREATH_PHASES.EXHALE)

    await advanceSeconds(13)
    expect(screen.getByTestId('complete')).toHaveTextContent('true')

    const [savedSession] = historyMock.getState().sessions
    expect(savedSession).toMatchObject({
      techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
      durationSeconds: 31,
      rounds: 1,
      holdTimes: [15],
      maxHoldTime: 15,
      avgHoldTime: 15,
    })
  })
})
