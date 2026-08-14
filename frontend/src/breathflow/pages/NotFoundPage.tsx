import { Link } from 'react-router-dom'
import { btnPrimary, btnSecondary } from '../components/buttonStyles'

/** Unknown /breathwork/* routes: point back to Home or straight into a session. */
export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-4 pt-14">
      <p className="text-sm text-bw-tertiary">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-bw">
        This page took a breath and left.
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-bw-secondary">
        The address does not match anything in BreathFlow.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link to="/breathwork" className={btnSecondary}>
          Home
        </Link>
        <Link to="/breathwork/session" className={btnPrimary}>
          Start a session
        </Link>
      </div>
    </div>
  )
}
