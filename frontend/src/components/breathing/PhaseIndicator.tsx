import type { BreathPhase } from '@/lib/constants'
import { PHASE_LABELS, BREATH_PHASES } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface PhaseIndicatorProps {
  phase: BreathPhase | null
  className?: string
}

export function PhaseIndicator({ phase, className }: PhaseIndicatorProps) {
  const label = phase ? PHASE_LABELS[phase] : 'Ready'

  const phaseStyles: Record<BreathPhase, { text: string; bg: string }> = {
    [BREATH_PHASES.INHALE]: {
      text: 'text-blue-400 dark:text-blue-300',
      bg: 'bg-blue-500/10',
    },
    [BREATH_PHASES.HOLD_IN]: {
      text: 'text-purple-400 dark:text-purple-300',
      bg: 'bg-purple-500/10',
    },
    [BREATH_PHASES.EXHALE]: {
      text: 'text-teal-400 dark:text-teal-300',
      bg: 'bg-teal-500/10',
    },
    [BREATH_PHASES.HOLD_OUT]: {
      text: 'text-amber-400 dark:text-amber-300',
      bg: 'bg-amber-500/10',
    },
    [BREATH_PHASES.REST]: {
      text: 'text-gray-400 dark:text-gray-300',
      bg: 'bg-gray-500/10',
    },
  }

  const currentStyle = phase ? phaseStyles[phase] : null

  return (
    <div className={cn('text-center', className)}>
      {/* Phase label badge */}
      {phase && (
        <div className={cn(
          'inline-flex items-center px-4 py-1.5 rounded-full mb-3 transition-all duration-300',
          currentStyle?.bg,
          'border border-current/20'
        )}>
          <span className={cn('text-sm font-medium uppercase tracking-wider', currentStyle?.text)}>
            {phase.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Main text */}
      <h2
        className={cn(
          'text-4xl md:text-5xl font-bold tracking-wide transition-all duration-500',
          phase ? currentStyle?.text : 'text-muted-foreground'
        )}
        style={{
          textShadow: phase ? '0 0 60px currentColor, 0 0 30px currentColor' : 'none',
        }}
      >
        {label}
      </h2>
    </div>
  )
}
