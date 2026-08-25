import { Link } from 'react-router-dom'
import { sx } from '@/lib/utils'
import { mutedInkClass, secondaryBtnClass } from './ui'
import { styles } from './trips.stylex'

/** `/:tripId` matches first, so unknown ids never hit the splat 404. */
export function isMissingTripError(message: string): boolean {
  return /trip not found/i.test(message)
}

/** Unknown /trips/* routes: stay inside the planner shell. */
export function TripsNotFound() {
  return (
    <div {...sx(styles.notFoundPage)}>
      <p {...sx(styles.notFoundCode, mutedInkClass)}>404</p>
      <h1 {...sx(styles.notFoundTitle)}>This page is not on the itinerary.</h1>
      <p {...sx(styles.notFoundCopy, mutedInkClass)}>
        The address does not match a trip, day, or editor page.
      </p>
      <Link to="/trips" {...sx(styles.notFoundLink, secondaryBtnClass)}>
        All trips
      </Link>
    </div>
  )
}
