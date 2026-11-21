import { forwardRef, useId, useMemo, useState, type KeyboardEvent } from "react"
import { Clock } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { isComposing } from "../ime"
import { allZones, matchZones, offsetOf, ZONE_LIMIT, zoneParts } from "../timeZones"

// A searchable select over every IANA time zone the browser knows, for a
// place the map could not find. Type part of a city or region ("tok",
// "new york", "kolkata"); arrows and Enter pick.

export const TimeZoneField = forwardRef<
  HTMLInputElement,
  {
    id?: string
    value: string | null
    onChange: (zone: string) => void
    invalid?: boolean
    disabled?: boolean
    describedBy?: string
  }
>(function TimeZoneField({ id, value, onChange, invalid, disabled, describedBy }, ref) {
  /** What the traveller is typing; null shows the chosen zone. */
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const listId = useId()
  const zones = useMemo(allZones, [])
  const matches = useMemo(() => matchZones(zones, query ?? "").slice(0, ZONE_LIMIT), [zones, query])
  const showList = open && matches.length > 0

  const pick = (zone: string) => {
    onChange(zone)
    setQuery(null)
    setOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing(event)) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      setOpen(true)
      if (matches.length > 0) setCursor((c) => (c + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length)
    } else if (event.key === "Enter") {
      if (!showList) return
      event.preventDefault()
      const zone = matches[cursor]
      if (zone) pick(zone)
    } else if (event.key === "Escape" && open) {
      event.stopPropagation()
      setOpen(false)
      setQuery(null)
    }
  }

  const shown = query ?? (value ? `${zoneParts(value).city} · ${value}` : "")
  return (
    <div {...sx(s.composer)}>
      <div {...sx(a.field)} style={{ display: "flex", alignItems: "center", gap: "0.5rem", borderColor: invalid ? "var(--trips-danger)" : undefined }}>
        <Clock size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.muted)} />
        <input
          ref={ref}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${cursor}` : undefined}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          disabled={disabled}
          value={shown}
          placeholder="Search a city, e.g. Tokyo"
          {...sx(a.fieldBare)}
          style={{ flex: 1, minWidth: 0, minHeight: "2rem" }}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
            setOpen(true)
          }}
          onFocus={(event) => {
            event.currentTarget.select()
            setOpen(true)
          }}
          onBlur={() => {
            setOpen(false)
            setQuery(null)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Time zones" {...sx(s.results, s.resultsDown)} style={{ maxHeight: "16rem", overflowY: "auto" }}>
          {matches.map((zone, index) => {
            const { city, region } = zoneParts(zone)
            return (
              <li key={zone} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${index}`}
                  aria-selected={index === cursor}
                  tabIndex={-1}
                  {...sx(s.result, index === cursor && s.resultOn)}
                  onMouseEnter={() => setCursor(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(zone)}
                >
                  <span {...sx(a.grow, a.truncate)}>
                    {city}
                    {region && <span {...sx(a.muted)}> {region}</span>}
                  </span>
                  <span {...sx(a.mono, a.muted, a.noShrink)}>{offsetOf(zone)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
})
