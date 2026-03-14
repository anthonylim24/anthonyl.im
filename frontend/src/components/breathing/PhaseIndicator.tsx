import type { BreathPhase, TechniqueId } from '@/lib/constants'
import { PHASE_LABELS, BREATH_PHASES } from '@/lib/constants'
import { PHASE, TECHNIQUE_PHASES } from '@/lib/palette'
import { cn } from '@/lib/utils'

interface PhaseIndicatorProps {
  phase: BreathPhase | null
  techniqueId?: TechniqueId
  className?: string
}

const DEFAULT_PHASE_COLORS: Record<BreathPhase, string> = {
  [BREATH_PHASES.INHALE]: PHASE.inhale,
  [BREATH_PHASES.DEEP_INHALE]: PHASE.deep_inhale,
  [BREATH_PHASES.HOLD_IN]: PHASE.hold_in,
  [BREATH_PHASES.EXHALE]: PHASE.exhale,
  [BREATH_PHASES.HOLD_OUT]: PHASE.hold_out,
  [BREATH_PHASES.REST]: PHASE.rest,
}

export function PhaseIndicator({ phase, techniqueId, className }: PhaseIndicatorProps) {
  const label = phase ? PHASE_LABELS[phase] : 'Ready'
  const colorMap = techniqueId ? TECHNIQUE_PHASES[techniqueId] : DEFAULT_PHASE_COLORS
  const color = phase ? colorMap[phase] : undefined

  return (
    <div
      className={cn('text-center', className)}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Phase label badge */}
      {phase && color && (
        <div
          className="inline-flex items-center px-4 py-1.5 rounded-full mb-3 transition-all duration-300 border"
          style={{
            backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${color} 20%, transparent)`,
          }}
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
        }}
      >
        {label}
      </h2>
    </div>
  )
}
