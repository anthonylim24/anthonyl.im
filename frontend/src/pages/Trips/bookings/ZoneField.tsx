import { useId } from "react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { TimeZoneField } from "../components/TimeZoneField"
import { ws as s } from "../workspace.stylex"
import { bk } from "./bookings.stylex"
import { zoneLabel } from "./choices"

/**
 * An IANA time zone: the trip's own zones one tap away (and first in the
 * list), any other found by searching. A typed city that names one zone
 * ("Tokyo") is read as that zone; emptying the field clears it.
 */
export function ZoneField({
  label,
  value,
  tripZones,
  date,
  disabled,
  onChange,
}: {
  label: string
  value: string | undefined
  tripZones: readonly string[]
  /** The day the zone is read on, for its short name ("HST"). */
  date: string
  disabled?: boolean
  onChange: (zone: string | undefined) => void
}) {
  const id = useId()
  return (
    <div {...sx(bk.wide)}>
      <label htmlFor={id} {...sx(s.miniLabel)}>
        {label}
      </label>
      <TimeZoneField id={id} value={value} suggested={tripZones} disabled={disabled} onChange={onChange} onClear={() => onChange(undefined)} />
      {tripZones.length > 0 && (
        <div {...sx(bk.zones)} role="group" aria-label="This trip’s time zones">
          {tripZones.map((zone) => (
            <button
              key={zone}
              type="button"
              aria-pressed={zone === value}
              disabled={disabled}
              {...sx(a.pill, zone === value && a.pillOn)}
              onClick={() => onChange(zone === value ? undefined : zone)}
            >
              {zoneLabel(zone, date)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
