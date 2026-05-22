// Busyness indicator badge — compact pill used in place cards, detail sheets,
// and Map Mode overlays. Colour-coded from calm green (quiet) through red
// (very_busy) to signal crowd level at a glance.

import type { BusynessLevel } from './placesApi'

const META: Record<BusynessLevel, {
  label: string
  emoji: string
  bgLight: string
  bgDark: string
  textLight: string
  textDark: string
}> = {
  quiet:     { label: 'Quiet',     emoji: '🌿', bgLight: 'bg-emerald-50',  bgDark: 'dark:bg-emerald-950/40', textLight: 'text-emerald-700', textDark: 'dark:text-emerald-300' },
  moderate:  { label: 'Moderate',  emoji: '🟡', bgLight: 'bg-amber-50',    bgDark: 'dark:bg-amber-950/40',   textLight: 'text-amber-700',   textDark: 'dark:text-amber-300'   },
  busy:      { label: 'Busy',      emoji: '🔴', bgLight: 'bg-orange-50',   bgDark: 'dark:bg-orange-950/40',  textLight: 'text-orange-700',  textDark: 'dark:text-orange-300'  },
  very_busy: { label: 'Very Busy', emoji: '🚨', bgLight: 'bg-rose-50',     bgDark: 'dark:bg-rose-950/40',    textLight: 'text-rose-700',    textDark: 'dark:text-rose-300'    },
}

interface BusynessBadgeProps {
  busyness: BusynessLevel
  /** 'sm' is the default compact pill; 'md' is slightly larger for detail sheets */
  size?: 'sm' | 'md'
  className?: string
}

export function BusynessBadge({ busyness, size = 'sm', className = '' }: BusynessBadgeProps) {
  const m = META[busyness]
  const base = `inline-flex items-center gap-1 rounded-full font-medium ${m.bgLight} ${m.bgDark} ${m.textLight} ${m.textDark}`
  const sizing = size === 'md'
    ? 'px-2.5 py-1 text-xs'
    : 'px-2 py-0.5 text-[10px]'
  return (
    <span className={`${base} ${sizing} ${className}`}>
      <span aria-hidden className="leading-none">{m.emoji}</span>
      {m.label}
    </span>
  )
}

export function busynessLabel(level: BusynessLevel): string {
  return META[level].label
}

export function busynessEmoji(level: BusynessLevel): string {
  return META[level].emoji
}
