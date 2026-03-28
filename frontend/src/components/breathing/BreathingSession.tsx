import { useCallback, useState, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { useBreathingCycle } from '@/hooks/useBreathingCycle'
import { useWaveform } from '@/hooks/useWaveform'
import { ShaderOrb } from './ShaderOrb'
import { KirbyEasterEgg } from './KirbyEasterEgg'
import { KirbyCharacter } from './KirbyCharacter'
import { SessionSummary } from './SessionSummary'
import { PhaseIndicator } from './PhaseIndicator'
import { Timer } from './Timer'
import { Play, Pause, Square, RotateCcw } from 'lucide-react'
import type { SessionConfig } from '@/lib/breathingProtocols'
import { getProtocol } from '@/lib/breathingProtocols'
import { cn } from '@/lib/utils'
import { calculateXP, checkBadgeUnlocks } from '@/lib/gamification'
import { DESTRUCTIVE, withAlpha } from '@/lib/palette'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useViewportOffset } from '@/hooks/useViewportOffset'
import { useWakeLock } from '@/hooks/useWakeLock'
import { useHaptics } from '@/hooks/useHaptics'

interface BreathingSessionProps {
  config: SessionConfig
  onComplete?: () => void
  onCancel?: () => void
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

  // Controls auto-fade state
  const [controlsVisible, setControlsVisible] = useState(true)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Gamification stores
  const { addXP, unlockBadges, recordSession, earnedBadges } = useGamificationStore()
  const { sessions, getStreak } = useHistoryStore()
  const { bottomOffset } = useViewportOffset()
  const viewportOffsetStyle = {
    '--viewport-bottom-offset': `${bottomOffset}px`,
  } as CSSProperties

  const { trigger: haptic } = useHaptics()

  // Kirby easter egg: 5 rapid taps on the rings
  const [kirbyMode, setKirbyMode] = useState(false)
  const toggleKirbyMode = useCallback(() => setKirbyMode((prev) => !prev), [])
  const tapTimestampsRef = useRef<number[]>([])
  const handleRingsClick = useCallback(() => {
    const now = Date.now()
    const recent = tapTimestampsRef.current.filter((t) => now - t < 2000)
    recent.push(now)
    tapTimestampsRef.current = recent
    if (recent.length >= 5) {
      tapTimestampsRef.current = []
      haptic('success')
      toggleKirbyMode()
    }
  }, [toggleKirbyMode, haptic])

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000)
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
      enableAudio: true,
    })

  // Keep screen awake during active sessions
  useWakeLock(isActive)

  const protocol = getProtocol(config.techniqueId)

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

  // Auto-hide controls after 3s of activity
  useEffect(() => {
    if (isActive && !isPaused) {
      showControls()
    }
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    }
  }, [isActive, isPaused, showControls])

  // Process gamification on session complete
  useEffect(() => {
    if (showSummary && session && !summaryData) {
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

      setSummaryData({
        xpEarned,
        newBadges: trulyNewBadges,
        durationSeconds,
        isNewPersonalBest,
      })
    }
  }, [showSummary, session, summaryData, sessions, config, getStreak, addXP, recordSession, unlockBadges, earnedBadges])

  const handleStart = () => {
    haptic('success')
    start(config)
    showControls()
  }

  const handlePause = () => {
    haptic(40)
    pause()
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
  }

  const handleStop = () => {
    haptic('error')
    stop()
    onCancel?.()
  }

  const handleRestart = () => {
    haptic('nudge')
    stop()
    start(config)
    showControls()
  }

  const handleCloseSummary = () => {
    setShowSummary(false)
    setSummaryData(null)
    stop()
    onComplete?.()
  }

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
      {/* Kirby Easter Egg — background layer, behind all UI */}
      {kirbyMode && <KirbyEasterEgg />}

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
                      background: done ? 'var(--bw-text)' : active ? 'var(--bw-text-faint)' : 'var(--bw-border)',
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
                    background: 'var(--bw-text)',
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
          {kirbyMode ? (
            <div className="w-full h-full flex items-center justify-center relative" onClick={handleRingsClick} data-testid="concentric-rings">
              {/* Radial glow behind Kirby that pulses with breath —
                  uses transform + opacity (both GPU-composited) instead of
                  rebuilding gradient strings every frame */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,150,170,0.28) 0%, rgba(255,200,210,0.14) 40%, transparent 70%)',
                  transform: `translateZ(0) scale(${0.7 + amplitude * 0.6})`,
                  opacity: 0.3 + amplitude * 0.7,
                  transition: 'transform 800ms cubic-bezier(0.16, 1, 0.3, 1), opacity 800ms ease-out',
                }}
              />
              <KirbyCharacter size={200} puffAmount={amplitude} />
            </div>
          ) : (
            <ShaderOrb
              phase={session?.currentPhase ?? null}
              amplitude={amplitude}
              isActive={isActive && !isPaused}
              techniqueId={config.techniqueId}
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

      {/* Controls - fade to 20% opacity after 3s */}
      <div
        data-testid="session-controls"
        className={cn(
          'session-controls absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 transition-opacity duration-500 focus-within:opacity-100',
          controlsVisible ? 'opacity-100' : 'opacity-20 hover:opacity-100'
        )}
        role="toolbar"
        aria-label="Session controls"
        style={viewportOffsetStyle}
      >
        {!isActive && !isComplete ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-3 px-10 py-4 font-mono font-semibold text-lg transition-all duration-300 hover:scale-105 bg-foreground text-background border border-bw-border"
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
