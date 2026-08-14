import { useMemo, useRef } from 'react'
import { motion } from 'motion/react'
import { useSettingsStore } from '@/stores/settingsStore'
import { breathEase, chromeTransition, EASE_SETTLE, scaleToAmplitude } from '../motion/tokens'
import { useLockedPhaseDuration } from '../motion/useLockedPhaseDuration'
import type { EngineStatus } from '../engine/sessionEngine'
import type { ProtocolPhase } from '../protocols/types'
import { OrbParticleField } from './OrbParticleField'
import { useGlassOrb } from './useGlassOrb'
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

function hexToVec3(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '')
  if (raw.length !== 6) return [0.18, 0.38, 0.32]
  return [
    Number.parseInt(raw.slice(0, 2), 16) / 255,
    Number.parseInt(raw.slice(2, 4), 16) / 255,
    Number.parseInt(raw.slice(4, 6), 16) / 255,
  ]
}

function RingsInstrument({
  core,
  scale,
  duration,
  ease,
  reducedMotion,
}: {
  core: string
  scale: number
  duration: number
  ease: readonly [number, number, number, number]
  reducedMotion: boolean
}) {
  return (
    <div className="relative h-full w-full">
      <svg aria-hidden="true" viewBox="0 0 240 240" className="absolute inset-0 h-full w-full" data-testid="orb-rings">
        <circle cx="120" cy="120" r="110" fill="none" stroke="var(--bw-border)" strokeWidth="1" />
      </svg>
      {reducedMotion ? (
        <svg aria-hidden="true" viewBox="0 0 240 240" className="absolute inset-0 h-full w-full">
          <circle cx="120" cy="120" r="78" fill="none" stroke={core} strokeWidth="1.25" opacity="0.55" />
          <circle cx="120" cy="120" r="48" fill="none" stroke={core} strokeWidth="1.25" />
          <circle cx="120" cy="120" r="14" fill={core} />
        </svg>
      ) : (
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ scale }}
          transition={{ duration, ease }}
        >
          <svg aria-hidden="true" viewBox="0 0 240 240" className="h-full w-full">
            <circle cx="120" cy="120" r="78" fill="none" stroke={core} strokeWidth="1.25" opacity="0.55" />
            <circle cx="120" cy="120" r="48" fill="none" stroke={core} strokeWidth="1.25" />
            <circle cx="120" cy="120" r="14" fill={core} />
          </svg>
        </motion.div>
      )}
    </div>
  )
}

/**
 * Breath instrument: a spacey glass marble whose CSS scale follows breath
 * amplitude. Grow is inhale, shrink is exhale. Under reduced motion or
 * when WebGL is unavailable the hairline rings stay put and the text
 * cues carry the session.
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
  const scale = reducedMotion ? 0.85 : (running ? target : frozen)
  const duration = running ? lockedDuration : chromeTransition.duration
  const ease = running ? breathEase(phase) : EASE_SETTLE
  const amplitudeRef = useRef(scaleToAmplitude(scale))
  const theme = useSettingsStore((state) => state.theme)
  const color1 = useMemo(() => hexToVec3(core), [core])
  const color2 = useMemo(() => hexToVec3(halo), [halo])
  const glFailed = useGlassOrb({
    canvasRef,
    amplitudeRef,
    color1,
    color2,
    reducedMotion,
    dark: theme === 'dark',
  })

  const glass = !reducedMotion && !glFailed
  const instrument = glass ? (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-testid="glass-orb-canvas"
        className="absolute inset-0 h-full w-full"
      />
      <OrbParticleField colors={colors} amplitudeRef={amplitudeRef} />
    </div>
  ) : (
    <RingsInstrument
      core={core}
      scale={scale}
      duration={duration}
      ease={ease}
      reducedMotion={reducedMotion}
    />
  )

  if (reducedMotion) {
    return (
      <div aria-hidden="true" className="h-56 w-56 sm:h-64 sm:w-64" style={{ transform: 'scale(0.85)' }}>
        {instrument}
      </div>
    )
  }

  if (!glass) {
    return (
      <div aria-hidden="true" className="relative h-56 w-56 sm:h-64 sm:w-64">
        {instrument}
      </div>
    )
  }

  return (
    <motion.div
      aria-hidden="true"
      className="bf-glass-orb relative h-56 w-56 sm:h-64 sm:w-64"
      initial={false}
      animate={{ scale }}
      transition={{ duration, ease }}
      onUpdate={(latest) => {
        const next = typeof latest.scale === 'number' ? latest.scale : scale
        amplitudeRef.current = scaleToAmplitude(next)
      }}
    >
      {instrument}
    </motion.div>
  )
}
