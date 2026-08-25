import { sx } from '@/styles/merge'
import type { StyleXStyles } from '@stylexjs/stylex'
import { busynessStyles } from './korea.stylex'
import type { BusynessLevel } from './placesApi'

const LEVEL_STYLES: Record<
  BusynessLevel,
  { label: string; emoji: string; tone: StyleXStyles; dot: StyleXStyles }
> = {
  quiet: {
    label: 'Quiet',
    emoji: '🌿',
    tone: busynessStyles.quiet,
    dot: busynessStyles.dotQuiet,
  },
  moderate: {
    label: 'Moderate',
    emoji: '🟡',
    tone: busynessStyles.moderate,
    dot: busynessStyles.dotModerate,
  },
  busy: {
    label: 'Busy',
    emoji: '🔴',
    tone: busynessStyles.busy,
    dot: busynessStyles.dotBusy,
  },
  very_busy: {
    label: 'Very Busy',
    emoji: '🚨',
    tone: busynessStyles.veryBusy,
    dot: busynessStyles.dotVeryBusy,
  },
}

interface BusynessBadgeProps {
  busyness: BusynessLevel
  size?: 'sm' | 'md'
  style?: StyleXStyles
}

export function BusynessBadge({ busyness, size = 'sm', style }: BusynessBadgeProps) {
  const m = LEVEL_STYLES[busyness]
  return (
    <span {...sx(busynessStyles.base, size === 'md' ? busynessStyles.md : busynessStyles.sm, m.tone, style)}>
      <span aria-hidden>{m.emoji}</span>
      {m.label}
      {busyness === 'very_busy' && (
        <span
          aria-hidden
          {...sx(m.dot, busynessStyles.breatheDot, 'animate-busyness-breathe')}
        />
      )}
    </span>
  )
}

export function busynessLabel(level: BusynessLevel): string {
  return LEVEL_STYLES[level].label
}

export function busynessEmoji(level: BusynessLevel): string {
  return LEVEL_STYLES[level].emoji
}
