import { motion } from 'motion/react'
import type { EngineStatus } from '../engine/sessionEngine'
import { boxPoint } from '../motion/geometry'
import { chromeTransition, EASE_SETTLE } from '../motion/tokens'
import { useLockedPhaseDuration } from '../motion/useLockedPhaseDuration'

interface BoxVisualizationProps {
  /** 0-based index into Box Breathing's four phases (in, hold, out, hold). */
  phaseIndex: number
  phaseSeconds: number
  secondsLeftInPhase: number
  /** Resets the trace at the start of each round. */
  roundIndex: number
  status: EngineStatus
  accentColor: string
  reducedMotion: boolean
}

const SIZE = 240
const INSET = 10

/**
 * Box Breathing traces the four sides of a square in phase: up the left on
 * the inhale, across the top on the hold, down the right on the exhale,
 * back along the bottom on the empty hold.
 */
export function BoxVisualization({
  phaseIndex,
  phaseSeconds,
  secondsLeftInPhase,
  roundIndex,
  status,
  accentColor,
  reducedMotion,
}: BoxVisualizationProps) {
  const d = `M ${INSET} ${SIZE - INSET} L ${INSET} ${INSET} L ${SIZE - INSET} ${INSET} L ${SIZE - INSET} ${SIZE - INSET} Z`

  const progressInPhase = phaseSeconds > 0
    ? Math.min(1, Math.max(0, (phaseSeconds - secondsLeftInPhase) / phaseSeconds))
    : 1
  const traced = Math.min(4, phaseIndex + progressInPhase)
  const targetTraced = Math.min(4, phaseIndex + 1)
  const running = status === 'running'
  const lockedDuration = useLockedPhaseDuration(
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )
  const duration = running ? lockedDuration : chromeTransition.duration
  const ease = running ? 'linear' : EASE_SETTLE
  const cursor = boxPoint(running ? targetTraced : traced)

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-56 w-56 sm:h-64 sm:w-64"
    >
      <path
        d={d}
        pathLength={4}
        fill="none"
        stroke="var(--bw-border)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {reducedMotion ? (
        <>
          <path
            d={d}
            pathLength={4}
            fill="none"
            stroke={accentColor}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1 3"
            strokeDashoffset={-phaseIndex}
          />
          <circle cx={boxPoint(traced).x} cy={boxPoint(traced).y} r={3.5} fill={accentColor} />
        </>
      ) : (
        <>
          <motion.path
            key={roundIndex}
            d={d}
            pathLength={4}
            fill="none"
            stroke={accentColor}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 4"
            initial={{ strokeDashoffset: 4 - traced }}
            animate={{ strokeDashoffset: running ? 4 - targetTraced : 4 - traced }}
            transition={{ duration, ease }}
          />
          <motion.circle
            r={3.5}
            fill={accentColor}
            initial={false}
            animate={{ cx: cursor.x, cy: cursor.y }}
            transition={{ duration, ease }}
          />
        </>
      )}
    </svg>
  )
}
