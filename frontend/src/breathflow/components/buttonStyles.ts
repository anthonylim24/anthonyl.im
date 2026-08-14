/**
 * Shared button classes. Shape rule: interactive controls are 6px
 * (rounded-md), min 44px touch targets, tactile :active press.
 */

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium '
  + 'min-h-11 px-5 select-none transition-[background-color,border-color,transform,opacity] duration-200 '
  + 'active:scale-[0.98] motion-reduce:active:scale-100 motion-reduce:transition-none '
  + 'focus-visible:outline-2 focus-visible:outline-offset-2 '
  + 'focus-visible:outline-bw-accent disabled:opacity-40 disabled:pointer-events-none'

export const btnPrimary = `${BASE} bg-bw-accent text-bw-accent-foreground hover:bg-bw-accent-light`

export const btnSecondary =
  `${BASE} border border-bw-border bg-bw-surface text-bw hover:bg-bw-hover`

export const btnGhost = `${BASE} text-bw-secondary hover:bg-bw-hover hover:text-bw`

export const btnDestructive =
  `${BASE} border border-bw-destructive-border bg-bw-destructive-subtle text-bw-destructive hover:bg-bw-destructive-hover`

/** Square icon button, still a 44px target. */
export const btnIcon =
  'inline-flex items-center justify-center rounded-md min-h-11 min-w-11 text-bw-secondary '
  + 'transition-[background-color,transform] duration-200 active:scale-[0.96] '
  + 'motion-reduce:active:scale-100 motion-reduce:transition-none '
  + 'hover:bg-bw-hover hover:text-bw '
  + 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bw-accent '
  + 'disabled:opacity-40 disabled:pointer-events-none'
