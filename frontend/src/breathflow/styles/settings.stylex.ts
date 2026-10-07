import { stylex } from '@/styles/merge'

export const st = stylex.create({
  root: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '44rem',
    paddingTop: { default: '1.5rem', '@media (min-width: 640px)': '2.5rem' },
    paddingBottom: '3rem',
  },
  title: { marginTop: '0.6rem' },
  lede: { marginTop: '1rem' },
  section: {
    marginTop: '3rem',
    paddingTop: '1.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--bw-border-subtle)',
    display: 'grid',
    gridTemplateColumns: { default: 'minmax(0, 1fr)', '@media (min-width: 720px)': '11rem minmax(0, 1fr)' },
    columnGap: '2rem',
    rowGap: '1rem',
  },
  sectionTitle: {
    fontSize: '1.45rem',
    lineHeight: 1.15,
    letterSpacing: '-0.015em',
    color: 'var(--bw-text)',
  },
  body: { minWidth: 0 },
  label: {
    fontSize: '0.9375rem',
    color: 'var(--bw-text)',
  },
  hint: {
    marginTop: '0.15rem',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--bw-text-secondary)',
  },
  // Toggle track: a dilute wash off, a loaded brush on.
  trackOff: {
    backgroundColor: 'color-mix(in srgb, var(--bw-text) 12%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bw-text) 8%, transparent)',
  },
  trackOn: {
    backgroundColor: 'color-mix(in oklab, var(--bw-accent), var(--bf-btn-base) 18%)',
    backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.22), transparent 60%)',
    boxShadow: 'inset 0 -2px 4px rgba(0, 0, 0, 0.18)',
  },
  thumb: {
    backgroundColor: 'var(--bw-surface)',
    boxShadow: '0 1px 3px rgba(39, 35, 31, 0.3)',
  },
  // Pigment chooser
  pigments: {
    marginTop: '1rem',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(6.25rem, 1fr))',
    gap: '0.4rem',
  },
  pigmentBtn: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.45rem',
    minHeight: '44px',
    paddingTop: '0.8rem',
    paddingBottom: '0.6rem',
    paddingInline: '0.4rem',
    borderRadius: '1.1rem',
    color: 'var(--bw-text-secondary)',
    transitionProperty: 'background-color, color, transform',
    transitionDuration: '200ms',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: 'var(--bw-accent)',
      outlineOffset: '2px',
    },
    ':disabled': { cursor: 'not-allowed' },
    '@media (hover: hover) and (pointer: fine)': {
      ':hover:not(:disabled)': { backgroundColor: 'var(--bw-hover)', color: 'var(--bw-text)' },
    },
    ':active:not(:disabled)': { transform: 'scale(0.97)' },
  },
  pigmentBtnSelected: {
    color: 'var(--bw-text)',
    backgroundColor: 'color-mix(in srgb, var(--bf-mass) 11%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--bf-mass) 32%, transparent)',
  },
  chip: {
    position: 'relative',
    display: 'block',
    width: '3rem',
    height: '3rem',
    backgroundImage:
      'radial-gradient(circle at 38% 32%, color-mix(in srgb, var(--bf-glaze) 70%, transparent) 0 22%, color-mix(in srgb, var(--bf-mass) 60%, transparent) 58%, color-mix(in srgb, var(--bf-mass) 88%, transparent) 76%, color-mix(in srgb, var(--bf-mass) 30%, transparent) 100%)',
  },
  chipLocked: {
    display: 'grid',
    placeItems: 'center',
    backgroundImage: 'none',
    boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--bw-text) 16%, transparent)',
    color: 'var(--bw-text-tertiary)',
  },
  // Default: a little cluster of the technique pigments.
  cluster: {
    position: 'relative',
    display: 'block',
    width: '3rem',
    height: '3rem',
  },
  clusterDab: {
    position: 'absolute',
    width: '1.85rem',
    height: '1.85rem',
    backgroundColor: 'color-mix(in srgb, var(--bf-dab) 72%, transparent)',
  },
  pigmentName: {
    fontSize: '0.8125rem',
    fontWeight: 500,
    lineHeight: 1.2,
  },
  pigmentMeta: {
    fontSize: '11px',
    lineHeight: 1.2,
    color: 'var(--bw-text-tertiary)',
  },
  safetyList: {
    marginTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  safetyItem: {
    display: 'flex',
    gap: '0.7rem',
    fontSize: '0.875rem',
    lineHeight: 1.55,
    color: 'var(--bw-text-secondary)',
  },
  safetyDab: {
    flexShrink: 0,
    marginTop: '0.4rem',
    width: '0.55rem',
    height: '0.55rem',
    backgroundColor: 'color-mix(in srgb, var(--bw-accent) 55%, transparent)',
  },
  credit: {
    marginTop: '4rem',
    fontSize: '0.75rem',
    lineHeight: 1.6,
    color: 'var(--bw-text-tertiary)',
  },
  creditLink: {
    color: 'var(--bw-text-secondary)',
    textDecorationLine: 'underline',
    textDecorationColor: 'var(--bw-border)',
    textUnderlineOffset: '3px',
    ':focus-visible': {
      outlineWidth: '2px',
      outlineStyle: 'solid',
      outlineColor: 'var(--bw-accent)',
      outlineOffset: '2px',
    },
  },
})
