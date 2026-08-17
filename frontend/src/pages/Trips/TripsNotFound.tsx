import { Link } from "react-router-dom"
import { mutedInkClass, secondaryBtnClass, SERIF } from "./ui"

/** Unknown /trips/* routes: stay inside the planner shell. */
export function TripsNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="font-mono-trips text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
        404
      </p>
      <h1
        className="mt-3 font-display text-3xl tracking-tight text-stone-900 dark:text-stone-100"
        style={SERIF}
      >
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
