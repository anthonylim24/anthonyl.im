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
        <div className="mb-3">
          <span className="text-[10px] font-mono font-medium uppercase tracking-[0.07em] text-bw-secondary">
            {phase.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Main text */}
      <h2
        className={cn(
          'font-mono text-xl font-normal tracking-wide transition-all duration-500 text-bw',
          !phase && 'text-bw-tertiary'
        )}
      >
        {label}
      </h2>
    </div>
  )
}
