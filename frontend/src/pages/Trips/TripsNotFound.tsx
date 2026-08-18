import { Link } from "react-router-dom"
import { mutedInkClass, secondaryBtnClass } from "./ui"

/** `/:tripId` matches first, so unknown ids never hit the splat 404. */
export function isMissingTripError(message: string): boolean {
  return /trip not found/i.test(message)
}

/** Unknown /trips/* routes: stay inside the planner shell. */
export function TripsNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className={`text-[13px] font-medium ${mutedInkClass}`}>404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        This page is not on the itinerary.
      </h1>
      <p className={`mt-3 max-w-prose text-sm leading-relaxed ${mutedInkClass}`}>
        The address does not match a trip, day, or editor page.
      </p>
      <Link to="/trips" className={`mt-6 ${secondaryBtnClass}`}>
        All trips
      </Link>
    </div>
  )
}
