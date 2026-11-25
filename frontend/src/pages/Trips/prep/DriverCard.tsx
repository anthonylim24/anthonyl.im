import { useId } from "react"
import { Navigation } from "lucide-react"
import { sx } from "@/styles/merge"
import { directionsLink } from "@/lib/externalMaps"
import { a } from "../atlas.stylex"
import { formatTripDate } from "../meta"
import type { Stay } from "./tonight"
import { prep as p } from "./prep.stylex"

/**
 * Tonight's place to sleep in type large enough to hold up to a taxi
 * window: the name in the serif, the address under it, and directions.
 */
export function DriverCard({ stay, timezone }: { stay: Stay; timezone: string }) {
  const titleId = useId()
  // From wherever the phone is; a taxi ride, so by road.
  const maps = directionsLink({
    destination: { name: stay.name, address: stay.address ?? undefined, lat: stay.lat ?? undefined, lng: stay.lng ?? undefined },
    mode: "drive",
  })
  return (
    <section {...sx(p.driver)} aria-labelledby={titleId}>
      <p {...sx(a.eyebrow)}>
        <span id={titleId}>Show to a driver</span>
        <span aria-hidden> · </span>
        <span>{stay.when === "tonight" ? "Tonight" : `First night · ${formatTripDate(stay.date, timezone)}`}</span>
      </p>
      <p {...sx(a.display, a.wrapName, p.driverName)}>{stay.name}</p>
      {stay.address ? (
        <p {...sx(a.wrap, p.driverAddress)}>{stay.address}</p>
      ) : (
        <p {...sx(a.small)}>No address on this booking yet.</p>
      )}
      {maps && (
        <div>
          <a href={maps.href} target="_blank" rel="noreferrer" aria-label={maps.label} {...sx(a.btn, a.btnSecondary)}>
            <Navigation size={16} strokeWidth={1.75} aria-hidden />
            Directions
          </a>
        </div>
      )}
    </section>
  )
}
