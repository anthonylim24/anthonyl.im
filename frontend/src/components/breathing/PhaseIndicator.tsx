import type { BreathPhase, TechniqueId } from '@/lib/constants'
import { PHASE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface PhaseIndicatorProps {
  phase: BreathPhase | null
  techniqueId?: TechniqueId
  className?: string
}

export function PhaseIndicator({ phase, className }: PhaseIndicatorProps) {
  const label = phase ? PHASE_LABELS[phase] : 'Ready'

  return (
    <div
      className={cn('text-center', className)}
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
      {/* Phase label badge */}
      {phase && (
        <div
          className="inline-flex items-center px-4 py-1.5 rounded-full mb-3 transition-all duration-300 border"
          style={{
            backgroundColor: 'var(--bw-hover)',
            borderColor: 'var(--bw-border)',
          }}
        >
          <span className="text-sm font-medium uppercase tracking-wider text-bw-secondary">
            {phase.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Main text */}
      <h2
        className={cn(
          'font-display font-light text-4xl md:text-5xl tracking-wide transition-all duration-500 text-bw',
          !phase && 'text-bw-tertiary'
        )}
      >
        {label}
      </h2>
    </div>
  )
}
