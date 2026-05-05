import {
  useCallback,
  useState,
  useMemo,
  useRef,
  useEffect,
  type CSSProperties,
  type FocusEvent,
} from 'react'
import { useBreathingCycle } from '@/hooks/useBreathingCycle'
import { useWaveform } from '@/hooks/useWaveform'
import { ShaderOrb } from './ShaderOrb'
import { BreathAuraField } from './BreathAuraField'
import { BreathAura } from './BreathAura'
import { SessionSummary } from './SessionSummary'
import { PhaseIndicator } from './PhaseIndicator'
import { Timer } from './Timer'
import { getPhaseCoachCue } from './phaseCoaching'
import { getActiveSessionSafetyCue } from './sessionSafety'
import { getInteractiveBreathingVisualizationLabel } from './visualizationLabels'
import { Play, Pause, Square, RotateCcw } from 'lucide-react'
import {
  calculateSessionDuration,
  getPhaseForRound,
  getProtocol,
  type SessionConfig,
} from '@/lib/breathingProtocols'
import { PHASE_LABELS } from '@/lib/constants'
import { cn, formatTime } from '@/lib/utils'
import {
  calculateXP,
  checkBadgeUnlocks,
  DEFAULT_ORB_THEME_ID,
  getLevelForXP,
  getOrbTheme,
  isOrbThemeUnlocked,
} from '@/lib/gamification'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore, type CompletedSession } from '@/stores/historyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useHaptics } from '@/hooks/useHaptics'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { ActiveSession } from '@/stores/sessionStore'

interface BreathingSessionProps {
  config: SessionConfig
  onComplete?: () => void
  onCancel?: () => void
}

const AURA_GLOW_BACKGROUND = [
  'radial-gradient(circle,',
  'color-mix(in srgb, var(--bw-accent-light) 28%, transparent) 0%,',
  'color-mix(in srgb, var(--bw-accent) 12%, transparent) 42%,',
  'transparent 70%)',
].join(' ')

function getSessionAnnouncement({
  protocolName,
  currentPhase,
  currentRound,
  totalRounds,
  isActive,
  isPaused,
  isComplete,
  coachCue,
  safetyCue,
}: {
  protocolName: string
  currentPhase: keyof typeof PHASE_LABELS | null
  currentRound: number
  totalRounds: number
  isActive: boolean
  isPaused: boolean
  isComplete: boolean
  coachCue: string
  safetyCue: string | null
}): string {
  const safetyText = safetyCue ? ` Safety reminder: ${safetyCue}` : ''

  if (isComplete) {
    return `${protocolName} complete. Review your session summary.`
  }

  if (!isActive || !currentPhase) {
    return `${protocolName} ready. ${coachCue}${safetyText} Press Start when you are ready.`
  }

  const round = Math.min(currentRound + 1, totalRounds)
  const phaseLabel = PHASE_LABELS[currentPhase]
  const progress = `Round ${round} of ${totalRounds}. ${phaseLabel} phase. ${coachCue}${safetyText}`

  if (isPaused) {
    return `${protocolName} paused. ${progress}`
  }

  return progress
}

function isStoredCurrentSession(
  storedSession: CompletedSession,
  activeSession: ActiveSession,
  durationSeconds: number
): boolean {
  return (
    storedSession.date === activeSession.startTime.toISOString() &&
    storedSession.techniqueId === activeSession.config.techniqueId &&
    storedSession.rounds === activeSession.config.rounds &&
    storedSession.durationSeconds === durationSeconds
  )
}

function getPriorSessions(
  storedSessions: CompletedSession[],
  activeSession: ActiveSession,
  durationSeconds: number
): CompletedSession[] {
  return storedSessions.filter(
    (storedSession) => !isStoredCurrentSession(storedSession, activeSession, durationSeconds)
  )
}

