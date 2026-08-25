import * as stylex from '@stylexjs/stylex'

/** Class-based dark mode — html/body carries `.dark`. */
export const DARK = ':is(.dark) &'

/** Korea rose / amber / stone palette. */
export const palette = {
  rose50: '#fff1f2',
  rose100: '#ffe4e6',
  rose200: '#fecdd3',
  rose300: '#fda4af',
  rose400: '#fb7185',
  rose500: '#f43f5e',
  rose600: '#e11d48',
  rose700: '#be123c',
  rose800: '#9f1239',
  rose900: '#881337',
  rose950: '#4c0519',
  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber300: '#fcd34d',
  amber400: '#fbbf24',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',
  amber800: '#92400e',
  amber900: '#78350f',
  amber950: '#451a03',
  stone50: '#fafaf9',
  stone100: '#f5f5f4',
  stone200: '#e7e5e4',
  stone300: '#d6d3d1',
  stone400: '#a8a29e',
  stone500: '#78716c',
  stone600: '#57534e',
  stone700: '#44403c',
  stone800: '#292524',
  stone900: '#1c1917',
  stone950: '#0c0a09',
  emerald50: '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald300: '#6ee7b7',
  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065f46',
  emerald900: '#064e3b',
  emerald950: '#022c22',
  orange50: '#fff7ed',
  orange500: '#f97316',
  orange700: '#c2410c',
  white: '#ffffff',
  black: '#000000',
  canvas: '#fffefa',
  ink: '#1c1917',
  borderLight: 'rgba(28, 25, 23, 0.08)',
  borderDark: 'rgba(255, 252, 245, 0.06)',
  surfaceGlassLight: 'rgba(255, 254, 250, 0.88)',
  surfaceGlassDark: 'rgba(28, 25, 23, 0.78)',
} as const

/** Status chips + dots (replaces koreaTheme Tailwind strings). */
export const statusStyles = stylex.create({
  chipConfirmed: {
    borderRadius: '9999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.emerald200,
    backgroundColor: palette.emerald50,
    paddingLeft: '0.5rem',
    paddingRight: '0.5rem',
    paddingTop: '0.125rem',
    paddingBottom: '0.125rem',
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: palette.emerald900,
    [DARK]: {
      borderColor: 'rgba(6, 78, 59, 0.6)',
      backgroundColor: 'rgba(2, 44, 34, 0.4)',
      color: palette.emerald100,
    },
  },
  chipTentative: {
    borderRadius: '9999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.stone300,
    backgroundColor: palette.stone100,
    paddingLeft: '0.5rem',
    paddingRight: '0.5rem',
    paddingTop: '0.125rem',
    paddingBottom: '0.125rem',
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: palette.stone700,
    [DARK]: {
      borderColor: palette.stone700,
      backgroundColor: 'rgba(28, 25, 23, 0.6)',
      color: palette.stone300,
    },
  },
  chipPending: {
    borderRadius: '9999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.rose200,
    backgroundColor: palette.rose50,
    paddingLeft: '0.5rem',
    paddingRight: '0.5rem',
    paddingTop: '0.125rem',
    paddingBottom: '0.125rem',
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: palette.rose900,
    [DARK]: {
      borderColor: 'rgba(136, 19, 55, 0.6)',
      backgroundColor: 'rgba(76, 5, 25, 0.4)',
      color: palette.rose100,
    },
  },
  dotConfirmed: { backgroundColor: palette.emerald600 },
  dotTentative: {
    backgroundColor: palette.stone400,
    [DARK]: { backgroundColor: palette.stone500 },
  },
  dotPending: { backgroundColor: palette.rose500 },
  dotStone: {
    backgroundColor: palette.stone400,
    [DARK]: { backgroundColor: palette.stone500 },
  },
  dotRose: {
    backgroundColor: palette.rose500,
    [DARK]: { backgroundColor: palette.rose400 },
  },
  dotEmerald: {
    backgroundColor: palette.emerald600,
    [DARK]: { backgroundColor: palette.emerald500 },
  },
})

/** Callout tone backgrounds. */
export const calloutStyles = stylex.create({
  info: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.stone200,
    backgroundColor: palette.stone50,
    [DARK]: {
      borderColor: palette.stone800,
      backgroundColor: 'rgba(28, 25, 23, 0.4)',
    },
  },
  warn: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.rose200,
    backgroundColor: 'rgba(255, 241, 242, 0.7)',
    [DARK]: {
      borderColor: 'rgba(136, 19, 55, 0.5)',
      backgroundColor: 'rgba(76, 5, 25, 0.25)',
    },
  },
  success: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.emerald200,
    backgroundColor: 'rgba(236, 253, 245, 0.7)',
    [DARK]: {
      borderColor: 'rgba(6, 78, 59, 0.5)',
      backgroundColor: 'rgba(2, 44, 34, 0.25)',
    },
  },
  alert: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: palette.rose300,
    backgroundColor: 'rgba(255, 228, 230, 0.7)',
    [DARK]: {
      borderColor: 'rgba(136, 19, 55, 0.6)',
      backgroundColor: 'rgba(76, 5, 25, 0.4)',
    },
  },
})

