import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'

/** Auto-migrated from Tailwind — UpNextCard */
export const upNextCard = stylex.create({
  sce8d595f: {
    "marginLeft": "auto",
    "marginRight": "auto",
    "marginTop": "2.5rem",
    "maxWidth": "72rem",
    "paddingLeft": "1rem",
    "paddingRight": "1rem",
    "@media (min-width: 640px)": {
      "paddingLeft": "1.5rem",
      "paddingRight": "1.5rem",
    },
  },
  sc4049d37: {
    "display": "flex",
    "flexWrap": "wrap",
    "alignItems": "baseline",
    "justifyContent": "space-between",
    "rowGap": "0.5rem",
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
  sd1fc735d: {
    "fontVariantNumeric": "tabular-nums",
  },
  sa8fa1afe: {
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "color": "#78716c",
    "textTransform": "uppercase",
    [DARK]: {
      "color": "#78716c",
    },
  },
  sbf4a3002: {
    "marginTop": "0.75rem",
    "display": "flex",
    "alignItems": "baseline",
    "gap": "0.75rem",
  },
  s8b2f6784: {
    "fontSize": "1.125rem",
    "lineHeight": 1,
  },
  s4cddd6f0: {
    "minWidth": 0,
    "flex": "1 1 0%",
    "overflowWrap": "anywhere",
    "wordBreak": "break-word",
    "fontFamily": "\"Cormorant Garamond\", Georgia, serif",
    "fontSize": "1.5rem",
    "fontWeight": 500,
    "lineHeight": 1.375,
    "color": "#1c1917",
    "transitionProperty": "color, background-color, border-color",
    "transitionDuration": "150ms",
    [DARK]: {
      "color": "#f5f5f4",
    },
  },
  se0ae9f9e: {
    "height": "1rem",
    "width": "1rem",
    "flexShrink": 0,
    "alignSelf": "center",
    "color": "#a8a29e",
    "transitionProperty": "color, background-color, border-color, opacity, transform",
    "transitionDuration": "150ms",
  },
  sb5d06877: {
    "marginTop": "0.5rem",
    "overflowWrap": "anywhere",
    "wordBreak": "break-word",
    "color": "#57534e",
    "lineHeight": 1.625,
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  wrapper: {
    display: 'block',
    borderTopWidth: '1px',
    borderBottomWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'rgba(231, 229, 228, 0.8)',
    paddingTop: '1.25rem',
    paddingBottom: '1.25rem',
    transitionProperty: 'color, background-color, border-color',
    transitionDuration: '200ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    [DARK]: { borderColor: 'rgba(41, 37, 36, 0.8)' },
  },
  wrapperLink: {
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineOffset: '2px',
      outlineColor: '#f43f5e',
    },
  },
  statusDot: {
    marginRight: '0.375rem',
  },
})
