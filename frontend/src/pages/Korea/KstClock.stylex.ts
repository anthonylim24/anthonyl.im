import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'

/** Auto-migrated from Tailwind — KstClock */
export const kstClock = stylex.create({
  sc3877837: {
    "display": "none",
    "flexShrink": 0,
    "alignItems": "center",
    "gap": "0.25rem",
    "borderRadius": "9999px",
    "backgroundColor": "#f5f5f4",
    "paddingLeft": "0.625rem",
    "paddingRight": "0.625rem",
    "paddingTop": "0.25rem",
    "paddingBottom": "0.25rem",
    "color": "#57534e",
    "fontWeight": 500,
    [DARK]: {
      "backgroundColor": "#292524",
      "color": "#d6d3d1",
    },
    "@media (min-width: 640px)": {
      "display": "inline-flex",
    },
  },
  saa60077c: {
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "fontVariantNumeric": "tabular-nums",
  },
  s5e96a87d: {
    "color": "#a8a29e",
    [DARK]: {
      "color": "#78716c",
    },
  },
})
