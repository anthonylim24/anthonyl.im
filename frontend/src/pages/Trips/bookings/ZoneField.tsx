import { useId, useMemo, useState } from "react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { bk } from "./bookings.stylex"
import { knownZones, resolveZone, zoneLabel } from "./choices"

/**
 * An IANA time zone: the trip's own zones one tap away, any other found by
 * typing (the full list is built the first time the field is focused). A
 * city that names one zone ("Tokyo") is read as that zone.
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
  const [text, setText] = useState(value ?? "")
  const [bad, setBad] = useState(false)
  const [listed, setListed] = useState(false)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(value ?? "")
    setBad(false)
  }
  const all = useMemo(() => (listed ? knownZones(tripZones) : [...tripZones]), [listed, tripZones])

  const commit = () => {
    if (!text.trim()) {
      setBad(false)
      if (value) onChange(undefined)
      return
    }
    const zone = resolveZone(text, all)
    if (!zone) {
      setBad(true)
      return
    }
    setBad(false)
    setText(zone)
    if (zone !== value) onChange(zone)
  }

  return (
    <div {...sx(bk.wide)}>
      <label htmlFor={id} {...sx(s.miniLabel)}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={text}
        disabled={disabled}
        list={listed ? `${id}-zones` : undefined}
        placeholder="City or zone, e.g. Pacific/Honolulu"
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-error` : undefined}
        {...sx(a.field)}
        onFocus={() => setListed(true)}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            commit()
          }
        }}
      />
      {listed && (
        <datalist id={`${id}-zones`}>
          {all.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      )}
      {bad && (
        <span id={`${id}-error`} {...sx(a.errorText)} role="alert" style={{ display: "block" }}>
          Pick a zone from the list, like Asia/Tokyo, or type its city.
        </span>
      )}
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
