import { stylex } from '@/styles/merge'

const focusRing = {
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColor: 'var(--bw-accent)',
  outlineOffset: '3px',
} as const

const SPRING = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** Watercolour BreathFlow: paper layout, painted surfaces, bloom stage. */
export const wc = stylex.create({
  root: {
    overflowX: 'clip',
    isolation: 'isolate',
  },
  hidden: { opacity: 0 },

  // ── Chrome ───────────────────────────────────────────────────────
  header: {
    position: 'relative',
    zIndex: 3,
    marginInline: 'auto',
    display: 'flex',
    height: '4.5rem',
    width: '100%',
    maxWidth: '72rem',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: { default: '1.25rem', '@media (min-width: 640px)': '2rem' },
  },
  brand: {
    display: 'inline-flex',
    minHeight: '44px',
    alignItems: 'center',
    gap: '0.6rem',
    borderRadius: '999px',
    color: 'var(--bw-text)',
    ':focus-visible': focusRing,
  },
  brandDot: {
    display: 'block',
    width: '1.15rem',
    height: '1.15rem',
    borderRadius: '50%',
    backgroundImage:
      'radial-gradient(circle at 38% 34%, color-mix(in srgb, #7D4FA3 30%, transparent) 0 30%, color-mix(in srgb, #7D4FA3 72%, transparent) 64%, color-mix(in srgb, #2B3A5E 85%, transparent) 72%, transparent 74%)',
  },
  brandWord: {
    fontSize: '1.3rem',
    fontWeight: 450,
    letterSpacing: '-0.015em',
  },
  desktopNav: {
    display: { default: 'none', '@media (min-width: 640px)': 'flex' },
    alignItems: 'center',
    gap: '0.35rem',
  },
  navLink: {
    position: 'relative',
    isolation: 'isolate',
    display: 'inline-flex',
    minHeight: '44px',
    alignItems: 'center',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    borderRadius: '999px',
    transitionProperty: 'color',
    transitionDuration: '200ms',
    ':focus-visible': focusRing,
  },
  navLinkActive: {
    color: 'var(--bw-text)',
    fontWeight: 500,
  },
  navLinkIdle: {
    color: 'var(--bw-text-secondary)',
    ':hover': { color: 'var(--bw-text)' },
  },
  // No z-index here: the fixed session view must stack above the header.
  main: {
    position: 'relative',
    marginInline: 'auto',
    width: '100%',
    maxWidth: '72rem',
    paddingInline: { default: '1.25rem', '@media (min-width: 640px)': '2rem' },
    paddingTop: '0.25rem',
    paddingBottom: { default: '7.5rem', '@media (min-width: 640px)': '5rem' },
  },
  mobileNav: {
    position: 'fixed',
    left: '0.75rem',
    right: '0.75rem',
    bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
    zIndex: 40,
    display: { default: 'block', '@media (min-width: 640px)': 'none' },
    borderRadius: '999px',
    backgroundColor: 'color-mix(in srgb, var(--bw-nav-bg-mobile) 88%, transparent)',
    backdropFilter: 'blur(14px) saturate(1.1)',
    boxShadow: '0 10px 30px rgba(39, 35, 31, 0.10), inset 0 0 0 1px var(--bw-nav-border)',
  },
  mobileNavInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.3rem',
  },
  mobileLink: {
    position: 'relative',
    isolation: 'isolate',
    display: 'flex',
    flex: '1 1 0%',
    minHeight: '46px',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    fontSize: '0.8125rem',
    ':focus-visible': focusRing,
  },
  mobileInk: {
    position: 'absolute',
    top: '0.2rem',
    bottom: '0.2rem',
    left: '0.15rem',
    right: '0.15rem',
    zIndex: -1,
    borderRadius: '999px',
    backgroundColor: 'color-mix(in srgb, var(--bw-accent) 15%, transparent)',
  },

  // ── Page columns & type ──────────────────────────────────────────
  column: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '46rem',
  },
  eyebrow: {
    fontSize: '0.75rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'var(--bw-text-tertiary)',
  },
  pageTitle: {
    fontSize: 'clamp(2.6rem, 7vw, 4.25rem)',
    lineHeight: 1,
    letterSpacing: '-0.025em',
    fontWeight: 350,
    color: 'var(--bw-text)',
    textWrap: 'balance',
  },
  sectionTitle: {
    fontSize: 'clamp(1.5rem, 3.4vw, 2rem)',
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    fontWeight: 400,
    color: 'var(--bw-text)',
  },
  italic: {
    fontStyle: 'italic',
    fontVariationSettings: '"SOFT" 100, "WONK" 1',
  },
  lede: {
    fontSize: '1.0625rem',
    lineHeight: 1.6,
    color: 'var(--bw-text-secondary)',
    maxWidth: '34rem',
    textWrap: 'pretty',
  },
  section: {
    marginTop: { default: '3.5rem', '@media (min-width: 640px)': '4.5rem' },
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
    marginBottom: '1.25rem',
  },
  rule: {
    height: '1px',
    borderWidth: 0,
    backgroundImage: 'linear-gradient(90deg, transparent, var(--bw-border) 12%, var(--bw-border) 88%, transparent)',
  },

  // ── Bloom stage ──────────────────────────────────────────────────
  bloomHost: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    opacity: 0,
    transitionProperty: 'opacity',
    transitionDuration: '1100ms',
    transitionTimingFunction: SPRING,
  },
  bloomHostLive: { opacity: 1 },
  anchor: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
  },
  anchorCentre: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  strokeSvg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
  },
  strokeGuide: {
    fill: 'none',
    stroke: 'color-mix(in srgb, var(--bw-text) 16%, transparent)',
    strokeWidth: '0.6',
    strokeDasharray: '0.4 2.6',
    strokeLinecap: 'round',
  },
  strokePaint: {
    fill: 'none',
    stroke: 'var(--bf-stroke-ink)',
    strokeWidth: '3.6',
    strokeLinecap: 'round',
    strokeDasharray: '1',
    strokeDashoffset: '1',
  },
})
