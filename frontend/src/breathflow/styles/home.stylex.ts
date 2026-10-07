import { stylex } from '@/styles/merge'

const focusRing = {
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColor: 'var(--bw-accent)',
  outlineOffset: '3px',
} as const

const DESKTOP = '@media (min-width: 900px)'

export const home = stylex.create({
  hero: {
    position: 'relative',
    paddingTop: { default: '0.5rem', [DESKTOP]: '1.5rem' },
    paddingBottom: '1.5rem',
    minHeight: { default: 'auto', [DESKTOP]: 'min(calc(100svh - 5rem), 46rem)' },
    display: 'flex',
    alignItems: 'center',
  },
  heroCanvas: {
    top: '-4.5rem',
    bottom: '-3rem',
    left: '50%',
    right: 'auto',
    width: '100vw',
    marginLeft: '-50vw',
    maskImage: 'linear-gradient(to bottom, #000 0%, #000 74%, transparent 100%)',
  },
  heroGrid: {
    position: 'relative',
    width: '100%',
    display: 'grid',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', [DESKTOP]: 'minmax(0, 1.05fr) minmax(0, 0.95fr)' },
    columnGap: '3rem',
    rowGap: '0.5rem',
    alignItems: 'center',
  },
  heroCopy: {
    position: 'relative',
    zIndex: 1,
    minWidth: 0,
  },
  heroBloom: {
    position: 'relative',
    zIndex: 1,
    order: { default: -1, [DESKTOP]: 0 },
    justifySelf: 'center',
    width: { default: 'min(80vw, 21rem)', [DESKTOP]: 'min(100%, 34rem)' },
  },
  greeting: {
    marginTop: '0.75rem',
  },
  greetingDot: {
    color: 'var(--bf-mass)',
  },
  lede: {
    marginTop: '1rem',
  },
  streakRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: '1.5rem',
    rowGap: '0.75rem',
  },
  choosers: {
    marginTop: '1.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
  },
  recommended: {
    marginTop: '1.75rem',
    padding: { default: '1.25rem', '@media (min-width: 640px)': '1.6rem' },
    borderRadius: '1.6rem',
    backgroundColor: 'color-mix(in srgb, var(--bw-surface) 72%, transparent)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle), 0 24px 60px -36px rgba(39, 35, 31, 0.35)',
  },
  recTitleRow: {
    marginTop: '0.45rem',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: '1rem',
    rowGap: '0.25rem',
  },
  recTitle: {
    fontSize: 'clamp(1.65rem, 3.2vw, 2.2rem)',
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
    color: 'var(--bw-text)',
  },
  recPurpose: {
    marginTop: '0.6rem',
    maxWidth: '34rem',
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: 'var(--bw-text-secondary)',
  },
  actions: {
    marginTop: '1.4rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.6rem',
  },
  beginBtn: {
    minWidth: '9.5rem',
  },
  hint: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'center',
    gap: '0.6rem',
    fontSize: '0.75rem',
    color: 'var(--bw-text-tertiary)',
  },
  hintFine: {
    display: { default: 'none', '@media (hover: hover) and (pointer: fine)': 'inline' },
  },
  hintTouch: {
    display: { default: 'inline', '@media (hover: hover) and (pointer: fine)': 'none' },
  },
  hintPigment: {
    fontFamily: '"Fraunces", ui-serif, Georgia, serif',
  },

  // ── Alternatives / recent ────────────────────────────────────────
  altList: {
    display: 'grid',
    gap: '0.5rem',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', '@media (min-width: 760px)': 'repeat(2, minmax(0, 1fr))' },
  },
  altRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    minHeight: '64px',
    paddingBlock: '0.75rem',
    paddingInline: '0.9rem',
    borderRadius: '1.1rem',
    color: 'var(--bw-text)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle)',
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: '200ms',
    ':hover': { backgroundColor: 'var(--bw-hover)' },
    ':focus-visible': focusRing,
  },
  altSwatch: {
    display: 'block',
    flexShrink: 0,
    width: '3.6rem',
    height: '2.4rem',
    borderRadius: '0.45rem',
  },
  altName: {
    display: 'block',
    fontSize: '1.15rem',
    lineHeight: 1.2,
    color: 'var(--bw-text)',
  },
  recentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  recentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.9rem',
    minHeight: '56px',
    paddingBlock: '0.55rem',
    paddingInline: '0.75rem',
    borderRadius: '1rem',
    transitionProperty: 'background-color',
    transitionDuration: '200ms',
    ':hover': { backgroundColor: 'var(--bw-hover)' },
    ':focus-visible': focusRing,
  },
  recentDab: {
    display: 'block',
    flexShrink: 0,
    width: '1.15rem',
    height: '1.15rem',
    backgroundColor: 'color-mix(in srgb, var(--bf-mass) 72%, transparent)',
  },

  // ── Paint box ────────────────────────────────────────────────────
  paintbox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2.5rem',
  },
  category: {},
  categoryLabel: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: '0.75rem',
    marginBottom: '0.9rem',
  },
  categoryName: {
    fontSize: '1.4rem',
    color: 'var(--bw-text)',
  },
  swatchGrid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 640px) and (max-width: 999px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1000px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  swatchCard: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    paddingTop: '0.9rem',
    paddingInline: '1rem',
    paddingBottom: '1.1rem',
    borderRadius: '1.2rem',
    color: 'var(--bw-text)',
    backgroundColor: 'color-mix(in srgb, var(--bw-surface) 58%, transparent)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle)',
    transitionProperty: 'box-shadow, background-color',
    transitionDuration: '240ms',
    ':hover': {
      backgroundColor: 'color-mix(in srgb, var(--bw-surface) 90%, transparent)',
      boxShadow: 'inset 0 0 0 1px var(--bw-border), 0 18px 40px -28px rgba(39, 35, 31, 0.4)',
    },
    ':focus-visible': focusRing,
  },
  swatchPaint: {
    display: 'block',
    height: '3.4rem',
    marginBottom: '0.85rem',
    borderRadius: '0.5rem',
  },
  swatchTitleRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  swatchName: {
    fontSize: '1.22rem',
    lineHeight: 1.15,
  },
  safetyFlag: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    paddingInline: '0.5rem',
    paddingBlock: '0.1rem',
    borderRadius: '999px',
    fontSize: '11px',
    color: 'var(--bw-text-secondary)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border)',
  },
  swatchPigment: {
    marginTop: '0.1rem',
    fontFamily: '"Fraunces", ui-serif, Georgia, serif',
    fontSize: '0.85rem',
    color: 'var(--bw-text-tertiary)',
  },
  swatchMeta: {
    marginTop: '0.45rem',
    fontSize: '0.85rem',
    lineHeight: 1.5,
    color: 'var(--bw-text-secondary)',
  },
  swatchEvidence: {
    marginTop: 'auto',
    paddingTop: '0.6rem',
    fontSize: '11px',
    color: 'var(--bw-text-tertiary)',
  },

  // ── Week dabs ────────────────────────────────────────────────────
  week: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.4rem',
  },
  weekDay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.2rem',
  },
  weekDab: {
    display: 'block',
    width: '1.1rem',
    height: '1.1rem',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bw-text) 20%, transparent)',
  },
  weekDabDone: {
    backgroundColor: 'color-mix(in srgb, var(--bf-mass) 70%, transparent)',
    boxShadow: 'none',
  },
  weekLabel: {
    fontSize: '10px',
    color: 'var(--bw-text-tertiary)',
  },
})
