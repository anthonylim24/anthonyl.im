import * as stylex from '@stylexjs/stylex'
const DARK = ':is(.dark) &'

/** Auto-migrated from Tailwind — ConciergeText */
export const conciergeText = stylex.create({
  sdb299471: {
    "color": "#1c1917",
    "fontWeight": 600,
    "letterSpacing": "-0.025em",
    [DARK]: {
      "color": "#f5f5f4",
    },
  },
  s49bc78d: {
    "fontWeight": 600,
    "color": "#1c1917",
    [DARK]: {
      "color": "#f5f5f4",
    },
  },
  sb9bd3a30: {
    "fontStyle": "italic",
  },
  sa8c83dfd: {
    "color": "#78716c",
    [DARK]: {
      "color": "#a8a29e",
    },
  },
  saa61e255: {
    "marginLeft": "0.25rem",
    "display": "flex",
    "flexDirection": "column",
    "gap": "0.25rem",
  },
  sfcb8c19d: {
    "marginLeft": "0.25rem",
    "display": "flex",
    "flexDirection": "column",
    "gap": "0.25rem",
  },
  s9def5fd: {
    "display": "flex",
    "gap": "0.5rem",
  },
  seec3caed: {
    "borderLeftWidth": "2px",
    "borderLeftStyle": "solid",
    "borderColor": "#fda4af",
    "paddingLeft": "0.75rem",
    "fontStyle": "italic",
    "color": "#57534e",
    [DARK]: {
      "borderColor": "#9f1239",
      "color": "#a8a29e",
    },
  },
  sf84eb04d: {
    "backgroundColor": "rgba(231, 229, 228, 0.7)",
    "paddingLeft": "0.25rem",
    "paddingRight": "0.25rem",
    "paddingTop": "0.125rem",
    "paddingBottom": "0.125rem",
    "color": "#292524",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    [DARK]: {
      "backgroundColor": "rgba(68, 64, 60, 0.7)",
      "color": "#f5f5f4",
    },
  },
  s2b72a23f: {
    "marginTop": "0.5rem",
    "marginBottom": "0.5rem",
    "overflowX": "auto",
    "borderRadius": "0.5rem",
    "backgroundColor": "rgba(231, 229, 228, 0.6)",
    "paddingLeft": "0.75rem",
    "paddingRight": "0.75rem",
    "paddingTop": "0.5rem",
    "paddingBottom": "0.5rem",
    "fontSize": "13px",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    [DARK]: {
      "backgroundColor": "rgba(28, 25, 23, 0.8)",
    },
  },
  s1026c40: {
    "marginTop": "0.5rem",
    "marginBottom": "0.5rem",
    "overflowX": "auto",
  },
  sd38cd0f8: {
    "fontSize": "13px",
  },
  scab74e81: {
    "borderBottomWidth": "1px",
    "borderBottomStyle": "solid",
    "borderColor": "#e7e5e4",
    "textAlign": "left",
    [DARK]: {
      "borderColor": "#44403c",
    },
  },
  s132c7a2d: {
    "paddingLeft": "0.5rem",
    "paddingRight": "0.5rem",
    "paddingTop": "0.25rem",
    "paddingBottom": "0.25rem",
    "fontWeight": 600,
    "color": "#292524",
    [DARK]: {
      "color": "#e7e5e4",
    },
  },
  s23406cde: {
    "paddingLeft": "0.5rem",
    "paddingRight": "0.5rem",
    "paddingTop": "0.25rem",
    "paddingBottom": "0.25rem",
    "color": "#44403c",
    [DARK]: {
      "color": "#d6d3d1",
    },
  },
  s5c8bd8c9: {
    "marginTop": "0.75rem",
    "marginBottom": "0.75rem",
    "borderTopWidth": "1px",
    "borderTopStyle": "solid",
    "borderColor": "#e7e5e4",
    [DARK]: {
      "borderColor": "#44403c",
    },
  },
  s95cb8ebe: {
    "marginTop": "0.5rem",
    "marginBottom": "0.5rem",
    "borderRadius": "0.5rem",
  },
  sd79dc566: {
    "display": "flex",
    "flexDirection": "column",
    "gap": "0.5rem",
    "fontSize": "15px",
    "lineHeight": 1.625,
  },
  sdc9eac6a: {
    "marginTop": "0.5rem",
    "overflowWrap": "anywhere",
    "wordBreak": "break-word",
    "color": "#57534e",
    "lineHeight": 1.625,
    [DARK]: {
      "color": "#d6d3d1",
    },
  },
  link: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(244, 63, 94, 0.5)',
    textUnderlineOffset: '2px',
    textDecorationThickness: '1px',
    transitionProperty: 'color, text-decoration-color',
    transitionDuration: '150ms',
    ':hover': {
      textDecorationColor: '#f43f5e',
      color: '#be123c',
    },
    [DARK]: {
      ':hover': {
        color: '#fda4af',
      },
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineOffset: '2px',
      outlineColor: 'rgba(244, 63, 94, 0.6)',
    },
  },
  taskListItem: {
    display: 'flex',
    gap: '0.5rem',
  },
  markerDotRose: {
    marginTop: '7px',
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: '9999px',
    backgroundColor: '#fb7185',
    [DARK]: { backgroundColor: '#f43f5e' },
  },
  markerNumRose: {
    marginTop: '1px',
    flexShrink: 0,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: '#f43f5e',
    [DARK]: { color: '#fb7185' },
  },
  markerDotAccent: {
    marginTop: '7px',
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: '9999px',
    backgroundColor: 'var(--ta, #f43f5e)',
  },
  markerNumAccent: {
    marginTop: '1px',
    flexShrink: 0,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--ta, #f43f5e)',
  },
  fencedCode: {
    fontSize: '13px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
})
