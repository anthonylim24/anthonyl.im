import type { BreathPhase } from '@/lib/constants'
import { PHASE_LABELS, BREATH_PHASES } from '@/lib/constants'
import { PHASE, withAlpha } from '@/lib/palette'
import { cn } from '@/lib/utils'

interface PhaseIndicatorProps {
  phase: BreathPhase | null
  className?: string
}

const PHASE_COLOR_MAP: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]: PHASE.inhale,
  [BREATH_PHASES.DEEP_INHALE]: PHASE.deep_inhale,
  [BREATH_PHASES.HOLD_IN]: PHASE.hold_in,
  [BREATH_PHASES.EXHALE]: PHASE.exhale,
  [BREATH_PHASES.HOLD_OUT]: PHASE.hold_out,
  [BREATH_PHASES.REST]: PHASE.rest,
}

export function PhaseIndicator({ phase, className }: PhaseIndicatorProps) {
  const label = phase ? PHASE_LABELS[phase] : 'Ready'
  const color = phase ? PHASE_COLOR_MAP[phase] : undefined

  return (
    <div className={cn('text-center', className)} aria-live="assertive" aria-atomic="true">
      {/* Phase label badge */}
      {phase && color && (
        <div
          className="inline-flex items-center px-4 py-1.5 rounded-full mb-3 transition-all duration-300 border"
          style={{ backgroundColor: withAlpha(color, 0.1), borderColor: withAlpha(color, 0.2) }}
        >
          <span
            className="text-sm font-medium uppercase tracking-wider"
            style={{ color }}
          >
            {phase.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Main text */}
      <h2
        className={cn(
          'text-4xl md:text-5xl font-bold tracking-wide transition-all duration-500',
          !phase && 'text-muted-foreground'
        )}
        style={{
          color: color ?? undefined,
          textShadow: phase ? `0 0 60px ${color}, 0 0 30px ${color}` : 'none',
        }}
      >
        {label}
      </h2>
    </div>
  )
}
