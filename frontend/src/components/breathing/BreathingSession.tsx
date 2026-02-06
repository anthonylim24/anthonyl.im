import { useCallback, useState, useMemo, useRef, useEffect } from 'react'
import { useBreathingCycle } from '@/hooks/useBreathingCycle'
import { useWaveform } from '@/hooks/useWaveform'
import { FluidOrb } from './FluidOrb'
import { SessionSummary } from './SessionSummary'
import { PhaseIndicator } from './PhaseIndicator'
import { Timer } from './Timer'
import { Play, Pause, Square, RotateCcw } from 'lucide-react'
import type { SessionConfig } from '@/lib/breathingProtocols'
import { getProtocol } from '@/lib/breathingProtocols'
import { cn } from '@/lib/utils'
import { calculateXP, checkBadgeUnlocks } from '@/lib/gamification'
import { techniqueGradientStyle, techniqueProgressStyle } from '@/lib/techniqueConfig'
import { DESTRUCTIVE } from '@/lib/palette'
import { useGamificationStore } from '@/stores/gamificationStore'
import { useHistoryStore } from '@/stores/historyStore'

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

  // Calculate progress
  const progress = session
    ? ((session.currentRound * protocol.phases.length + session.currentPhaseIndex) /
        (config.rounds * protocol.phases.length)) *
      100
    : 0

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
      className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#080b16] overflow-hidden select-none"
      onMouseMove={isActive && !isPaused ? showControls : undefined}
      onTouchStart={isActive && !isPaused ? showControls : undefined}
    >
      {/* Thin gradient progress bar at top */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/5 z-10">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${progress}%`, ...techniqueProgressStyle(config.techniqueId) }}
        />
      </div>

      {/* Round indicator */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
        <span className="text-sm font-medium text-white/40 tracking-wide">
          Round {session ? session.currentRound + 1 : 1} of {config.rounds}
        </span>
      </div>

      {/* Phase text above orb */}
      <div className="relative z-10 mb-4">
        <PhaseIndicator phase={session?.currentPhase ?? null} />
      </div>

      {/* FluidOrb - centered and dominant */}
      <div className="relative w-72 h-72 sm:w-80 sm:h-80 md:w-96 md:h-96">
        <FluidOrb
          phase={session?.currentPhase ?? null}
          amplitude={amplitude}
          isActive={isActive && !isPaused}
          className="w-full h-full"
        />
      </div>

      {/* Timer below orb */}
      <div className="relative z-10 mt-4">
        <Timer seconds={session?.timeRemaining ?? 0} className="text-white" />
      </div>

      {/* Controls - fade to 20% opacity after 3s */}
      <div
        className={cn(
          'absolute bottom-28 md:bottom-12 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 transition-opacity duration-500',
          controlsVisible ? 'opacity-100' : 'opacity-20 hover:opacity-100'
        )}
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
                backgroundColor: `${DESTRUCTIVE}33`,
                borderColor: `${DESTRUCTIVE}33`,
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
