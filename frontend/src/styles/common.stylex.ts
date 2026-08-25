import * as stylex from '@stylexjs/stylex'
/** Cross-route layout and interaction primitives. */
export const layout = stylex.create({
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  flex: { display: 'flex' },
  flexCol: { display: 'flex', flexDirection: 'column' },
  flexRow: { display: 'flex', flexDirection: 'row' },
  flex1: { flex: '1 1 0%' },
  flexShrink0: { flexShrink: 0 },
  itemsCenter: { alignItems: 'center' },
  itemsStart: { alignItems: 'flex-start' },
  itemsEnd: { alignItems: 'flex-end' },
  justifyCenter: { justifyContent: 'center' },
  justifyBetween: { justifyContent: 'space-between' },
  justifyEnd: { justifyContent: 'flex-end' },
  grid: { display: 'grid' },
  relative: { position: 'relative' },
  absolute: { position: 'absolute' },
  fixed: { position: 'fixed' },
  inset0: { inset: 0 },
  wFull: { width: '100%' },
  hFull: { height: '100%' },
  minH0: { minHeight: 0 },
  minW0: { minWidth: 0 },
  mxAuto: { marginLeft: 'auto', marginRight: 'auto' },
  outlineNone: { outline: 'none' },
  borderNone: { borderStyle: 'none', borderWidth: 0 },
  resizeNone: { resize: 'none' },
  bgTransparent: { backgroundColor: 'transparent' },
  overflowHidden: { overflow: 'hidden' },
  overflowXAuto: { overflowX: 'auto' },
  overflowYAuto: { overflowY: 'auto' },
  textLeft: { textAlign: 'left' },
  textCenter: { textAlign: 'center' },
  fontMono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  fontDisplay: {
    fontFamily: '"Cormorant Garamond", Georgia, serif',
  },
  fontSans: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  tabularNums: {
    fontVariantNumeric: 'tabular-nums',
    fontFeatureSettings: '"tnum"',
  },
  breakWords: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  touchTarget: {
    minHeight: '44px',
    minWidth: '44px',
  },
  focusRing: {
    outlineWidth: '2px',
    outlineStyle: 'solid',
    outlineColor: 'rgba(28, 25, 23, 0.3)',
    outlineOffset: '2px',
  },
  focusRingTrips: {
    outlineWidth: '2px',
    outlineStyle: 'solid',
    outlineColor: 'var(--trips-accent)',
    outlineOffset: '2px',
  },
  focusRingBw: {
    outlineWidth: '2px',
    outlineStyle: 'solid',
    outlineColor: 'var(--bw-accent)',
    outlineOffset: '2px',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  transitionColors: {
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
  transitionAll: {
    transitionProperty: 'all',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDuration: '150ms',
  },
  roundedSm: { borderRadius: '0.125rem' },
  roundedMd: { borderRadius: '0.375rem' },
  roundedLg: { borderRadius: '0.5rem' },
  roundedFull: { borderRadius: '9999px' },
  border: { borderWidth: '1px', borderStyle: 'solid' },
  shadowSm: { boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' },
  textSm: { fontSize: '0.875rem', lineHeight: '1.25rem' },
  textXs: { fontSize: '0.75rem', lineHeight: '1rem' },
  textLg: { fontSize: '1.125rem', lineHeight: '1.75rem' },
  fontMedium: { fontWeight: 500 },
  fontSemibold: { fontWeight: 600 },
  fontNormal: { fontWeight: 400 },
  leadingNone: { lineHeight: 1 },
  trackingTight: { letterSpacing: '-0.025em' },
  textMuted: { color: 'hsl(var(--muted-foreground))' },
  textForeground: { color: 'hsl(var(--foreground))' },
  bgBackground: { backgroundColor: 'hsl(var(--background))' },
  bgCard: { backgroundColor: 'hsl(var(--card))' },
  borderBorder: { borderColor: 'hsl(var(--border))' },
  ringOffsetBackground: {
    '--ring-offset-color': 'hsl(var(--background))',
  },
})

/** Media-query helpers used across routes. */
export const media = stylex.create({
  smFlexRow: {
    '@media (min-width: 640px)': {
      flexDirection: 'row',
    },
  },
  smTextLeft: {
    '@media (min-width: 640px)': {
      textAlign: 'left',
    },
  },
  smRoundedLg: {
    '@media (min-width: 640px)': {
      borderRadius: '0.5rem',
    },
  },
  hoverOpacity100: {
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        opacity: 1,
      },
    },
  },
})
