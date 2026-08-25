import { useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { sx } from '@/lib/utils'
import { layout } from '@/styles/common.stylex'
import { styles } from '../trips.stylex'

const SEP = new Set([':', ' ', '·', '.', ',', '/', '–', '-'])

function glyphKind(glyph: string): 'sep' | 'digit' | 'letter' {
  if (SEP.has(glyph)) return 'sep'
  if (glyph >= '0' && glyph <= '9') return 'digit'
  return 'letter'
}

function FlipGlyph({ glyph, animate }: { glyph: string; animate: boolean }) {
  return (
    <span {...sx('trips-flip-cell', `trips-flip-${glyphKind(glyph)}`)} aria-hidden>
      <span key={glyph} {...sx(animate ? 'trips-flip-glyph' : undefined)}>
        {glyph === ' ' ? '\u00a0' : glyph}
      </span>
    </span>
  )
}

/** Split-flap station clock. Reduced motion swaps the string instantly. */
export function FlipTime({
  value,
  className,
  label,
  playOnMount = false,
}: {
  value: string
  className?: Parameters<typeof sx>[0]
  label?: string
  playOnMount?: boolean
}) {
  const reduce = useReducedMotion()
  const stored = useRef<string | null>(null)
  const prior = stored.current === null ? (playOnMount ? '' : value) : stored.current
  useLayoutEffect(() => {
    stored.current = value
  }, [value])

  const glyphs = Array.from(value)

  if (reduce) {
    return (
      <span {...sx(styles.flipReduced, className)} aria-label={label ?? value}>
        {value}
      </span>
    )
  }

  return (
    <span {...sx('trips-flip', styles.flipRoot, className)} aria-label={label ?? value}>
      <span {...sx(layout.srOnly)}>{value}</span>
      {glyphs.map((glyph, index) => (
        <FlipGlyph key={`${index}:${glyphKind(glyph)}`} glyph={glyph} animate={prior[index] !== glyph} />
      ))}
    </span>
  )
}