export function BreathingSession({
  config,
  onComplete,
  onCancel,
}: BreathingSessionProps) {
  const [showSummary, setShowSummary] = useState(false)
  const [summaryData, setSummaryData] = useState<{
    xpEarned: number
    newBadges: string[]
    durationSeconds: number
    isNewPersonalBest: boolean
  } | null>(null)
  const summaryProcessedRef = useRef(false)

  // Controls auto-fade state
  const [controlsVisible, setControlsVisible] = useState(true)
  const [controlsFocused, setControlsFocused] = useState(false)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reducedMotion = useReducedMotion()

  // Gamification stores
  const { addXP, unlockBadges, recordSession, earnedBadges, selectedTheme, xp } = useGamificationStore()
  const { sessions, getStreak } = useHistoryStore()
  const { soundEnabled, soundVolume } = useSettingsStore()
  const level = getLevelForXP(xp)
  const selectedOrbTheme = isOrbThemeUnlocked(selectedTheme, level)
    ? getOrbTheme(selectedTheme)
    : getOrbTheme(DEFAULT_ORB_THEME_ID)
  const { bottomOffset } = useViewportOffset()
  const viewportOffsetStyle = {
    '--viewport-bottom-offset': `${bottomOffset}px`,
  } as CSSProperties

  const { trigger: haptic } = useHaptics()

  // Hidden aura mode: 5 rapid taps on the visualization.
  const [auraMode, setAuraMode] = useState(false)
  const toggleAuraMode = useCallback(() => setAuraMode((prev) => !prev), [])
  const tapTimestampsRef = useRef<number[]>([])
  const handleRingsClick = useCallback(() => {
    if (reducedMotion) return

    const now = Date.now()
    const recent = tapTimestampsRef.current.filter((t) => now - t < 2000)
    recent.push(now)
    tapTimestampsRef.current = recent
    if (recent.length >= 5) {
      tapTimestampsRef.current = []
      haptic('success')
      toggleAuraMode()
    }
  }, [reducedMotion, toggleAuraMode, haptic])

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current)
      controlsTimerRef.current = null
    }
  }, [])

  const handleSessionComplete = useCallback(() => {
    setShowSummary(true)
  }, [])

  // Haptic feedback on phase transitions
  const handlePhaseChange = useCallback(() => {
    haptic(30)
  }, [haptic])

  const { session, start, pause, stop, isActive, isPaused, isComplete } =
    useBreathingCycle({
      onSessionComplete: handleSessionComplete,
      onPhaseChange: handlePhaseChange,
      enableAudio: soundEnabled,
      audioVolume: soundVolume,
    })

  const showControls = useCallback(() => {
    setControlsVisible(true)
    clearControlsTimer()

    if (isActive && !isPaused && !controlsFocused && !reducedMotion) {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000)
    }
  }, [clearControlsTimer, controlsFocused, isActive, isPaused, reducedMotion])

  const handleControlsFocus = useCallback(() => {
    setControlsFocused(true)
    setControlsVisible(true)
    clearControlsTimer()
  }, [clearControlsTimer])

  const handleControlsBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return
    }

    setControlsFocused(false)
  }, [])

  // Keep screen awake during active sessions
  useWakeLock(isActive)

  const protocol = getProtocol(config.techniqueId)
  const plannedDuration = useMemo(() => calculateSessionDuration(config), [config])
  const coachCue = getPhaseCoachCue(config.techniqueId, session?.currentPhase)
  const safetyCue = getActiveSessionSafetyCue(protocol)
  const sessionAnnouncement = useMemo(
    () =>
      getSessionAnnouncement({
        protocolName: protocol.name,
        currentPhase: session?.currentPhase ?? null,
        currentRound: session?.currentRound ?? 0,
        totalRounds: config.rounds,
        isActive,
        isPaused,
        isComplete: isComplete || Boolean(session?.isComplete),
        coachCue,
        safetyCue,
      }),
    [
      protocol.name,
      session?.currentPhase,
      session?.currentRound,
      session?.isComplete,
      config.rounds,
      isActive,
      isPaused,
      isComplete,
      coachCue,
      safetyCue,
    ]
  )

  const currentPhaseDuration = useMemo(() => {
    if (!session) return 0
    if (!protocol.phases[session.currentPhaseIndex]) return 0
    return getPhaseForRound(
      protocol,
      session.currentRound,
      session.currentPhaseIndex,
      config.customPhaseDurations,
    ).duration
  }, [config.customPhaseDurations, protocol, session])

  // Waveform amplitude drives the active breathing visualization.
  const { amplitude } = useWaveform({
    phase: session?.currentPhase ?? null,
    phaseDuration: currentPhaseDuration,
    timeRemaining: session?.timeRemaining ?? 0,
    isActive: isActive && !isPaused && !reducedMotion,
  })

  // Auto-hide controls after 3s of pointer activity, but keep them visible
  // for keyboard focus and reduced-motion users.
  useEffect(() => {
    let frameId: number | null = null

    if (!isActive || isPaused || controlsFocused || reducedMotion) {
      clearControlsTimer()
      return
    }

    if (isActive && !isPaused) {
      frameId = requestAnimationFrame(showControls)
    }

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      clearControlsTimer()
    }
  }, [
    isActive,
    isPaused,
    controlsFocused,
    reducedMotion,
    showControls,
    clearControlsTimer,
  ])

  // Process gamification on session complete
  useEffect(() => {
    if (showSummary && session && !summaryData && !summaryProcessedRef.current) {
      summaryProcessedRef.current = true
      const durationSeconds = calculateSessionDuration(config)
      const priorSessions = getPriorSessions(sessions, session, durationSeconds)

      const streak = getStreak()
      const xpEarned = calculateXP(config.techniqueId, config.rounds, streak)
      addXP(xpEarned)
      recordSession()

      // Build context for badge checks matching the actual interface
      const totalSeconds = priorSessions.reduce((sum, s) => sum + s.durationSeconds, 0) + durationSeconds
      const sessionsByTechnique: Record<string, number> = {}
      const maxHoldByTechnique: Record<string, number> = {}
      for (const s of priorSessions) {
        sessionsByTechnique[s.techniqueId] = (sessionsByTechnique[s.techniqueId] ?? 0) + 1
        maxHoldByTechnique[s.techniqueId] = Math.max(maxHoldByTechnique[s.techniqueId] ?? 0, s.maxHoldTime)
      }
      // Count the current session too
      sessionsByTechnique[config.techniqueId] = (sessionsByTechnique[config.techniqueId] ?? 0) + 1
      maxHoldByTechnique[config.techniqueId] = Math.max(
        maxHoldByTechnique[config.techniqueId] ?? 0,
        Math.max(...(session.holdTimes ?? []), 0)
      )

      const newBadges = checkBadgeUnlocks({
        totalSessions: priorSessions.length + 1,
        streak,
        totalSeconds,
        sessionsByTechnique,
        maxHoldByTechnique,
        sessionHour: new Date().getHours(),
        sessionDurationSeconds: durationSeconds,
      })

      // Filter to only truly new badges
      const trulyNewBadges = newBadges.filter((b) => !earnedBadges.includes(b))
      unlockBadges(trulyNewBadges)

      const isNewPersonalBest = session.holdTimes.length > 0
        ? Math.max(...session.holdTimes) > Math.max(...priorSessions.flatMap((s) => s.holdTimes || []), 0)
        : false

      const frameId = requestAnimationFrame(() => {
        setSummaryData({
          xpEarned,
          newBadges: trulyNewBadges,
          durationSeconds,
          isNewPersonalBest,
        })
      })

      return () => cancelAnimationFrame(frameId)
    }
  }, [showSummary, session, summaryData, sessions, config, getStreak, addXP, recordSession, unlockBadges, earnedBadges])

  const handleStart = () => {
    summaryProcessedRef.current = false
    haptic('success')
    start(config)
    showControls()
  }

  const handlePause = useCallback(() => {
    haptic(40)
    pause()
    setControlsVisible(true)
    clearControlsTimer()
  }, [clearControlsTimer, haptic, pause])

  const handleStop = useCallback(() => {
    summaryProcessedRef.current = false
    haptic('error')
    stop()
    onCancel?.()
  }, [haptic, onCancel, stop])

  const handleRestart = () => {
    summaryProcessedRef.current = false
    haptic('nudge')
    stop()
    start(config)
    showControls()
  }

  const handleRepeatFromSummary = () => {
    setShowSummary(false)
    setSummaryData(null)
    handleRestart()
  }

  const handleCloseSummary = () => {
    summaryProcessedRef.current = false
    setShowSummary(false)
    setSummaryData(null)
    stop()
    onComplete?.()
  }

  useEffect(() => {
    if (!isActive || showSummary) return

    const handleSessionKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const targetTag = target?.tagName
      const isEditableTarget =
        target?.isContentEditable ||
        targetTag === 'INPUT' ||
        targetTag === 'TEXTAREA' ||
        targetTag === 'SELECT'
      const interactiveSelector = [
        'button',
        'a',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="link"]',
        '[role="switch"]',
        '[role="slider"]',
      ].join(', ')
      const isInteractiveTarget =
        target instanceof Element && Boolean(target.closest(interactiveSelector))

      if (event.defaultPrevented || event.repeat || isEditableTarget || isInteractiveTarget) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        handleStop()
      }

      if (event.key === ' ') {
        event.preventDefault()
        handlePause()
      }
    }

    window.addEventListener('keydown', handleSessionKeyDown)
    return () => window.removeEventListener('keydown', handleSessionKeyDown)
  }, [handlePause, handleStop, isActive, showSummary])

  const controlsDimmed =
    isActive && !isPaused && !controlsVisible && !controlsFocused && !reducedMotion
  const canUseAuraMode = auraMode && !reducedMotion
  const visualizationClickHandler = reducedMotion ? undefined : handleRingsClick

  return (
    <div
      role="region"
      aria-label={`Breathing session: ${protocol.name}`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden select-none bg-transparent breathwork"
      onMouseMove={isActive && !isPaused ? showControls : undefined}
      onTouchStart={isActive && !isPaused ? showControls : undefined}
    >
      {/* Opaque canvas as absolute child — keeps the fixed parent transparent
          so Safari 26 liquid glass can tint through the safe areas */}
      <div className="absolute inset-0 breath-bg" aria-hidden="true" />
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="session-live-region"
      >
        {sessionAnnouncement}
      </div>
      {/* Aura mode — background layer, behind all UI */}
      {canUseAuraMode && <BreathAuraField />}

      {/* Round progress indicator */}
      {(() => {
        const currentRound = session?.currentRound ?? 0
        const total = config.rounds
        const useSegments = total <= 20

        if (useSegments) {
          return (
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-[2px] px-4 pt-4 safe-top">
              {Array.from({ length: total }, (_, i) => {
                const done = i < currentRound
                const active = i === currentRound && isActive
                return (
                  <div
                    key={i}
                    className="flex-1 h-[3px] rounded-full transition-all duration-500"
                    style={{
                      background: done ? 'var(--bw-accent)' : active ? 'var(--bw-accent-subtle)' : 'var(--bw-border)',
                    }}
                  />
                )
              })}
            </div>
          )
        }

        // For many rounds, use a continuous bar with round counter
        return (
          <div className="absolute top-0 left-0 right-0 z-10 safe-top pt-4 px-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'var(--bw-border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(currentRound / total) * 100}%`,
                    background: 'var(--bw-accent)',
                  }}
                />
              </div>
              <span className="text-[11px] font-mono text-bw-tertiary tabular-nums shrink-0">
                {currentRound}/{total}
              </span>
            </div>
          </div>
        )
      })()}

      <div
        data-testid="session-content"
        className="session-content relative z-10 flex w-full max-w-md flex-1 flex-col items-center justify-center px-5"
        style={viewportOffsetStyle}
      >
        {/* Phase text above orb */}
        <div className="relative z-10 mb-3">
          <PhaseIndicator phase={session?.currentPhase ?? null} techniqueId={config.techniqueId} />
        </div>

        {/* Breathing visualization - scales with screen height and width to avoid overlap */}
        <div
          className="relative"
          style={{
            width: 'clamp(10rem, 52vw, 24rem)',
            height: 'clamp(10rem, 52vw, 24rem)',
            maxWidth: 'min(82vw, 24rem)',
            maxHeight: 'min(48vh, 24rem)',
          }}
        >
          {canUseAuraMode ? (
            <button
              type="button"
              className="w-full h-full flex items-center justify-center relative appearance-none border-0 bg-transparent p-0"
              onClick={handleRingsClick}
              aria-label={getInteractiveBreathingVisualizationLabel(
                session?.currentPhase ?? null,
              )}
              data-testid="concentric-rings"
            >
              {/* Radial glow behind the aura uses transform + opacity instead
                  of rebuilding gradient strings every frame. */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: AURA_GLOW_BACKGROUND,
                  transform: `translateZ(0) scale(${0.7 + amplitude * 0.6})`,
                  opacity: 0.3 + amplitude * 0.7,
                  transition: 'transform 800ms cubic-bezier(0.16, 1, 0.3, 1), opacity 800ms ease-out',
                }}
              />
              <BreathAura size={200} amplitude={amplitude} />
            </button>
          ) : (
            <ShaderOrb
              phase={session?.currentPhase ?? null}
              amplitude={amplitude}
              isActive={isActive && !isPaused}
              techniqueId={config.techniqueId}
              themeColors={selectedOrbTheme.colors}
              className="w-full h-full"
              onClick={visualizationClickHandler}
            />
          )}
        </div>

        {/* Timer below orb */}
        <div className="relative z-10 mt-3">
          {session ? (
            <Timer seconds={session.timeRemaining} className="text-bw" />
          ) : (
            <div
              className="font-mono text-4xl font-normal tabular-nums tracking-[0.04em] text-bw md:text-5xl"
              aria-label={`${formatTime(plannedDuration)} planned duration`}
              data-testid="session-planned-duration"
            >
              <span className="opacity-90">{formatTime(plannedDuration)}</span>
              {' '}
              <span className="ml-2 text-[0.28em] font-medium uppercase tracking-[0.07em] text-bw-tertiary">
                planned
              </span>
            </div>
          )}
        </div>

        <p
          className="relative z-10 mt-4 max-w-xs text-center text-xs leading-relaxed text-bw-tertiary"
          data-testid="phase-coach-cue"
        >
          {coachCue}
        </p>

        {safetyCue ? (
          <p
            className="relative z-10 mt-3 max-w-xs border border-bw-border px-3 py-2 text-center text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary"
            data-testid="active-session-safety-cue"
          >
            {safetyCue}
          </p>
        ) : null}
      </div>

      {/* Controls - fade only for pointer users after 3s of active breathing */}
      <div
        data-testid="session-controls"
        className={cn(
          'session-controls absolute left-1/2 z-10 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-4 transition-opacity duration-500 motion-reduce:transition-none focus-within:opacity-100',
          controlsDimmed ? 'opacity-20 hover:opacity-100' : 'opacity-100'
        )}
        role="toolbar"
        aria-label="Session controls"
        onFocusCapture={handleControlsFocus}
        onBlurCapture={handleControlsBlur}
        style={viewportOffsetStyle}
      >
        {!isActive && !isComplete ? (
          <button
            type="button"
            onClick={handleStart}
            className="flex min-h-14 max-w-full items-center gap-3 border border-bw-accent bg-bw-accent px-8 py-4 text-base font-medium text-bw-accent-foreground transition-all duration-300 hover:scale-105"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            Start
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handlePause}
              aria-label={isPaused ? 'Resume' : 'Pause'}
              className="h-14 w-14 flex items-center justify-center text-bw transition-all duration-300 border border-bw-border"
            >
              {isPaused ? <Play className="h-5 w-5" aria-hidden="true" /> : <Pause className="h-5 w-5" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={handleRestart}
              aria-label="Restart"
              className="h-14 w-14 flex items-center justify-center text-bw transition-all duration-300 border border-bw-border"
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleStop}
              aria-label="Stop"
              className="h-14 w-14 border border-bw-destructive-border bg-bw-destructive-subtle text-bw-destructive flex items-center justify-center transition-all duration-300 hover:bg-bw-destructive-hover"
            >
              <Square className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {/* Session Summary overlay */}
      {showSummary && summaryData && session && (
        <SessionSummary
          techniqueId={config.techniqueId}
          xpEarned={summaryData.xpEarned}
          newBadges={summaryData.newBadges}
          rounds={config.rounds}
          durationSeconds={summaryData.durationSeconds}
          holdTimes={session.holdTimes}
          isNewPersonalBest={summaryData.isNewPersonalBest}
          onClose={handleCloseSummary}
          onRepeat={handleRepeatFromSummary}
        />
      )}
    </div>
  )
}
