import * as stylex from '@stylexjs/stylex'
/** shadcn dialog primitives. */
export const dialog = stylex.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  content: {
    position: 'fixed',
    left: '50%',
    top: '50%',
    zIndex: 50,
    display: 'grid',
    width: 'calc(100vw - 2rem)',
    maxWidth: '32rem',
    transform: 'translate(-50%, -50%)',
    gap: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'hsl(var(--border))',
    backgroundColor: 'hsl(var(--background))',
    padding: '1.5rem',
    transitionDuration: '200ms',
    boxShadow: '0 8px 24px -12px rgba(28,25,23,0.18)',
    '@media (min-width: 640px)': {
      borderRadius: '0.5rem',
    },
  },
  close: {
    position: 'absolute',
    right: '1rem',
    top: '1rem',
    borderRadius: '0.125rem',
    opacity: 0.7,
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
    ':focus': {
      outline: 'none',
    },
    ':focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 2px ${'hsl(var(--ring))'}, 0 0 0 4px ${'hsl(var(--background))'}`,
    },
    ':disabled': {
      pointerEvents: 'none',
    },
    '@media (hover: hover) and (pointer: fine)': {
      ':hover': {
        opacity: 1,
      },
    },
    ':is([data-state="open"])': {
      backgroundColor: 'hsl(var(--accent))',
      color: 'hsl(var(--muted-foreground))',
    },
  },
  closeIcon: {
    width: '1rem',
    height: '1rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    textAlign: 'center',
    '@media (min-width: 640px)': {
      textAlign: 'left',
    },
  },
  footer: {
    display: 'flex',
    flexDirection: 'column-reverse',
    '@media (min-width: 640px)': {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: '0.5rem',
    },
  },
  title: {
    fontSize: '1.125rem',
    fontWeight: 600,
    lineHeight: 1,
    letterSpacing: '-0.025em',
  },
  description: {
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    color: 'hsl(var(--muted-foreground))',
  },
})

export const input = stylex.create({
  root: {
    display: 'flex',
    height: '2.25rem',
    width: '100%',
    borderRadius: '0.375rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'hsl(var(--input))',
    backgroundColor: 'transparent',
    paddingLeft: '0.75rem',
    paddingRight: '0.75rem',
    paddingTop: '0.25rem',
    paddingBottom: '0.25rem',
    fontSize: '1rem',
    lineHeight: '1.5rem',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
    transitionDuration: '150ms',
    ':focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 1px ${'hsl(var(--ring))'}`,
    },
    ':disabled': {
      cursor: 'not-allowed',
      opacity: 0.5,
    },
    '::placeholder': {
      color: 'hsl(var(--muted-foreground))',
    },
    '::file-selector-button': {
      borderWidth: 0,
      backgroundColor: 'transparent',
      fontSize: '0.875rem',
      fontWeight: 500,
      color: 'hsl(var(--foreground))',
    },
    '@media (min-width: 768px)': {
      fontSize: '0.875rem',
      lineHeight: '1.25rem',
    },
  },
})

export const progress = stylex.create({
  root: {
    position: 'relative',
    height: '0.5rem',
    width: '100%',
    overflow: 'hidden',
    borderRadius: '9999px',
    backgroundColor: `color-mix(in srgb, ${'hsl(var(--primary))'} 20%, transparent)`,
  },
  indicator: {
    height: '100%',
    width: '100%',
    flex: '1 1 0%',
    backgroundColor: 'hsl(var(--primary))',
    transitionProperty: 'all',
    transitionDuration: '150ms',
  },
})

export const tabs = stylex.create({
  list: {
    display: 'inline-flex',
    height: '2.25rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.5rem',
    backgroundColor: 'hsl(var(--muted))',
    padding: '0.25rem',
    color: 'hsl(var(--muted-foreground))',
  },
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    borderRadius: '0.375rem',
    paddingLeft: '0.75rem',
    paddingRight: '0.75rem',
    paddingTop: '0.25rem',
    paddingBottom: '0.25rem',
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    fontWeight: 500,
    transitionProperty: 'all',
    transitionDuration: '150ms',
    ':focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 2px ${'hsl(var(--ring))'}, 0 0 0 4px ${'hsl(var(--background))'}`,
    },
    ':disabled': {
      pointerEvents: 'none',
      opacity: 0.5,
    },
    ':is([data-state="active"])': {
      backgroundColor: 'hsl(var(--background))',
      color: 'hsl(var(--foreground))',
      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    },
  },
  content: {
    marginTop: '0.5rem',
    ':focus-visible': {
      outline: 'none',
      boxShadow: `0 0 0 2px ${'hsl(var(--ring))'}, 0 0 0 4px ${'hsl(var(--background))'}`,
    },
  },
})

export const statNumeral = stylex.create({
  numeralSm: {
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    paddingBottom: '0.125rem',
  },
  numeralMd: {
    fontSize: '1.5rem',
    lineHeight: '2rem',
    paddingBottom: '0.25rem',
  },
  numeralLg: {
    fontSize: '2.25rem',
    lineHeight: '2.5rem',
    paddingBottom: '0.375rem',
    '@media (min-width: 768px)': {
      fontSize: '3rem',
      lineHeight: 1,
    },
  },
  numeralBase: {
    display: 'inline-block',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontWeight: 400,
    fontVariantNumeric: 'tabular-nums',
    fontFeatureSettings: '"tnum"',
    lineHeight: 1,
  },
  numeralBorder: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
  },
  toneDefault: {
    color: 'var(--bw-text)',
  },
  toneSage: {
    color: 'var(--bw-success)',
  },
  borderAccent: {
    borderBottomColor: 'var(--bw-accent)',
  },
  unitSm: {
    fontSize: '10px',
  },
  unitMd: {
    fontSize: '10px',
  },
  unitLg: {
    fontSize: '0.75rem',
    lineHeight: '1rem',
  },
  unitBase: {
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--bw-text-tertiary)',
  },
  label: {
    display: 'block',
    fontSize: '10px',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: 'var(--bw-text-secondary)',
  },
  labelEnd: {
    textAlign: 'right',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
  },
  rowStart: {
    justifyContent: 'flex-start',
  },
  rowEnd: {
    justifyContent: 'flex-end',
  },
  inlineWrap: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '0.75rem',
  },
  labelInline: {
    display: 'inline-block',
  },
  blockEnd: {
    textAlign: 'right',
  },
  rowBlock: {
    display: 'block',
  },
  rowBlockSpaced: {
    display: 'block',
    marginTop: '0.375rem',
  },
})
