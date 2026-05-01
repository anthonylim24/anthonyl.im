import { ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreathworkSafetyDisclosureProps {
  compact?: boolean
  className?: string
}

export function BreathworkSafetyDisclosure({
  compact = false,
  className,
}: BreathworkSafetyDisclosureProps) {
  return (
    <section
      role="note"
      aria-label="BreathFlow safety disclosure"
      className={cn(
        'border-y border-bw-border',
        compact ? 'py-3' : 'py-5',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-bw-border text-bw-accent">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary">
            Safety
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-bw-tertiary">
            BreathFlow is wellness education, not medical care. Practice in a safe position,
            stop if you feel dizzy, faint, panicked, or have chest pain, and seek medical
            care for severe or persistent symptoms.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-bw-secondary">
            Consult a clinician before breath holds or forceful breathing if you are pregnant
            or have cardiovascular, respiratory, neurological, or fainting concerns.
          </p>
        </div>
      </div>
    </section>
  )
}
