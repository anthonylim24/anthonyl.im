import { stylex } from '@/styles/merge'

const focusRing = {
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColor: 'var(--bw-accent)',
  outlineOffset: '3px',
} as const

const WIDE = '@media (min-width: 960px)'

export const ss = stylex.create({
  // ── Setup ────────────────────────────────────────────────────────
  setup: {
    display: 'grid',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', [WIDE]: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' },
    columnGap: '3.5rem',
    rowGap: '0.5rem',
    alignItems: 'start',
    paddingBottom: '2rem',
  },
  setupStage: {
    position: { default: 'relative', [WIDE]: 'sticky' },
    top: { default: 'auto', [WIDE]: '1.5rem' },
    justifySelf: 'center',
    width: { default: 'min(78vw, 22rem)', [WIDE]: '100%' },
  },
  setupStageInner: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
  },
  setupCanvas: {
    top: '-16%',
    bottom: '-16%',
    left: '-16%',
    right: '-16%',
    maskImage: 'radial-gradient(closest-side, #000 60%, transparent 100%)',
  },
  setupAnchorWrap: {
    position: 'absolute',
    inset: 0,
  },
  setupCaption: {
    position: 'relative',
    marginTop: '0.25rem',
    textAlign: 'center',
    fontSize: '0.8rem',
    color: 'var(--bw-text-tertiary)',
  },
  setupPanel: {
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  setupTitle: {
    marginTop: '0.5rem',
  },
  palette: {
    marginTop: '1.5rem',
    display: 'grid',
    gap: '0.35rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 640px) and (max-width: 959px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  paletteBtn: {
    position: 'relative',
    isolation: 'isolate',
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    minHeight: '52px',
    paddingInline: '0.65rem',
    paddingBlock: '0.45rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    borderRadius: '1rem',
    transitionProperty: 'color, background-color',
    transitionDuration: '200ms',
    ':focus-visible': focusRing,
  },
  paletteBtnActive: {
    fontWeight: 500,
    color: 'var(--bw-text)',
  },
  paletteBtnIdle: {
    color: 'var(--bw-text-secondary)',
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        color: 'var(--bw-text)',
        backgroundColor: 'var(--bw-hover)',
      },
    },
  },
  paletteInk: {
    position: 'absolute',
    inset: 0,
    zIndex: -1,
    borderRadius: '1rem',
    backgroundColor: 'color-mix(in srgb, var(--bf-mass) 13%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bf-mass) 34%, transparent)',
  },
  paletteDab: {
    position: 'relative',
    display: 'block',
    flexShrink: 0,
    width: '1.4rem',
    height: '1.4rem',
    backgroundImage:
      'radial-gradient(circle at 40% 34%, color-mix(in srgb, var(--bf-glaze) 55%, transparent) 0 24%, color-mix(in srgb, var(--bf-mass) 82%, transparent) 72%)',
  },
  detail: {
    marginTop: '2rem',
    paddingTop: '1.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--bw-border)',
  },
  protocolName: {
    fontSize: 'clamp(1.6rem, 3vw, 2.15rem)',
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
    color: 'var(--bw-text)',
  },
  planned: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontSize: '1.15rem',
    color: 'var(--bw-text-secondary)',
  },

  // ── Active session ───────────────────────────────────────────────
  fullscreen: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'var(--bw-canvas)',
  },
  top: {
    position: 'relative',
    zIndex: 1,
    paddingInline: '1.5rem',
    textAlign: 'center',
  },
  round: {
    fontSize: '1rem',
    color: 'var(--bw-text-secondary)',
  },
  centre: {
    position: 'relative',
    zIndex: 1,
    flex: '1 1 0%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    paddingInline: '1.5rem',
  },
  bloomBtn: {
    display: 'block',
    width: 'min(84vw, 56svh, 32rem)',
    padding: 0,
    borderWidth: 0,
    borderRadius: '50%',
    backgroundColor: 'transparent',
    cursor: 'default',
    WebkitTapHighlightColor: 'transparent',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: 'var(--bw-accent)',
      outlineOffset: '6px',
    },
  },
  count: {
    fontSize: 'clamp(3.5rem, 11vmin, 6.5rem)',
    fontWeight: 300,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'lining-nums tabular-nums',
    color: 'var(--bw-text)',
    textShadow: '0 0 30px color-mix(in srgb, var(--bw-canvas) 92%, transparent), 0 0 12px color-mix(in srgb, var(--bw-canvas) 70%, transparent)',
  },
  phaseBlock: {
    minHeight: '5.75rem',
    textAlign: 'center',
  },
  phaseWord: {
    fontSize: 'clamp(2.1rem, 6vmin, 3.2rem)',
    lineHeight: 1.1,
    color: 'var(--bw-text)',
  },
  dockWrap: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  dock: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    width: 'min(calc(100% - 2rem), 25rem)',
    padding: '0.35rem',
    borderRadius: '999px',
    backgroundColor: 'color-mix(in srgb, var(--bw-surface) 78%, transparent)',
    backdropFilter: 'blur(12px)',
    boxShadow: 'inset 0 0 0 1px var(--bw-border-subtle), 0 18px 40px -24px rgba(0, 0, 0, 0.35)',
  },
  keyHint: {
    marginTop: '0.5rem',
    fontSize: '11px',
    color: 'var(--bw-text-tertiary)',
    display: { default: 'none', '@media (hover: hover) and (pointer: fine)': 'block' },
  },

  // ── Summary ──────────────────────────────────────────────────────
  summaryWrap: {
    position: 'relative',
    paddingTop: '1.5rem',
    paddingBottom: '1.5rem',
  },
})
