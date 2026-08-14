import { motion } from 'motion/react'
import type { EngineStatus } from '../engine/sessionEngine'
import type { ProtocolPhase } from '../protocols/types'
import { getPhaseScaleTarget } from './usePhaseScale'

interface PebbleVisualizationProps {
  phases: readonly ProtocolPhase[]
  phaseIndex: number
  phaseSeconds: number
  secondsLeftInPhase: number
  status: EngineStatus
  colors: [string, string]
}

/**
 * The hidden alternate visual: a small breathing companion that puffs up
 * and settles with the phases. Reached by tapping the visualization five
 * times within two seconds; unavailable under reduced motion (the easter
 * egg is motion, so it is simply disabled there).
 */
export function PebbleVisualization({
  phases,
  phaseIndex,
  phaseSeconds,
  secondsLeftInPhase,
  status,
  colors,
}: PebbleVisualizationProps) {
  const [core, halo] = colors
  const { target, frozen, duration } = getPhaseScaleTarget(
    phases,
    phaseIndex,
    phaseSeconds,
    secondsLeftInPhase,
    status,
  )
  const running = status === 'running'
  const cheeksPuffed = target >= 1

  return (
    <motion.div
      aria-hidden="true"
      className="flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64"
      initial={false}
      animate={{ scale: running ? target : frozen, rotate: running ? [-2, 2] : 0 }}
      transition={{
        scale: running ? { duration, ease: 'easeInOut' } : { duration: 0.3 },
        rotate: running
          ? { duration: 2.4, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
          : { duration: 0.3 },
      }}
    >
      <div
        className="relative h-44 w-48 sm:h-48 sm:w-52"
        style={{
          borderRadius: '48% 52% 55% 45% / 60% 58% 42% 40%',
          background: `radial-gradient(circle at 35% 28%, ${halo} 0%, ${core} 70%)`,
          boxShadow: `0 20px 60px -20px color-mix(in srgb, ${core} 60%, transparent)`,
        }}
      >
        {/* Eyes */}
        <div className="absolute left-[30%] top-[38%] h-3.5 w-3.5 rounded-full bg-bw-canvas" />
        <div className="absolute right-[30%] top-[38%] h-3.5 w-3.5 rounded-full bg-bw-canvas" />
        {/* Mouth: rounder when full of air */}
        <div
          className="absolute left-1/2 top-[58%] -translate-x-1/2 bg-bw-canvas transition-all duration-500"
          style={cheeksPuffed
            ? { width: 14, height: 14, borderRadius: '9999px' }
            : { width: 22, height: 5, borderRadius: '9999px' }}
        />
      </div>
    </motion.div>
  )
}
