import { useMemo } from "react"
import { BedDouble, LogOut } from "lucide-react"
import { sx } from "@/styles/merge"
import { checkOutOn, nightsByDay } from "../lodging"
import type { Trip, TripDay } from "../types"
import { Parts } from "../workspace/Parts"
import { bk } from "./bookings.stylex"

/**
 * Where the traveller sleeps tonight, for the day header: "Sleeping at
 * Halekulani · night 2 of 4". On the morning a stay ends with nowhere new
 * booked, it says when to be out instead. Nothing when the trip doesn't say.
 */
export function TonightLine({ trip, day }: { trip: Pick<Trip, "days">; day: Pick<TripDay, "id" | "date"> }) {
  const nights = useMemo(() => nightsByDay(trip), [trip])
  const tonight = nights.get(day.id)
  if (tonight) {
    return (
      <p {...sx(bk.tonight)}>
        <BedDouble size={16} strokeWidth={1.75} aria-hidden {...sx(bk.tonightIcon)} />
        <span>
          <Parts
            parts={[
              <>
                Sleeping at <span {...sx(bk.tonightName)}>{tonight.name || "your stay"}</span>
              </>,
              tonight.nights > 1 && `night ${tonight.night} of ${tonight.nights}`,
            ]}
          />
        </span>
      </p>
    )
  }
  const leaving = checkOutOn(nights, day.date)
  if (!leaving) return null
  return (
    <p {...sx(bk.tonight)}>
      <LogOut size={16} strokeWidth={1.75} aria-hidden {...sx(bk.tonightIcon)} />
      <span>
        Check out of <span {...sx(bk.tonightName)}>{leaving.name || "your stay"}</span>
        {leaving.checkOutTime && ` by ${leaving.checkOutTime}`}
      </span>
    </p>
  )
}
