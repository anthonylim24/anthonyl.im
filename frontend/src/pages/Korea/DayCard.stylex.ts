import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'
import { palette } from './korea.stylex'

/** Auto-migrated from Tailwind — DayCard */
export const dayCard = stylex.create({
  sb42244d4: {
    "height": "100%",
  },
  s7982aa2a: {
    "position": "absolute",
    "zIndex": 10,
    "display": "inline-flex",
    "alignItems": "center",
    "gap": "0.375rem",
    "color": "#be123c",
    "fontWeight": 600,
    "textTransform": "uppercase",
    [DARK]: {
      "color": "#fda4af",
    },
  },
  s421599fa: {
    "borderRadius": "9999px",
    "backgroundColor": "#f43f5e",
    [DARK]: {
      "backgroundColor": "#fb7185",
    },
  },
  s324c199f: {
    "position": "relative",
    "display": "flex",
    "height": "100%",
    "flexDirection": "column",
    "gap": "1rem",
    "padding": "1.25rem",
    "@media (min-width: 640px)": {
      "padding": "1.5rem",
    },
  },
  s8d053440: {
    "display": "flex",
    "alignItems": "baseline",
    "justifyContent": "space-between",
    "gap": "0.75rem",
  },
  s2c12ad9b: {
    "display": "flex",
    "alignItems": "baseline",
    "gap": "0.625rem",
  },
  s631d90a6: {
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#78716c",
    "fontWeight": 600,
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  s146516be: {
    "color": "#d6d3d1",
    [DARK]: {
      "color": "#44403c",
    },
  },
  se3a36da5: {
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#78716c",
    "textTransform": "uppercase",
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  s379c9d20: {
    "fontSize": "1.5rem",
    "lineHeight": 1,
    "opacity": 0.9,
  },
  s6bf5d960: {
    "overflowWrap": "anywhere",
    "wordBreak": "break-word",
    "fontFamily": "\"Cormorant Garamond\", Georgia, serif",
    "fontSize": "1.5rem",
    "fontWeight": 500,
    "lineHeight": 1.25,
    "color": "#1c1917",
    [DARK]: {
      "color": "#f5f5f4",
    },
  },
  s5590cb5c: {
    "fontSize": "0.875rem",
    "lineHeight": 1.625,
    "color": "#44403c",
    [DARK]: {
      "color": "#d6d3d1",
    },
  },
  scdfd3463: {
    "fontSize": "0.75rem",
    "color": "#78716c",
    [DARK]: {
      "color": "#78716c",
    },
  },
  sb69e2350: {
    "marginTop": "auto",
    "display": "flex",
    "alignItems": "center",
    "justifyContent": "space-between",
    "gap": "0.75rem",
    "borderTopWidth": "1px",
    "borderTopStyle": "solid",
    "borderColor": "rgba(231, 229, 228, 0.8)",
    "paddingTop": "0.75rem",
    "color": "#78716c",
    [DARK]: {
      "borderColor": "rgba(41, 37, 36, 0.8)",
      "color": "#78716c",
    },
  },
  s31c70300: {
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "textTransform": "uppercase",
  },
  s86ff3e5: {
    "display": "flex",
    "alignItems": "center",
    "gap": "0.75rem",
  },
  s9dd51fa2: {
    "display": "inline-flex",
    "alignItems": "center",
    "gap": "0.375rem",
    "color": "#be123c",
    [DARK]: {
      "color": "#fda4af",
    },
  },
  s36eebe6c: {
    "borderRadius": "9999px",
    "backgroundColor": "#f43f5e",
    [DARK]: {
      "backgroundColor": "#fb7185",
    },
  },
  sc6aa20e2: {
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "fontVariantNumeric": "tabular-nums",
    "color": "#78716c",
    [DARK]: {
      "color": "#78716c",
    },
  },
  revealWrap: { height: '100%' },
  cardLink: {
    position: 'relative',
    display: 'block',
    height: '100%',
    overflow: 'hidden',
    borderRadius: '1.5rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    backgroundColor: palette.stone50,
    transitionProperty: 'border-color, background-color, box-shadow',
    transitionDuration: '300ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: 'rgba(244, 63, 94, 0.5)',
      outlineOffset: '2px',
    },
    [DARK]: {
      backgroundColor: 'rgba(28, 25, 23, 0.4)',
      ':focus-visible': { outlineOffsetColor: palette.stone950 },
    },
    ':hover': {
      boxShadow: '0 18px 40px -24px rgba(28, 25, 23, 0.18)',
      [DARK]: { boxShadow: '0 18px 40px -24px rgba(0, 0, 0, 0.6)' },
    },
  },
  cardLinkToday: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(251, 113, 133, 0.7)',
    [DARK]: { borderColor: 'rgba(244, 63, 94, 0.6)' },
  },
  cardLinkDefault: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(231, 229, 228, 0.8)',
    ':hover': {
      borderColor: palette.stone300,
      backgroundColor: 'rgba(245, 245, 244, 0.6)',
      [DARK]: {
        borderColor: palette.stone700,
        backgroundColor: 'rgba(28, 25, 23, 0.6)',
      },
    },
    [DARK]: { borderColor: 'rgba(41, 37, 36, 0.8)' },
  },
  cardLinkPast: { opacity: 0.6 },
})
