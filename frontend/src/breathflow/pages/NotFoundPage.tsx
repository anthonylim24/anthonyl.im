import { Link } from 'react-router-dom'
import { sx } from '@/styles/merge'
import { bf } from '../styles/breathflow.stylex'
import { btn } from '../components/buttonStyles.stylex'

/** Unknown /breathwork/* routes: point back to Home or straight into a session. */
export function NotFoundPage() {
  return (
    <div {...sx(bf.flexColStart, bf.pt14)}>
      <p {...sx(bf.textSm, bf.textTertiary)}>404</p>
      <h1 {...sx('bf-display', bf.text3xl, bf.trackingTight, bf.textBw)}>
        This page took a breath and left.
      </h1>
      <p {...sx(bf.maxWSm, bf.textSm, bf.leadingRelaxed, bf.textSecondary)}>
        The address does not match anything in BreathFlow.
      </p>
      <div {...sx(bf.mt2, bf.flexWrapGap2)}>
        <Link to="/breathwork" {...sx(btn.base, btn.secondary)}>
          Home
        </Link>
        <Link to="/breathwork/session" {...sx(btn.base, btn.primary)}>
          Start a session
        </Link>
      </div>
    </div>
  )
}
