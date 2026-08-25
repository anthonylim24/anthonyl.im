import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'
import { palette } from './korea.stylex'

/** Auto-migrated from Tailwind — ReservationCard */
export const reservationCard = stylex.create({
  se99caeca: {
    "display": "flex",
    "alignItems": "flex-start",
    "gap": "0.75rem",
  },
  s47bb6bc2: {
    "display": "flex",
    "height": "2.5rem",
    "width": "2.5rem",
    "flexShrink": 0,
    "alignItems": "center",
    "justifyContent": "center",
    "borderRadius": "0.75rem",
    "backgroundColor": "#f5f5f4",
    "fontSize": "1.25rem",
    [DARK]: {
      "backgroundColor": "#292524",
    },
  },
  se30fd43e: {
    "minWidth": 0,
    "flex": "1 1 0%",
  },
  s790ac3cd: {
    "display": "flex",
    "flexWrap": "wrap",
    "alignItems": "baseline",
    "columnGap": "0.5rem",
  },
  seadad39: {
    "minWidth": 0,
    "overflowWrap": "anywhere",
    "wordBreak": "break-word",
    "fontSize": "0.875rem",
    "fontWeight": 600,
    "color": "#1c1917",
    [DARK]: {
      "color": "#f5f5f4",
    },
  },
  saa27cff6: {
    "marginTop": "0.25rem",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    "fontSize": "0.75rem",
    "color": "#78716c",
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  s366347f2: {
    "marginTop": "0.375rem",
    "fontSize": "0.875rem",
    "color": "#44403c",
    [DARK]: {
      "color": "#d6d3d1",
    },
  },
  s6ce983c5: {
    "marginTop": "0.625rem",
    "display": "flex",
    "flexWrap": "wrap",
    "gap": "0.375rem",
  },
  s28fabddc: {
    "display": "inline-flex",
    "alignItems": "center",
    "gap": "0.25rem",
    "borderRadius": "9999px",
    "borderWidth": "1px",
    "borderStyle": "solid",
    "borderColor": "#e7e5e4",
    "backgroundColor": "#fafaf9",
    "paddingLeft": "0.625rem",
    "paddingRight": "0.625rem",
    "paddingTop": "0.25rem",
    "paddingBottom": "0.25rem",
    "color": "#292524",
    "fontWeight": 500,
    "transitionProperty": "color, background-color, border-color, opacity, transform",
    "transitionDuration": "150ms",
    [DARK]: {
      "borderColor": "#292524",
      "backgroundColor": "rgba(28, 25, 23, 0.6)",
      "color": "#e7e5e4",
    },
    ":hover": {
      "borderColor": "#44403c",
      "color": "#fda4af",
    },
  },
  scd31254b: {
    "height": "0.75rem",
    "width": "0.75rem",
  },
  sbdc28cf0: {
    "marginTop": "0.375rem",
    "fontSize": "0.75rem",
    "color": "#78716c",
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  s44aff51: {
    "marginTop": "0.125rem",
    "fontSize": "0.75rem",
    "color": "#78716c",
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  sf49ca63e: {
    "marginTop": "0.5rem",
    "borderRadius": "0.375rem",
    "backgroundColor": "#fafaf9",
    "paddingLeft": "0.625rem",
    "paddingRight": "0.625rem",
    "paddingTop": "0.375rem",
    "paddingBottom": "0.375rem",
    "fontSize": "0.75rem",
    "fontStyle": "italic",
    "color": "#57534e",
    [DARK]: {
      "backgroundColor": "rgba(41, 37, 36, 0.6)",
      "color": "#a8a29e",
    },
  },
  article: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.stone200,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: '1rem',
    boxShadow: '0 1px 2px rgba(28, 25, 23, 0.05)',
    backdropFilter: 'blur(8px)',
    [DARK]: {
      borderColor: palette.stone800,
      backgroundColor: 'rgba(28, 25, 23, 0.6)',
    },
  },
  articleCompact: {
    '@media (min-width: 640px)': { padding: '0.75rem' },
  },
  statusChip: {
    flexShrink: 0,
    cursor: 'help',
  },
})
