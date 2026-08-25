import { bw, easings } from '../../styles/tokens.stylex'
import { stylex } from '@/styles/merge'

const focusVisible = {
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColor: bw.accent,
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
    transitionTimingFunction: easings.outExpo,
    ':focus-visible': focusVisible,
    ':disabled': disabled,
    ...motionSafeActive,
  },
  primary: {
    backgroundColor: bw.accent,
    color: bw.accentForeground,
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: bw.accentLight,
      },
    },
  },
  secondary: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: bw.border,
    backgroundColor: bw.surface,
    color: bw.text,
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: bw.hover,
      },
    },
  },
  ghost: {
    color: bw.textSecondary,
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: bw.hover,
        color: bw.text,
      },
    },
  },
  destructive: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: bw.destructiveBorder,
    backgroundColor: bw.destructiveSubtle,
    color: bw.destructive,
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        backgroundColor: bw.destructiveHover,
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
    color: bw.textSecondary,
    transitionProperty: 'background-color, transform',
    transitionDuration: '200ms',
    transitionTimingFunction: easings.outExpo,
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
        backgroundColor: bw.hover,
        color: bw.text,
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
