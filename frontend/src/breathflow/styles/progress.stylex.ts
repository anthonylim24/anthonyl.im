import { stylex } from '@/styles/merge'

const WIDE = '@media (min-width: 900px)'

export const pg = stylex.create({
  root: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '60rem',
    paddingTop: { default: '1.5rem', '@media (min-width: 640px)': '2.5rem' },
    paddingBottom: '3rem',
  },
  title: {
    marginTop: '0.6rem',
  },
  stat: {
    marginTop: '1.25rem',
    fontSize: 'clamp(1.15rem, 2.4vw, 1.4rem)',
    lineHeight: 1.45,
    letterSpacing: '-0.01em',
    color: 'var(--bw-text)',
    maxWidth: '40rem',
    textWrap: 'pretty',
  },
  next: {
    marginTop: '0.6rem',
    fontSize: '0.9375rem',
    lineHeight: 1.55,
    color: 'var(--bw-text-secondary)',
    maxWidth: '38rem',
  },
  pair: {
    display: 'grid',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', [WIDE]: 'minmax(0, 1fr) minmax(0, 1fr)' },
    columnGap: '4rem',
  },
  // Empty state
  empty: {
    marginInline: 'auto',
    maxWidth: '34rem',
    paddingTop: '3rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.9rem',
  },
  emptyStroke: {
    display: 'block',
    width: 'min(70vw, 18rem)',
    height: '2.6rem',
    marginBottom: '0.5rem',
    borderRadius: '40% 60% 55% 45% / 60% 40% 60% 40%',
  },
  // Personal bests
  bestRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.85rem',
    paddingBlock: '0.8rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--bw-border-subtle)',
  },
  bestName: {
    flex: '1 1 0%',
    minWidth: 0,
    fontSize: '0.9375rem',
    color: 'var(--bw-text)',
    overflowWrap: 'anywhere',
  },
  bestValue: {
    fontFamily: '"Fraunces", ui-serif, Georgia, serif',
    fontSize: '1.35rem',
    fontVariantNumeric: 'lining-nums tabular-nums',
    color: 'var(--bw-text)',
  },
  dab: {
    flexShrink: 0,
    display: 'block',
    width: '1.15rem',
    height: '1.15rem',
    backgroundColor: 'color-mix(in srgb, var(--bf-dab) 78%, transparent)',
  },
  calm: {
    fontSize: '1rem',
    lineHeight: 1.65,
    color: 'var(--bw-text-secondary)',
    maxWidth: '40rem',
  },
  calmFigure: {
    fontFamily: '"Fraunces", ui-serif, Georgia, serif',
    fontSize: '1.35em',
    fontVariantNumeric: 'lining-nums tabular-nums',
    color: 'var(--bw-text)',
  },
  clear: {
    marginTop: '4rem',
    paddingTop: '1.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--bw-border-subtle)',
  },

  // ── Level ring ───────────────────────────────────────────────────
  level: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  ring: {
    position: 'relative',
    flexShrink: 0,
    width: '8.5rem',
    height: '8.5rem',
  },
  ringNumber: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    fontSize: '3.4rem',
    lineHeight: 1,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'lining-nums',
    color: 'var(--bw-text)',
  },
  levelTitle: {
    fontSize: '1.5rem',
    lineHeight: 1.15,
    color: 'var(--bw-text)',
    overflowWrap: 'anywhere',
  },
  levelXp: {
    marginTop: '0.35rem',
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--bw-text-secondary)',
  },

  // ── Heatmap ──────────────────────────────────────────────────────
  heat: {
    maxWidth: '22rem',
  },
  heatGrid: {
    display: 'grid',
    gridTemplateColumns: '2.25rem repeat(7, minmax(0, 1fr))',
    columnGap: '0.3rem',
    alignItems: 'center',
  },
  heatRows: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '0.3rem',
    marginTop: '0.35rem',
  },
  heatLabel: {
    fontSize: '10px',
    letterSpacing: '0.06em',
    color: 'var(--bw-text-tertiary)',
  },
  heatHead: {
    textAlign: 'center',
  },
  cell: {
    display: 'block',
    marginInline: 'auto',
    width: '100%',
    maxWidth: '1.45rem',
    aspectRatio: '1 / 1',
  },
  cellEmpty: {
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bw-text) 9%, transparent)',
  },
  cell1: { backgroundColor: 'color-mix(in srgb, var(--bf-dab) 40%, transparent)' },
  cell2: { backgroundColor: 'color-mix(in srgb, var(--bf-dab) 66%, transparent)' },
  cell3: { backgroundColor: 'color-mix(in srgb, var(--bf-dab) 90%, transparent)' },
  cellToday: {
    outlineWidth: '1.5px',
    outlineStyle: 'dotted',
    outlineColor: 'color-mix(in srgb, var(--bw-text) 45%, transparent)',
    outlineOffset: '2px',
  },
  heatKey: {
    marginTop: '0.9rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '11px',
    color: 'var(--bw-text-tertiary)',
  },
  keyCell: {
    width: '0.8rem',
    height: '0.8rem',
  },

  // ── Hold chart ───────────────────────────────────────────────────
  chart: {
    display: 'block',
    width: '100%',
    height: '9rem',
    overflow: 'visible',
  },
})
