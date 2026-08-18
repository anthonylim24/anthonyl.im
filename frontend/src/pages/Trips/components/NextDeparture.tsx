import { Link } from "react-router-dom"
import { formatTripDate } from "../theme"
import { focusRingClass, mutedInkClass, typeHeroTimeClass, wrapAnywhereClass } from "../ui"
import type { ItineraryItem, TripDay } from "../types"

function cityFromZone(timezone: string): string {
  const last = timezone.split("/").pop() ?? timezone
  return last.replace(/_/g, " ")
}

export function NextDeparture({
  item,
  day,
  timezone,
  to,
  tone = "sheet",
}: {
  item: ItineraryItem
  day: TripDay
  timezone: string
  to: string
  tone?: "sheet" | "band"
}) {
  const time = item.time
  const onBand = tone === "band"
  return (
    <Link
      to={to}
      className={`cover-hero group mt-6 block min-h-11 ${focusRingClass}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {time ? (
          <span className={typeHeroTimeClass}>{time}</span>
        ) : (
          <span className={`font-display text-xl font-semibold ${wrapAnywhereClass}`}>
            {formatTripDate(day.date, timezone)}
          </span>
        )}
        <span className={`cover-hero-title min-w-0 max-w-[28ch] font-display text-xl font-semibold leading-tight sm:text-2xl ${wrapAnywhereClass}`}>
          {item.title}
        </span>
      </div>
      <p className={`cover-extra mt-2 text-[0.8125rem] ${onBand ? "text-[color:var(--trips-band-ink)]/70" : mutedInkClass}`}>
        {formatTripDate(day.date, timezone)}
        {time ? ` · ${cityFromZone(timezone)}` : ""}
      </p>
    </Link>
  )
}

export function zoneCity(timezone: string): string {
  return cityFromZone(timezone)
}
