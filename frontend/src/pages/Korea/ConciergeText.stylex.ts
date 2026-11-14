import * as stylex from '@stylexjs/stylex'

// Markdown styles for concierge replies. Colours come from the trip planner's
// theme tokens, which switch with the theme on their own; the fallbacks keep
// the text legible wherever those tokens are not defined (it then inherits
// the surrounding text colour rather than assuming a light page).
export const conciergeText = stylex.create({
  sdb299471: {
    "color": "var(--trips-ink, inherit)",
    "fontWeight": 600,
    "letterSpacing": "-0.025em",
  },
  s49bc78d: {
    "fontWeight": 600,
    "color": "var(--trips-ink, inherit)",
  },
  sb9bd3a30: {
    "fontStyle": "italic",
  },
  sa8c83dfd: {
    "color": "var(--trips-ink-tertiary, inherit)",
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
    "borderColor": "var(--brand-fill, currentColor)",
    "paddingLeft": "0.75rem",
    "fontStyle": "italic",
    "color": "var(--trips-ink-secondary, inherit)",
  },
  sf84eb04d: {
    "backgroundColor": "var(--trips-sunken, rgba(120, 113, 108, 0.18))",
    "paddingLeft": "0.25rem",
    "paddingRight": "0.25rem",
    "paddingTop": "0.125rem",
    "paddingBottom": "0.125rem",
    "color": "var(--trips-ink, inherit)",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  s2b72a23f: {
    "marginTop": "0.5rem",
    "marginBottom": "0.5rem",
    "overflowX": "auto",
    "borderRadius": "0.5rem",
    "backgroundColor": "var(--trips-sunken, rgba(120, 113, 108, 0.18))",
    "color": "var(--trips-ink, inherit)",
    "paddingLeft": "0.75rem",
    "paddingRight": "0.75rem",
    "paddingTop": "0.5rem",
    "paddingBottom": "0.5rem",
    "fontSize": "13px",
    "fontFamily": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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
    "borderColor": "var(--trips-line-strong, rgba(120, 113, 108, 0.35))",
    "textAlign": "left",
  },
  s132c7a2d: {
    "paddingLeft": "0.5rem",
    "paddingRight": "0.5rem",
    "paddingTop": "0.25rem",
    "paddingBottom": "0.25rem",
    "fontWeight": 600,
    "color": "var(--trips-ink, inherit)",
  },
  s23406cde: {
    "paddingLeft": "0.5rem",
    "paddingRight": "0.5rem",
    "paddingTop": "0.25rem",
    "paddingBottom": "0.25rem",
    "color": "var(--trips-ink-secondary, inherit)",
  },
  s5c8bd8c9: {
    "marginTop": "0.75rem",
    "marginBottom": "0.75rem",
    "borderTopWidth": "1px",
    "borderTopStyle": "solid",
    "borderColor": "var(--trips-line-strong, rgba(120, 113, 108, 0.35))",
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
    "color": "var(--trips-ink-secondary, inherit)",
    "lineHeight": 1.625,
  },
  link: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textDecorationLine: 'underline',
    color: 'var(--brand, inherit)',
    textDecorationColor: 'color-mix(in srgb, var(--brand, currentColor) 45%, transparent)',
    textUnderlineOffset: '2px',
    textDecorationThickness: '1px',
    transitionProperty: 'color, text-decoration-color',
    transitionDuration: '150ms',
    ':hover': {
      textDecorationColor: 'var(--brand, currentColor)',
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineOffset: '2px',
      outlineColor: 'var(--brand-ring, currentColor)',
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
  },
  markerNumRose: {
    marginTop: '1px',
    flexShrink: 0,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: '#f43f5e',
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
