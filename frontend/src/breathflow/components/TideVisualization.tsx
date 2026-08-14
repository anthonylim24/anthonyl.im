import { motion } from 'motion/react'
import type { EngineStatus } from '../engine/sessionEngine'
import { buildTideCrest, buildTidePath } from '../motion/geometry'
import { breathEase, chromeTransition, EASE_SETTLE } from '../motion/tokens'
import { useLockedPhaseDuration } from '../motion/useLockedPhaseDuration'
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
  const { phase, target, frozen } = getPhaseScaleTarget(
    phases,
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )
  const lockedDuration = useLockedPhaseDuration(
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )
  const running = status === 'running'
  const level = running ? target : frozen
  const fill = 0.28 + ((level - 0.62) / 0.48) * 0.5
  const duration = running ? lockedDuration : chromeTransition.duration
  const ease = running ? breathEase(phase) : EASE_SETTLE
  const tide = buildTidePath(fill)
  const crest = buildTideCrest(fill)

  return (
    <div aria-hidden="true" className="relative h-56 w-56 sm:h-64 sm:w-64">
      <div className="absolute inset-6 overflow-hidden border-x border-bw-border">
        <svg viewBox="0 0 240 240" preserveAspectRatio="none" className="h-full w-full">
          <motion.path
            d={tide}
            fill={core}
            fillOpacity={0.28}
            initial={false}
            animate={{ d: tide }}
            transition={{ duration, ease }}
          />
          <motion.path
            d={crest}
            fill="none"
            stroke={core}
            strokeWidth={1.25}
            strokeLinecap="round"
            initial={false}
            animate={{ d: crest }}
            transition={{ duration, ease }}
          />
        </svg>
      </div>
    </div>
  )
}
