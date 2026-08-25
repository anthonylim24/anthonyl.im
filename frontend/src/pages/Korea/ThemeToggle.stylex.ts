import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'
import { palette } from './korea.stylex'

/** Auto-migrated from Tailwind — ThemeToggle */
export const themeToggle = stylex.create({
  scd3f3ccd: {
    height: '1rem',
    width: '1rem',
  },
  button: {
    display: 'inline-flex',
    height: '2.75rem',
    width: '2.75rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '9999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(214, 211, 209, 0.7)',
    backgroundColor: palette.stone50,
    color: palette.stone700,
    transitionProperty: 'color, background-color, border-color',
    transitionDuration: '150ms',
    ':hover': {
      borderColor: palette.rose300,
      color: '#be123c',
      [DARK]: {
        borderColor: palette.rose700,
        color: palette.rose200,
      },
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineOffset: '2px',
      outlineColor: 'rgba(244, 63, 94, 0.6)',
    },
    [DARK]: {
      borderColor: palette.stone700,
      backgroundColor: palette.stone900,
      color: palette.stone300,
    },
  },
})
