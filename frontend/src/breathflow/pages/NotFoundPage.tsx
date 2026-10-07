import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { sx, stylex } from '@/styles/merge'
import { TECHNIQUE_IDS } from '@/lib/constants'
import { btn } from '../components/buttonStyles.stylex'
import { PaintSplash } from '../components/PaintSplash'
import { techniquePigment } from '../pigments'
import { useReducedMotion } from '../platform/useReducedMotion'
import { wc } from '../styles/watercolor.stylex'

const styles = stylex.create({
  root: {
    position: 'relative',
    marginInline: 'auto',
    maxWidth: '32rem',
    paddingTop: '16rem',
    paddingBottom: '3rem',
    textAlign: 'center',
  },
  copy: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.9rem',
  },
  code: {
    fontSize: '0.8125rem',
    letterSpacing: '0.2em',
    color: 'var(--bw-text-tertiary)',
  },
  actions: {
    marginTop: '0.75rem',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.5rem',
  },
})

const PIGMENT = techniquePigment(TECHNIQUE_IDS.FOUR_SEVEN_EIGHT)

/** Unknown /breathwork/* routes: an ink spill, then Home or straight into a session. */
export function NotFoundPage() {
  const reducedMotion = useReducedMotion()
  const vars = { '--bf-mass': PIGMENT.mass, '--bf-glaze': PIGMENT.glaze, '--bf-ink': PIGMENT.mass } as CSSProperties
  return (
    <div {...sx(styles.root)} style={vars}>
      <PaintSplash pigment={PIGMENT} big={false} reducedMotion={reducedMotion} />
      <div {...sx(styles.copy)}>
        <p {...sx(styles.code)}>404</p>
        <h1 {...sx('bf-display', wc.pageTitle)}>
          This page took a breath <span {...sx(wc.italic)}>and left.</span>
        </h1>
        <p {...sx(wc.lede)}>The address does not match anything in BreathFlow.</p>
        <div {...sx(styles.actions)}>
          <Link to="/breathwork" {...sx(btn.base, btn.secondary)}>
            Home
          </Link>
          <Link to="/breathwork/session" {...sx(btn.base, btn.primary)}>
            Start a session
          </Link>
        </div>
      </div>
    </div>
  )
}