/** Busyness badge variants. */
export const busynessStyles = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: '9999px',
    fontWeight: 500,
  },
  sm: {
    paddingLeft: '0.5rem',
    paddingRight: '0.5rem',
    paddingTop: '0.125rem',
    paddingBottom: '0.125rem',
    fontSize: '10px',
  },
  md: {
    paddingLeft: '0.625rem',
    paddingRight: '0.625rem',
    paddingTop: '0.25rem',
    paddingBottom: '0.25rem',
    fontSize: '0.75rem',
  },
  quiet: {
    backgroundColor: palette.emerald50,
    color: palette.emerald700,
    [DARK]: {
      backgroundColor: 'rgba(2, 44, 34, 0.4)',
      color: palette.emerald300,
    },
  },
  moderate: {
    backgroundColor: palette.amber50,
    color: palette.amber700,
    [DARK]: {
      backgroundColor: 'rgba(69, 26, 3, 0.4)',
      color: palette.amber300,
    },
  },
  busy: {
    backgroundColor: palette.orange50,
    color: palette.orange700,
    [DARK]: {
      backgroundColor: 'rgba(67, 20, 7, 0.4)',
      color: '#fdba74',
    },
  },
  veryBusy: {
    backgroundColor: palette.rose50,
    color: palette.rose700,
    [DARK]: {
      backgroundColor: 'rgba(76, 5, 25, 0.4)',
      color: palette.rose300,
    },
  },
  dotQuiet: { backgroundColor: palette.emerald500 },
  dotModerate: { backgroundColor: palette.amber500 },
  dotBusy: { backgroundColor: palette.orange500 },
  dotVeryBusy: { backgroundColor: palette.rose500 },
  transparent: {
    backgroundColor: 'transparent',
    color: 'inherit',
  },
  breatheDot: {
    marginLeft: '0.125rem',
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: '9999px',
  },
})

/** Small status / tone marker dots. */
export const markerStyles = stylex.create({
  dot: {
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: '9999px',
  },
  dotLg: {
    display: 'inline-block',
    height: '0.5rem',
    width: '0.5rem',
    borderRadius: '9999px',
  },
  dotMargin: { marginRight: '0.375rem' },
  shrink0: { flexShrink: 0 },
  cursorHelp: { cursor: 'help' },
})

/** Inline link treatments shared across concierge + linkified text. */
export const linkStyles = stylex.create({
  rose: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(244, 63, 94, 0.5)',
    textUnderlineOffset: '2px',
    textDecorationThickness: '1px',
    transitionProperty: 'color, text-decoration-color',
    transitionDuration: '150ms',
    ':hover': {
      textDecorationColor: palette.rose500,
      color: '#be123c',
      [DARK]: { color: palette.rose300 },
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineOffset: '2px',
      outlineColor: 'rgba(244, 63, 94, 0.6)',
    },
  },
  roseBreakAll: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-all',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(244, 63, 94, 0.5)',
    textUnderlineOffset: '2px',
    textDecorationThickness: '1px',
    transitionProperty: 'color, text-decoration-color',
    transitionDuration: '150ms',
    ':hover': {
      textDecorationColor: palette.rose500,
      color: '#be123c',
      [DARK]: { color: palette.rose300 },
    },
  },
  stone: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(168, 162, 158, 0.7)',
    textUnderlineOffset: '2px',
    textDecorationThickness: '1px',
    transitionProperty: 'color, text-decoration-color',
    transitionDuration: '150ms',
    ':hover': {
      textDecorationColor: 'currentColor',
      color: palette.stone800,
      [DARK]: { color: palette.stone100 },
    },
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineOffset: '2px',
      outlineColor: palette.stone400,
    },
  },
  stationDashed: {
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textDecorationLine: 'underline',
    textDecorationStyle: 'dashed',
    textDecorationColor: 'rgba(168, 162, 158, 0.6)',
    textUnderlineOffset: '2px',
    transitionProperty: 'color',
    transitionDuration: '150ms',
    ':hover': {
      color: palette.stone900,
      [DARK]: { color: palette.stone100 },
    },
  },
  hashtag: {
    color: palette.stone600,
    [DARK]: { color: palette.stone400 },
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: '0.25rem',
    backgroundColor: palette.stone100,
    paddingLeft: '0.375rem',
    paddingRight: '0.375rem',
    paddingTop: '0.125rem',
    paddingBottom: '0.125rem',
    fontWeight: 500,
    color: palette.stone800,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    transitionProperty: 'color, background-color',
    transitionDuration: '150ms',
    ':hover': {
      backgroundColor: palette.stone200,
      color: palette.stone900,
      [DARK]: {
        backgroundColor: palette.stone800,
        color: palette.stone50,
      },
    },
    [DARK]: {
      backgroundColor: 'rgba(28, 25, 23, 0.6)',
      color: palette.stone200,
    },
  },
})

/** Map mode group ring colors. */
export const mapRingStyles = stylex.create({
  rose: {
    boxShadow: `0 0 0 2px ${palette.rose400}`,
    [DARK]: { boxShadow: `0 0 0 2px ${palette.rose500}` },
  },
  amber: {
    boxShadow: `0 0 0 2px ${palette.amber400}`,
    [DARK]: { boxShadow: `0 0 0 2px ${palette.amber500}` },
  },
  stone: {
    boxShadow: `0 0 0 2px ${palette.stone300}`,
    [DARK]: { boxShadow: `0 0 0 2px ${palette.stone700}` },
  },
})
