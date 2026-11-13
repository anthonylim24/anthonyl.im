import { Link } from "react-router-dom"
import { sx } from "@/styles/merge"
import { a } from "./atlas.stylex"
import { shell as s } from "./index.stylex"

/** `/:tripId` matches first, so unknown ids never hit the splat 404. */
export function isMissingTripError(message: string): boolean {
  return /trip not found|forbidden|HTTP 40[34]/i.test(message)
}

/** Unknown /trips/* routes: stay inside the planner shell. */
export function TripsNotFound() {
  return (
    <div {...sx(s.gate)}>
      <div {...sx(s.gateInner)}>
        <p {...sx(a.eyebrow)}>404 · Off the map</p>
        <h1 {...sx(a.display, s.gateTitle)}>
          Here be <span {...sx(a.italic)}>dragons.</span>
        </h1>
        <p {...sx(a.body)}>
          This address doesn’t match a trip you can open. It may have been deleted, or shared with a different account.
        </p>
        <Link to="/trips" {...sx(a.btn, a.btnPrimary)}>
          Back to all trips
        </Link>
      </div>
    </div>
  )
}
