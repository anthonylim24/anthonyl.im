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

/**
 * Shared button styles. Watercolour pills, min 44px touch targets. Primary is
 * an ink wash (pooled darker at the lower edge); set `--bf-ink` on an
 * ancestor to paint it with the technique's pigment.
 */
export const btn = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    borderRadius: '999px',
    borderWidth: 0,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    fontSize: '0.9rem',
    fontWeight: 500,
    letterSpacing: '0.005em',
    minHeight: '46px',
    paddingLeft: '1.4rem',
    paddingRight: '1.4rem',
    userSelect: 'none',
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, transform, opacity, filter, box-shadow',
    transitionDuration: '240ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':focus-visible': focusVisible,
    ':disabled': disabled,
    ...motionSafeActive,
  },
  primary: {
    backgroundColor: 'color-mix(in oklab, var(--bf-ink, var(--bw-accent)), var(--bf-btn-base) var(--bf-btn-amt))',
    backgroundImage: 'radial-gradient(130% 170% at 28% 12%, rgba(255, 255, 255, 0.2), transparent 52%)',
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.1), inset 0 -7px 14px -9px rgba(0, 0, 0, 0.45), 0 6px 18px -10px color-mix(in srgb, var(--bf-ink, var(--bw-accent)) 70%, transparent)',
    color: 'var(--bf-btn-fg)',
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        filter: 'saturate(1.12) brightness(1.06)',
      },
    },
  },
  secondary: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'color-mix(in srgb, var(--bw-text) 22%, transparent)',
    backgroundColor: 'transparent',
    color: 'var(--bw-text)',
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: 'var(--bw-hover)',
        borderColor: 'color-mix(in srgb, var(--bw-text) 36%, transparent)',
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
    borderRadius: '999px',
    minHeight: '46px',
    minWidth: '46px',
    color: 'var(--bw-text-secondary)',
    transitionProperty: 'background-color, transform, color',
    transitionDuration: '200ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':focus-visible': focusVisible,
    ':disabled': disabled,
    ':active': {
      transform: 'scale(0.94)',
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
