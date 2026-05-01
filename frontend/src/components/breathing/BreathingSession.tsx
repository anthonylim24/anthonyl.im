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
import { Play, Pause, Square, RotateCcw } from 'lucide-react'
import type { SessionConfig } from '@/lib/breathingProtocols'
import { getProtocol } from '@/lib/breathingProtocols'
import { PHASE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import {
  calculateXP,
  checkBadgeUnlocks,
  DEFAULT_ORB_THEME_ID,
  getLevelForXP,
  getOrbTheme,
  isOrbThemeUnlocked,
} from '@/lib/gamification'
import { DESTRUCTIVE, withAlpha } from '@/lib/palette'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useHaptics } from '@/hooks/useHaptics'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface BreathingSessionProps {
  config: SessionConfig
  onComplete?: () => void
  onCancel?: () => void
}

function getSessionAnnouncement({
  protocolName,
  currentPhase,
  currentRound,
  totalRounds,
  isActive,
  isPaused,
  isComplete,
}: {
  protocolName: string
  currentPhase: keyof typeof PHASE_LABELS | null
  currentRound: number
  totalRounds: number
  isActive: boolean
  isPaused: boolean
  isComplete: boolean
}): string {
  if (isComplete) {
    return `${protocolName} complete. Review your session summary.`
  }

  if (!isActive || !currentPhase) {
    return `${protocolName} ready. Press Start when you are ready.`
  }

  const round = Math.min(currentRound + 1, totalRounds)
  const phaseLabel = PHASE_LABELS[currentPhase]
  const progress = `Round ${round} of ${totalRounds}. ${phaseLabel} phase.`

  if (isPaused) {
    return `${protocolName} paused. ${progress}`
  }

  return progress
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
    ]
  )

  const currentPhaseDuration = useMemo(() => {
    if (!session) return 0
    return protocol.phases[session.currentPhaseIndex]?.duration ?? 0
  }, [session, protocol.phases])

  // Waveform for FluidOrb
  const { amplitude } = useWaveform({
    phase: session?.currentPhase ?? null,
    phaseDuration: currentPhaseDuration,
    timeRemaining: session?.timeRemaining ?? 0,
    isActive: isActive && !isPaused,
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
      const endTime = new Date()
      const durationSeconds = Math.round(
        (endTime.getTime() - session.startTime.getTime()) / 1000
      )

      const streak = getStreak()
      const xpEarned = calculateXP(config.techniqueId, config.rounds, streak)
      addXP(xpEarned)
      recordSession()

      // Build context for badge checks matching the actual interface
      const allSessions = sessions
      const totalSeconds = allSessions.reduce((sum, s) => sum + s.durationSeconds, 0) + durationSeconds
      const sessionsByTechnique: Record<string, number> = {}
      const maxHoldByTechnique: Record<string, number> = {}
      for (const s of allSessions) {
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
        totalSessions: allSessions.length + 1,
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
        ? Math.max(...session.holdTimes) > Math.max(...sessions.flatMap((s) => s.holdTimes || []), 0)
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

  const handlePause = () => {
    haptic(40)
    pause()
    setControlsVisible(true)
    clearControlsTimer()
  }

  const handleStop = () => {
    summaryProcessedRef.current = false
    haptic('error')
    stop()
    onCancel?.()
  }

  const handleRestart = () => {
    summaryProcessedRef.current = false
    haptic('nudge')
    stop()
    start(config)
    showControls()
  }

  const handleCloseSummary = () => {
    summaryProcessedRef.current = false
    setShowSummary(false)
    setSummaryData(null)
    stop()
    onComplete?.()
  }

  const controlsDimmed =
    isActive && !isPaused && !controlsVisible && !controlsFocused && !reducedMotion

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
      {auraMode && <BreathAuraField />}

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
          {auraMode ? (
            <button
              type="button"
              className="w-full h-full flex items-center justify-center relative appearance-none border-0 bg-transparent p-0"
              onClick={handleRingsClick}
              aria-label="Breathing visualization. Activate repeatedly to toggle alternate visual."
              data-testid="concentric-rings"
            >
              {/* Radial glow behind the aura uses transform + opacity instead
                  of rebuilding gradient strings every frame. */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(214,173,71,0.28) 0%, rgba(184,134,11,0.12) 42%, transparent 70%)',
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
              onClick={handleRingsClick}
            />
          )}
        </div>

        {/* Timer below orb */}
        <div className="relative z-10 mt-3">
          <Timer seconds={session?.timeRemaining ?? 0} className="text-bw" />
        </div>
      </div>

      {/* Controls - fade only for pointer users after 3s of active breathing */}
      <div
        data-testid="session-controls"
        className={cn(
          'session-controls absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 transition-opacity duration-500 motion-reduce:transition-none focus-within:opacity-100',
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
            onClick={handleStart}
            className="flex items-center gap-3 px-10 py-4 font-medium text-lg transition-all duration-300 hover:scale-105 bg-bw-accent text-bw-accent-foreground border border-bw-accent"
          >
            <Play className="h-5 w-5" />
            Start
          </button>
        ) : (
          <>
            <button
              onClick={handlePause}
              aria-label={isPaused ? 'Resume' : 'Pause'}
              className="h-14 w-14 flex items-center justify-center text-bw transition-all duration-300 border border-bw-border"
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <button
              onClick={handleRestart}
              aria-label="Restart"
              className="h-14 w-14 flex items-center justify-center text-bw transition-all duration-300 border border-bw-border"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              onClick={handleStop}
              aria-label="Stop"
              className="h-14 w-14 border flex items-center justify-center transition-all duration-300"
              style={{
                backgroundColor: withAlpha(DESTRUCTIVE, 0.2),
                borderColor: withAlpha(DESTRUCTIVE, 0.2),
                color: DESTRUCTIVE,
              }}
            >
              <Square className="h-5 w-5" />
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
        />
      )}
    </div>
  )
}
