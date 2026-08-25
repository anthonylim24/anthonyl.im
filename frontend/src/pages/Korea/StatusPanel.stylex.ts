import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'

/** Auto-migrated from Tailwind — StatusPanel */
export const statusPanel = stylex.create({
  sf10e06ed: {
    "marginLeft": "auto",
    "marginRight": "auto",
    "marginTop": "4rem",
    "maxWidth": "72rem",
    "paddingLeft": "1rem",
    "paddingRight": "1rem",
    "@media (min-width: 640px)": {
      "paddingLeft": "1.5rem",
      "paddingRight": "1.5rem",
    },
  },
  sfeda29b9: {
    "borderBottomWidth": "1px",
    "borderBottomStyle": "solid",
    "borderColor": "rgba(231, 229, 228, 0.8)",
    "paddingBottom": "1.25rem",
    [DARK]: {
      "borderColor": "rgba(41, 37, 36, 0.8)",
    },
  },
  s6ebd97a0: {
    "display": "flex",
    "alignItems": "center",
    "gap": "0.75rem",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#78716c",
    "textTransform": "uppercase",
    [DARK]: {
      "color": "#78716c",
    },
  },
  s1ed0b4fd: {
    "fontVariantNumeric": "tabular-nums",
    "color": "#e11d48",
    [DARK]: {
      "color": "#fb7185",
    },
  },
  sd1fcfbe6: {
    "height": "1px",
    "width": "2.5rem",
    "backgroundColor": "#d6d3d1",
    [DARK]: {
      "backgroundColor": "#44403c",
    },
  },
  s5187ae33: {
    "marginTop": "0.75rem",
    "fontFamily": "\"Cormorant Garamond\", Georgia, serif",
    "color": "#1c1917",
    "fontWeight": 500,
    [DARK]: {
      "color": "#f5f5f4",
    },
  },
  sa9fe7956: {
    "marginTop": "2rem",
    "display": "grid",
    "@media (min-width: 640px)": {
      "gridTemplateColumns": "repeat(2, minmax(0, 1fr))",
    },
    "@media (min-width: 1024px)": {

    },
  },
  s3f58665f: {
    "minWidth": 0,
  },
  se186a33a: {
    "display": "flex",
    "alignItems": "center",
    "gap": "0.5rem",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#57534e",
    "textTransform": "uppercase",
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  s1bd416de: {
    "fontVariantNumeric": "tabular-nums",
    "color": "#a8a29e",
    [DARK]: {
      "color": "#57534e",
    },
  },
  s5cd7e8ad: {
    "marginTop": "0.75rem",
    "color": "#44403c",
    "lineHeight": 1.375,
    [DARK]: {
      "color": "#d6d3d1",
    },
  },
  s13588c5b: {
    "overflowWrap": "anywhere",
    "wordBreak": "break-word",
  },
})
