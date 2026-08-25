import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'

/** Auto-migrated from Tailwind — MapModeCompass */
export const mapModeCompass = stylex.create({
  s718dff: {
    "position": "relative",
  },
  s284c2f1: {
    "height": "100%",
    "width": "100%",
  },
  s91b1cc5a: {

  },
  s51215eea: {

  },
  s2fb61f6a: {

  },
  s354f7a26: {
    "position": "absolute",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#be123c",
    "fontWeight": 700,
    "textTransform": "uppercase",
    [DARK]: {
      "color": "#fda4af",
    },
  },
  button: {
    display: 'inline-flex',
    height: '2.75rem',
    width: '2.75rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '9999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(28, 25, 23, 0.08)',
    backgroundColor: 'rgba(255, 254, 250, 0.88)',
    color: '#44403c',
    boxShadow: '0 8px 24px rgba(28, 25, 23, 0.1)',
    backdropFilter: 'blur(24px)',
    transitionProperty: 'color, background-color, border-color',
    transitionDuration: '150ms',
    ':hover': { color: '#be123c' },
    [DARK]: { ':hover': { color: '#fecdd3' } },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineOffset: '2px',
      outlineColor: 'rgba(244, 63, 94, 0.6)',
    },
    [DARK]: {
      borderColor: 'rgba(255, 252, 245, 0.06)',
      backgroundColor: 'rgba(28, 25, 23, 0.78)',
      color: '#d6d3d1',
    },
  },

})
