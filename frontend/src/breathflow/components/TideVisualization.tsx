import { motion } from 'motion/react'
import type { EngineStatus } from '../engine/sessionEngine'
import type { ProtocolPhase } from '../protocols/types'
import { getPhaseScaleTarget } from './usePhaseScale'

interface TideVisualizationProps {
  phases: readonly ProtocolPhase[]
  phaseIndex: number
  phaseSeconds: number
  secondsLeftInPhase: number
  status: EngineStatus
  colors: [string, string]
}

/**
 * Hidden alternate visual: a tide line that rises and falls with the
 * breath. Reached by tapping the visualization five times within two
 * seconds; unavailable under reduced motion.
 */
export function TideVisualization({
  phases,
  phaseIndex,
  phaseSeconds,
  secondsLeftInPhase,
  status,
  colors,
}: TideVisualizationProps) {
  const [core] = colors
  const { target, frozen, duration } = getPhaseScaleTarget(
    phases,
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )
  const running = status === 'running'
  const level = running ? target : frozen
  // Map amplitude 0.62–1.1 onto a vertical fill of roughly 0.28–0.78.
  const fill = 0.28 + ((level - 0.62) / (1.1 - 0.62)) * 0.5

  return (
    <div aria-hidden="true" className="relative h-56 w-56 sm:h-64 sm:w-64">
      <div className="absolute inset-6 overflow-hidden border-x border-bw-border">
        <motion.div
          className="absolute inset-x-0 bottom-0 h-full origin-bottom"
          initial={false}
          animate={{ scaleY: fill }}
          transition={running
            ? { duration, ease: 'easeInOut' }
            : { duration: 0.3, ease: 'easeOut' }}
        >
          <div className="absolute inset-x-0 top-0 h-px" style={{ backgroundColor: core }} />
          <div className="absolute inset-0" style={{ backgroundColor: core, opacity: 0.28 }} />
        </motion.div>
      </div>
    </div>
  )
}
