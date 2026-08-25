import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'

/** Auto-migrated from Tailwind — TodayBanner */
export const todayBanner = stylex.create({
  sc373acf4: {
    "marginLeft": "auto",
    "marginRight": "auto",
    "marginTop": "2rem",
    "maxWidth": "72rem",
    "paddingLeft": "1rem",
    "paddingRight": "1rem",
    "@media (min-width: 640px)": {
      "paddingLeft": "1.5rem",
      "paddingRight": "1.5rem",
    },
  },
  s11873b0c: {
    "display": "block",
    "borderTopWidth": "1px",
    "borderBottomWidth": "1px",
    "borderStyle": "solid",
    "borderColor": "rgba(231, 229, 228, 0.8)",
    "paddingTop": "1rem",
    "paddingBottom": "1rem",
    "transitionProperty": "color, background-color, border-color",
    "transitionDuration": "150ms",
    [DARK]: {
      "borderColor": "rgba(41, 37, 36, 0.8)",
    },
    ":focus-visible": {

    },
  },
  s9f5bd48a: {
    "display": "flex",
    "flexWrap": "wrap",
    "alignItems": "baseline",
    "columnGap": "1.25rem",
    "rowGap": "0.25rem",
  },
  sda4d7977: {
    "display": "flex",
    "alignItems": "center",
    "gap": "0.5rem",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#be123c",
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
  s146516be: {
    "color": "#d6d3d1",
    [DARK]: {
      "color": "#44403c",
    },
  },
  sa8c841be: {
    "color": "#78716c",
    [DARK]: {
      "color": "#78716c",
    },
  },
  sc6d4a1bc: {
    "position": "relative",
    "overflowWrap": "anywhere",
    "wordBreak": "break-word",
    "fontFamily": "\"Cormorant Garamond\", Georgia, serif",
    "fontSize": "1.125rem",
    "fontWeight": 500,
    "lineHeight": 1.375,
    "color": "#1c1917",
    "transitionProperty": "color, background-color, border-color",
    "transitionDuration": "150ms",
    [DARK]: {
      "color": "#f5f5f4",
    },
    "@media (min-width: 640px)": {
      "fontSize": "1.25rem",
    },
  },
  sf13f147e: {
    "marginRight": "0.5rem",
    "fontSize": "1rem",
    "opacity": 0.9,
  },
  s7d17252d: {
    "position": "relative",
  },
  s6a950eb0: {
    "pointerEvents": "none",
    "position": "absolute",
    "left": 0,
    "right": 0,
    "width": "100%",
    "color": "rgba(245, 158, 11, 0.85)",
    [DARK]: {
      "color": "rgba(251, 191, 36, 0.8)",
    },
  },
  saeafdce5: {
    "display": "none",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#78716c",
    "textTransform": "uppercase",
    "transitionProperty": "color, background-color, border-color",
    "transitionDuration": "150ms",
    [DARK]: {
      "color": "#78716c",
    },
    "@media (min-width: 640px)": {

    },
  },
})
