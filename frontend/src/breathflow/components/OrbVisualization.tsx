import { motion } from 'motion/react'
import type { EngineStatus } from '../engine/sessionEngine'
import type { ProtocolPhase } from '../protocols/types'
import { getPhaseScaleTarget } from './usePhaseScale'

interface OrbVisualizationProps {
  phases: readonly ProtocolPhase[]
  phaseIndex: number
  phaseSeconds: number
  secondsLeftInPhase: number
  status: EngineStatus
  /** [core, halo] colors from the selected orb theme. */
  colors: [string, string]
  reducedMotion: boolean
}

/**
 * Breath instrument: three hairline rings around a core whose scale
 * follows breath amplitude. Grow is inhale, shrink is exhale. Under
 * reduced motion the rings stay put and the text cues carry the session.
 */
export function OrbVisualization({
  phases,
  phaseIndex,
  phaseSeconds,
  secondsLeftInPhase,
  status,
  colors,
  reducedMotion,
}: OrbVisualizationProps) {
  const [core] = colors
  const { target, frozen, duration } = getPhaseScaleTarget(
    phases,
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )
  const running = status === 'running'
  const scale = reducedMotion ? 0.85 : (running ? target : frozen)

  const instrument = (
    <svg aria-hidden="true" viewBox="0 0 240 240" className="h-full w-full">
      <circle cx="120" cy="120" r="108" fill="none" stroke="var(--bw-border)" strokeWidth="1" />
      <circle cx="120" cy="120" r="78" fill="none" stroke={core} strokeWidth="1.25" opacity="0.55" />
      <circle cx="120" cy="120" r="48" fill="none" stroke={core} strokeWidth="1.25" />
      <circle cx="120" cy="120" r="14" fill={core} />
    </svg>
  )

  if (reducedMotion) {
    return (
      <div aria-hidden="true" className="h-56 w-56 sm:h-64 sm:w-64" style={{ transform: 'scale(0.85)' }}>
        {instrument}
      </div>
    )
  }

  return (
    <motion.div
      aria-hidden="true"
      className="h-56 w-56 sm:h-64 sm:w-64"
      initial={false}
      animate={{ scale }}
      transition={running
        ? { duration, ease: 'easeInOut' }
        : { duration: 0.3, ease: 'easeOut' }}
    >
      {instrument}
    </motion.div>
  )
}
