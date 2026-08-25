import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'
import { palette } from './korea.stylex'

/** Auto-migrated from Tailwind — Time */
export const time = stylex.create({
  sd1fc735d: {
    fontVariantNumeric: 'tabular-nums',
  },
  wrapper: {
    position: 'relative',
    display: 'inline-block',
    cursor: 'help',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'rgba(168, 162, 158, 0.4)',
    textUnderlineOffset: '2px',
    transitionProperty: 'text-decoration-color',
    transitionDuration: '150ms',
    ':hover': { textDecorationColor: 'rgba(244, 63, 94, 0.7)' },
  },
  tooltip: {
    pointerEvents: 'none',
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    zIndex: 10,
    marginBottom: '0.25rem',
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
    borderRadius: '0.375rem',
    backgroundColor: palette.stone900,
    paddingLeft: '0.5rem',
    paddingRight: '0.5rem',
    paddingTop: '0.125rem',
    paddingBottom: '0.125rem',
    fontSize: '10px',
    fontWeight: 500,
    color: palette.white,
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
    [DARK]: {
      backgroundColor: palette.stone100,
      color: palette.stone900,
    },
  },
  tooltipOpen: { opacity: 1 },
  tooltipClosed: { opacity: 0 },
})
