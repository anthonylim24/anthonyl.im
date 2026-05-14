/**
 * StatNumeral — the signature primitive of BreathFlow's interface design system.
 *
 * Every quantity in the app (counts, durations, streaks, XP, BPM) renders through
 * this component. The brass hairline beneath each numeral is the through-line that
 * makes the design recognizable. See .interface-design/system.md.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type StatSize = 'sm' | 'md' | 'lg'
type StatTone = 'default' | 'sage'
type StatAlign = 'start' | 'end'

interface StatNumeralProps {
  label?: ReactNode
  value: ReactNode
  unit?: ReactNode
  size?: StatSize
  tone?: StatTone
  align?: StatAlign
  className?: string
  /** Hide the brass rule (rare — only for inline contexts where the rule would clutter). */
  bare?: boolean
  /** Render label inline with the numeral instead of stacked above. */
  inline?: boolean
  ariaLabel?: string
}

const SIZE_NUMERAL: Record<StatSize, string> = {
  sm: 'text-sm pb-0.5',
  md: 'text-2xl pb-1',
  lg: 'text-4xl md:text-5xl pb-1.5',
}

const SIZE_UNIT: Record<StatSize, string> = {
  sm: 'text-[10px]',
  md: 'text-[10px]',
  lg: 'text-xs',
}

const TONE_COLOR: Record<StatTone, string> = {
  default: 'text-bw',
  sage: 'text-bw-success',
}

export function StatNumeral({
  label,
  value,
  unit,
  size = 'md',
  tone = 'default',
  align = 'start',
  className,
  bare = false,
  inline = false,
  ariaLabel,
}: StatNumeralProps) {
  const numeralClasses = cn(
    'inline-block font-mono font-normal tabular-nums leading-none',
    SIZE_NUMERAL[size],
    TONE_COLOR[tone],
    !bare && 'border-b border-bw-accent',
  )

  const unitClasses = cn(
    'font-medium uppercase tracking-[0.07em] text-bw-tertiary',
    SIZE_UNIT[size],
  )

  const labelClasses = cn(
    'block text-[10px] font-medium uppercase tracking-[0.07em] text-bw-secondary',
    align === 'end' && 'text-right',
  )

  const row = (
    <span
      className={cn(
        'flex items-baseline gap-2',
        align === 'end' ? 'justify-end' : 'justify-start',
      )}
    >
      <span className={numeralClasses} aria-label={ariaLabel}>
        {value}
      </span>
      {unit ? <span className={unitClasses}>{unit}</span> : null}
    </span>
  )

  if (inline) {
    return (
      <span className={cn('inline-flex items-baseline gap-3', className)}>
        {label ? <span className={cn(labelClasses, 'inline-block')}>{label}</span> : null}
        {row}
      </span>
    )
  }

  return (
    <div className={cn(align === 'end' && 'text-right', className)}>
      {label ? <span className={labelClasses}>{label}</span> : null}
      <span className={cn('block', label && 'mt-1.5')}>{row}</span>
    </div>
  )
}
