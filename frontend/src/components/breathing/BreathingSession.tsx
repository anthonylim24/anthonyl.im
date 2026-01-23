import { useCallback, useState, useMemo } from 'react'
import { useBreathingCycle } from '@/hooks/useBreathingCycle'
import { WaveformVisualizer } from './WaveformVisualizer'
import { PhaseIndicator } from './PhaseIndicator'
import { Timer } from './Timer'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Play, Pause, Square, RotateCcw, Trophy, Clock, Target } from 'lucide-react'
import type { SessionConfig } from '@/lib/breathingProtocols'
import { getProtocol } from '@/lib/breathingProtocols'
import { formatTime, cn } from '@/lib/utils'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'

const techniqueConfig: Record<TechniqueId, {
  gradient: string
  glow: string
}> = {
  [TECHNIQUE_IDS.BOX_BREATHING]: {
    gradient: 'from-blue-500 to-indigo-600',
    glow: 'shadow-blue-500/30',
  },
  [TECHNIQUE_IDS.CO2_TOLERANCE]: {
    gradient: 'from-orange-500 to-rose-600',
    glow: 'shadow-orange-500/30',
  },
  [TECHNIQUE_IDS.POWER_BREATHING]: {
    gradient: 'from-emerald-500 to-teal-600',
    glow: 'shadow-emerald-500/30',
  },
}

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

  const handleSessionComplete = useCallback(() => {
    setShowSummary(true)
  }, [])

  const { session, start, pause, stop, isActive, isPaused, isComplete } =
    useBreathingCycle({
      onSessionComplete: handleSessionComplete,
      enableAudio: true,
    })

  const protocol = getProtocol(config.techniqueId)
  const tc = techniqueConfig[config.techniqueId]

  const handleStart = () => {
    start(config)
  }

  const handlePause = () => {
    pause()
  }

  const handleStop = () => {
    stop()
    onCancel?.()
  }

  const handleRestart = () => {
    stop()
    start(config)
  }

  const handleCloseSummary = () => {
    setShowSummary(false)
    stop()
    onComplete?.()
  }

  const progress = session
    ? ((session.currentRound * protocol.phases.length + session.currentPhaseIndex) /
        (config.rounds * protocol.phases.length)) *
      100
    : 0

  const currentPhaseDuration = useMemo(() => {
    if (!session) return 0
    return protocol.phases[session.currentPhaseIndex]?.duration ?? 0
  }, [session, protocol.phases])

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-2xl mx-auto">
      {/* Round Progress */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">
            Round {session ? session.currentRound + 1 : 1} of {config.rounds}
          </span>
          <span className="text-sm font-medium text-muted-foreground">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full bg-gradient-to-r transition-all duration-500 rounded-full",
              tc.gradient
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase & Timer - Above waveform for prominence */}
      <div className="text-center space-y-3">
        <PhaseIndicator phase={session?.currentPhase ?? null} />
        <Timer seconds={session?.timeRemaining ?? 0} />
      </div>

      {/* Waveform Visualization */}
      <div className="w-full aspect-[4/3] max-h-72">
        <WaveformVisualizer
          phase={session?.currentPhase ?? null}
          phaseDuration={currentPhaseDuration}
          timeRemaining={session?.timeRemaining ?? 0}
          isActive={isActive && !isPaused}
          className="h-full"
        />
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4">
        {!isActive && !isComplete ? (
          <Button
            onClick={handleStart}
            variant="ghost"
            size="xl"
            className={cn(
              "gap-3 bg-gradient-to-r text-white min-w-[200px] shadow-xl hover:opacity-90",
              tc.gradient,
              tc.glow
            )}
          >
            <Play className="h-5 w-5" />
            Start
          </Button>
        ) : (
          <>
            <Button
              onClick={handlePause}
              variant="outline"
              size="lg"
              className="gap-2 rounded-xl"
            >
              {isPaused ? (
                <>
                  <Play className="h-5 w-5" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-5 w-5" />
                  Pause
                </>
              )}
            </Button>
            <Button
              onClick={handleRestart}
              variant="outline"
              size="lg"
              className="gap-2 rounded-xl"
            >
              <RotateCcw className="h-5 w-5" />
              Restart
            </Button>
            <Button
              onClick={handleStop}
              variant="destructive"
              size="lg"
              className="gap-2 rounded-xl"
            >
              <Square className="h-5 w-5" />
              Stop
            </Button>
          </>
        )}
      </div>

      {/* Session Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="glass-strong border-0">
          <DialogHeader className="text-center pb-2">
            <div className="mx-auto mb-4">
              <div className={cn(
                "h-16 w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-xl",
                tc.gradient,
                tc.glow
              )}>
                <Trophy className="h-8 w-8 text-white" />
              </div>
            </div>
            <DialogTitle className="text-2xl">Session Complete!</DialogTitle>
            <DialogDescription>
              Great job completing your {protocol.name} session.
            </DialogDescription>
          </DialogHeader>

          {session && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-muted/50 border-0">
                  <CardContent className="pt-6 text-center">
                    <Target className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <div className="text-3xl font-bold">{config.rounds}</div>
                    <div className="text-sm text-muted-foreground">Rounds</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50 border-0">
                  <CardContent className="pt-6 text-center">
                    <Clock className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <div className="text-3xl font-bold">
                      {formatTime(
                        Math.round(
                          (new Date().getTime() - session.startTime.getTime()) / 1000
                        )
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                  </CardContent>
                </Card>
              </div>

              {session.holdTimes.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-center">Hold Performance</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-gradient-to-br from-yellow-400/10 to-orange-500/10 border-0">
                      <CardContent className="pt-6 text-center">
                        <div className="text-4xl font-bold text-yellow-500">
                          {Math.max(...session.holdTimes)}s
                        </div>
                        <div className="text-sm text-muted-foreground">Best Hold</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-muted/50 border-0">
                      <CardContent className="pt-6 text-center">
                        <div className="text-4xl font-bold">
                          {Math.round(
                            session.holdTimes.reduce((a, b) => a + b, 0) /
                              session.holdTimes.length
                          )}s
                        </div>
                        <div className="text-sm text-muted-foreground">Average</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={handleCloseSummary}
              variant="ghost"
              className={cn(
                "w-full bg-gradient-to-r text-white shadow-lg hover:opacity-90",
                tc.gradient,
                tc.glow
              )}
              size="lg"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
