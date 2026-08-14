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
 * The breathing orb: a single soft sphere whose scale follows the breath
 * amplitude. Motion is the instruction (grow = inhale, shrink = exhale),
 * so under reduced motion it renders a static orb and the text cues carry
 * the session instead.
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
  const [core, halo] = colors
  const { target, frozen, duration } = getPhaseScaleTarget(
    phases,
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )

  const surface = (
    <div
      className="h-full w-full rounded-full"
      style={{
        background: `radial-gradient(circle at 34% 30%, ${halo} 0%, ${core} 62%, color-mix(in srgb, ${core} 82%, #10161366) 100%)`,
        boxShadow: `0 24px 80px -24px color-mix(in srgb, ${core} 55%, transparent), inset 0 1px 0 color-mix(in srgb, ${halo} 60%, transparent)`,
      }}
    />
  )

  if (reducedMotion) {
    return (
      <div aria-hidden="true" className="h-56 w-56 sm:h-64 sm:w-64" style={{ transform: 'scale(0.85)' }}>
        {surface}
      </div>
    )
  }

  const running = status === 'running'
  return (
    <motion.div
      aria-hidden="true"
      className="h-56 w-56 sm:h-64 sm:w-64"
      initial={false}
      animate={{ scale: running ? target : frozen }}
      transition={running
        ? { duration, ease: 'easeInOut' }
        : { duration: 0.3, ease: 'easeOut' }}
    >
      {surface}
    </motion.div>
  )
}
