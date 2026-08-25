/**
 * StatNumeral — the signature primitive of BreathFlow's interface design system.
 *
 * Every quantity in the app (counts, durations, streaks, XP, BPM) renders through
 * this component. The brass hairline beneath each numeral is the through-line that
 * makes the design recognizable. See .interface-design/system.md.
 */
import type { ReactNode } from 'react'
import { sx, type ClassValue } from '@/lib/utils'
import { statNumeral } from '@/styles/ui.stylex'

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
  className?: ClassValue
  /** Hide the brass rule (rare — only for inline contexts where the rule would clutter). */
  bare?: boolean
  /** Render label inline with the numeral instead of stacked above. */
  inline?: boolean
  ariaLabel?: string
}

const SIZE_NUMERAL: Record<StatSize, Parameters<typeof sx>[0]> = {
  sm: statNumeral.numeralSm,
  md: statNumeral.numeralMd,
  lg: statNumeral.numeralLg,
}

const SIZE_UNIT: Record<StatSize, Parameters<typeof sx>[0]> = {
  sm: statNumeral.unitSm,
  md: statNumeral.unitMd,
  lg: statNumeral.unitLg,
}

const TONE_COLOR: Record<StatTone, Parameters<typeof sx>[0]> = {
  default: statNumeral.toneDefault,
  sage: statNumeral.toneSage,
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
  const numeralProps = sx(
    statNumeral.numeralBase,
    SIZE_NUMERAL[size],
    TONE_COLOR[tone],
    !bare && statNumeral.numeralBorder,
    !bare && statNumeral.borderAccent,
  )

  const unitProps = sx(statNumeral.unitBase, SIZE_UNIT[size])

  const labelProps = sx(
    statNumeral.label,
    align === 'end' && statNumeral.labelEnd,
  )

  const row = (
    <span
      {...sx(
        statNumeral.row,
        align === 'end' ? statNumeral.rowEnd : statNumeral.rowStart,
      )}
    >
      <span {...numeralProps} aria-label={ariaLabel}>
        {value}
      </span>
      {unit ? <span {...unitProps}>{unit}</span> : null}
    </span>
  )

  if (inline) {
    return (
      <span {...sx(statNumeral.inlineWrap, className)}>
        {label ? <span {...sx(labelProps, statNumeral.labelInline)}>{label}</span> : null}
        {row}
      </span>
    )
  }

  return (
    <div {...sx(align === 'end' && statNumeral.blockEnd, className)}>
      {label ? <span {...labelProps}>{label}</span> : null}
      <span {...sx(label ? statNumeral.rowBlockSpaced : statNumeral.rowBlock)}>
        {row}
      </span>
    </div>
  )
}
