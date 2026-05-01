import { PHASE_LABELS } from '@/lib/constants'
import type { BreathingProtocol } from '@/lib/breathingProtocols'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { getTechniquePhaseColors } from '@/lib/techniqueConfig'
import { withAlpha } from '@/lib/palette'
import { cn } from '@/lib/utils'

interface BreathPatternStripProps {
  protocol: Pick<
    BreathingProtocol,
    'id' | 'phases' | 'progressiveHold' | 'holdIncrement'
  >
  className?: string
  compact?: boolean
  animated?: boolean
}

function buildPatternLabel(protocol: BreathPatternStripProps['protocol']) {
  const phaseText = protocol.phases
    .map((phase) => `${PHASE_LABELS[phase.phase]} ${phase.duration} seconds`)
    .join(', ')
  const progressiveText = protocol.progressiveHold && protocol.holdIncrement
    ? ` Hold increases by ${protocol.holdIncrement} seconds each round.`
    : ''

  return `Breath pattern: ${phaseText}.${progressiveText}`
}

export function BreathPatternStrip({
  protocol,
  className,
  compact = false,
  animated = false,
}: BreathPatternStripProps) {
  const totalDuration = protocol.phases.reduce((sum, phase) => sum + phase.duration, 0)
  const phaseColors = getTechniquePhaseColors(protocol.id)
  const reducedMotion = useReducedMotion()
  const showCadenceCursor = animated && !reducedMotion && totalDuration > 0

  return (
    <div
      role="img"
      aria-label={buildPatternLabel(protocol)}
      className={cn('w-full', className)}
      data-testid="breath-pattern-strip"
    >
      <div
        className={cn(
          'relative flex min-h-3 overflow-hidden border border-bw-border bg-bw-active',
          compact ? 'h-3' : 'h-4'
        )}
      >
        {protocol.phases.map((phase, index) => {
          const color = phaseColors[phase.phase]
          return (
            <div
              key={`${phase.phase}-${index}`}
              data-testid="breath-pattern-segment"
              className="relative min-w-3 border-r border-[rgba(255,254,250,0.32)] last:border-r-0"
              style={{
                flexGrow: phase.duration,
                flexBasis: totalDuration > 0 ? `${(phase.duration / totalDuration) * 100}%` : 0,
                backgroundColor: color,
              }}
            >
              <span
                className="absolute inset-y-0 left-0 w-px"
                aria-hidden="true"
                style={{ backgroundColor: withAlpha(color, 0.45) }}
              />
            </div>
          )
        })}
        {showCadenceCursor ? (
          <div
            aria-hidden="true"
            className="breath-pattern-cursor absolute inset-y-0 left-0 z-10 w-full"
            data-testid="breath-pattern-cursor"
            style={{ animationDuration: `${totalDuration}s` }}
          >
            <span
              className="absolute inset-y-0 left-0 w-px bg-bw-surface"
              style={{ boxShadow: '0 0 0 1px var(--bw-accent-subtle)' }}
            />
          </div>
        ) : null}
      </div>

      {!compact ? (
        <div className="mt-2 grid gap-1 text-[10px] font-medium uppercase tracking-[0.07em] text-bw-tertiary sm:flex sm:flex-wrap sm:gap-x-3">
          {protocol.phases.map((phase, index) => (
            <span key={`${phase.phase}-${index}`} className="font-mono normal-case tracking-normal">
              {PHASE_LABELS[phase.phase]} {phase.duration}s
            </span>
          ))}
          {protocol.progressiveHold && protocol.holdIncrement ? (
            <span className="font-mono normal-case tracking-normal text-bw-secondary">
              +{protocol.holdIncrement}s hold each round
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
