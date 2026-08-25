import { stylex } from '@/styles/merge'

const focusVisible = {
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColor: 'var(--bw-accent)',
  outlineOffset: '2px',
} as const

const disabled = {
  opacity: 0.4,
  pointerEvents: 'none',
} as const

const motionSafeActive = {
  ':active': {
    transform: 'scale(0.98)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transitionProperty: 'none',
    ':active': {
      transform: 'none',
    },
  },
} as const

/** Shared button styles. Shape rule: 6px radius, min 44px touch targets. */
export const btn = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    minHeight: '44px',
    paddingLeft: '1.25rem',
    paddingRight: '1.25rem',
    userSelect: 'none',
    transitionProperty: 'background-color, border-color, transform, opacity',
    transitionDuration: '200ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':focus-visible': focusVisible,
    ':disabled': disabled,
    ...motionSafeActive,
  },
  primary: {
    backgroundColor: 'var(--bw-accent)',
    color: 'var(--bw-accent-foreground)',
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: 'var(--bw-accent-light)',
      },
    },
  },
  secondary: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--bw-border)',
    backgroundColor: 'var(--bw-surface)',
    color: 'var(--bw-text)',
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: 'var(--bw-hover)',
      },
    },
  },
  ghost: {
    color: 'var(--bw-text-secondary)',
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: 'var(--bw-hover)',
        color: 'var(--bw-text)',
      },
    },
  },
  destructive: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--bw-destructive-border)',
    backgroundColor: 'var(--bw-destructive-subtle)',
    color: 'var(--bw-destructive)',
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: 'var(--bw-destructive-hover)',
      },
    },
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.375rem',
    minHeight: '44px',
    minWidth: '44px',
    color: 'var(--bw-text-secondary)',
    transitionProperty: 'background-color, transform',
    transitionDuration: '200ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':focus-visible': focusVisible,
    ':disabled': disabled,
    ':active': {
      transform: 'scale(0.96)',
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionProperty: 'none',
      ':active': {
        transform: 'none',
      },
    },
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: 'var(--bw-hover)',
        color: 'var(--bw-text)',
      },
    },
  },
  flex1: { flex: '1 1 0%' },
  wFull: { width: '100%' },
  mt2: { marginTop: '0.5rem' },
  mt3: { marginTop: '0.75rem' },
  mt6: { marginTop: '1.5rem' },
  px3: { paddingLeft: '0.75rem', paddingRight: '0.75rem' },
  smWAuto: {
    '@media (min-width: 640px)': {
      width: 'auto',
    },
  },
  smMinW44: {
    '@media (min-width: 640px)': {
      minWidth: '11rem',
    },
  },
})
