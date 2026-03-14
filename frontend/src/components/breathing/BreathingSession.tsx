import { useCallback, useState, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { useBreathingCycle } from '@/hooks/useBreathingCycle'
import { useWaveform } from '@/hooks/useWaveform'
import { FluidOrb } from './FluidOrb'
import { KirbyEasterEgg } from './KirbyEasterEgg'
import { SessionSummary } from './SessionSummary'
import { PhaseIndicator } from './PhaseIndicator'
import { Timer } from './Timer'
import { Play, Pause, Square, RotateCcw } from 'lucide-react'
import type { SessionConfig } from '@/lib/breathingProtocols'
import { getProtocol } from '@/lib/breathingProtocols'
import { cn } from '@/lib/utils'
import { calculateXP, checkBadgeUnlocks } from '@/lib/gamification'
import { techniqueGradientStyle, getTechniqueVisual } from '@/lib/techniqueConfig'
import { DESTRUCTIVE, BG, withAlpha } from '@/lib/palette'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useViewportOffset } from '@/hooks/useViewportOffset'

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

  const [kirbyMode, setKirbyMode] = useState(false)
  const toggleKirbyMode = useCallback(() => setKirbyMode((prev) => !prev), [])

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

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  const handleSessionComplete = useCallback(() => {
    setShowSummary(true)
  }, [])

  const { session, start, pause, stop, isActive, isPaused, isComplete } =
    useBreathingCycle({
      onSessionComplete: handleSessionComplete,
      enableAudio: true,
    })

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
    start(config)
    showControls()
  }

  const handlePause = () => {
    pause()
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
  }

  const handleStop = () => {
    stop()
    onCancel?.()
  }

  const handleRestart = () => {
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
      role="application"
      aria-label="Breathing session"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ backgroundColor: BG }}
      onMouseMove={isActive && !isPaused ? showControls : undefined}
      onTouchStart={isActive && !isPaused ? showControls : undefined}
    >
      {/* Kirby Easter Egg — background layer, behind all UI */}
      {kirbyMode && <KirbyEasterEgg />}

      {/* Round progress indicator */}
      {(() => {
        const currentRound = session?.currentRound ?? 0
        const total = config.rounds
        const visual = getTechniqueVisual(config.techniqueId)
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
                      background: done
                        ? `linear-gradient(to right, ${visual.gradient.from}, ${visual.gradient.to})`
                        : active
                          ? `linear-gradient(to right, ${visual.primary}60, ${visual.primary}30)`
                          : 'rgba(255,255,255,0.06)',
                      boxShadow: done ? `0 0 6px ${visual.primary}40` : 'none',
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
              <div className="flex-1 h-[3px] rounded-full bg-white/6 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(currentRound / total) * 100}%`,
                    background: `linear-gradient(to right, ${visual.gradient.from}, ${visual.gradient.to})`,
                    boxShadow: `0 0 8px ${visual.primary}50`,
                  }}
                />
              </div>
              <span className="text-[11px] font-mono text-white/25 tabular-nums shrink-0">
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
          <PhaseIndicator phase={session?.currentPhase ?? null} />
        </div>

        {/* FluidOrb - scales with screen height and width to avoid overlap */}
        <div
          className="relative"
          style={{
            width: 'clamp(10rem, 52vw, 24rem)',
            height: 'clamp(10rem, 52vw, 24rem)',
            maxWidth: 'min(82vw, 24rem)',
            maxHeight: 'min(48vh, 24rem)',
          }}
        >
          <FluidOrb
            phase={session?.currentPhase ?? null}
            amplitude={amplitude}
            isActive={isActive && !isPaused}
            className="w-full h-full"
            kirbyMode={kirbyMode}
            onEasterEggToggle={toggleKirbyMode}
          />
        </div>

        {/* Timer below orb */}
        <div className="relative z-10 mt-3">
          <Timer seconds={session?.timeRemaining ?? 0} className="text-white" />
        </div>
      </div>

      {/* Controls - fade to 20% opacity after 3s */}
      <div
        data-testid="session-controls"
        className={cn(
          'session-controls absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 transition-opacity duration-500',
          controlsVisible ? 'opacity-100' : 'opacity-20 hover:opacity-100'
        )}
        style={viewportOffsetStyle}
      >
        {!isActive && !isComplete ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-3 px-10 py-4 rounded-2xl font-semibold text-white text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105"
            style={techniqueGradientStyle(config.techniqueId)}
          >
            <Play className="h-5 w-5" />
            Start
          </button>
        ) : (
          <>
            <button
              onClick={handlePause}
              className="h-14 w-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all duration-300"
            >
              {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <button
              onClick={handleRestart}
              className="h-14 w-14 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all duration-300"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              onClick={handleStop}
              className="h-14 w-14 rounded-xl border flex items-center justify-center transition-all duration-300"
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
