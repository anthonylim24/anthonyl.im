import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { Phone } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import type { Trip } from "../types"
import type { Country } from "./countries"
import {
  countriesFor,
  formatLocalTime,
  formatMains,
  localZone,
  timeDifference,
  viewerTimeZone,
  zoneCity,
  zoneOffsetMinutes,
} from "./essentials"
import { prep as p } from "./prep.stylex"

// What to know on arrival, per country the trip visits: the local clock,
// money, plugs, who to call, which side of the road, tipping, language.
// Static facts (`countries.ts`), no network.

export function EssentialsPanel({
  trip,
  now,
  viewerZone,
}: {
  trip: Trip
  /** Pins the clock (tests, screenshots). Otherwise it ticks each minute while on screen. */
  now?: Date
  /** The viewer's IANA zone; defaults to the browser's. */
  viewerZone?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const clock = useMinuteClock(now, rootRef)
  const viewer = viewerZone ?? viewerTimeZone()
  const countries = useMemo(() => countriesFor(trip), [trip])

  const knownZone =
    countries.length === 0 && !/^(UTC|Etc\/|GMT)/.test(trip.timezone) && zoneOffsetMinutes(trip.timezone, clock) !== null

  return (
    <div ref={rootRef} {...sx(p.root)}>
      {countries.length === 0 ? (
        <>
          <p {...sx(a.body, p.measure)}>Add a country or city as a destination to see local essentials.</p>
          {knownZone && (
            <dl {...sx(p.facts)}>
              <LocalTime zone={trip.timezone} viewer={viewer} at={clock} named />
            </dl>
          )}
        </>
      ) : (
        countries.map((country) => (
          <CountryEssentials key={country.code} country={country} zone={localZone(trip, country)} viewer={viewer} at={clock} />
        ))
      )}
    </div>
  )
}

function CountryEssentials({ country, zone, viewer, at }: { country: Country; zone: string; viewer: string; at: Date }) {
  const headingId = useId()
  return (
    <section {...sx(p.country)} aria-labelledby={headingId}>
      <div {...sx(p.countryHead)}>
        <h2 id={headingId} {...sx(a.display, p.countryTitle, a.wrap)}>
          {country.name}
        </h2>
      </div>
      <dl {...sx(p.facts)}>
        <LocalTime zone={zone} viewer={viewer} at={at} named={country.multiZone === true} />
        <Fact label="Currency">
          <span>
            {country.currency.name} <span {...sx(a.mono, a.muted)}>{country.currency.code}</span>
          </span>
        </Fact>
        {(country.plugs || country.power) && (
          <Fact label="Plugs & voltage">
            {country.plugs && <span>{`${country.plugs.length === 1 ? "Type" : "Types"} ${country.plugs.join(", ")}`}</span>}
            {country.power && <span {...sx(a.mono, a.muted)}>{formatMains(country.power)}</span>}
          </Fact>
        )}
        {country.emergency && (
          <Fact label="Emergency">
            <span {...sx(p.calls)}>
              {country.emergency.map((call) => (
                <a
                  key={`${call.label}-${call.number}`}
                  href={`tel:${call.number}`}
                  {...sx(a.btn, a.btnSm, a.btnSecondary, p.call)}
                >
                  <Phone size={13} strokeWidth={1.75} aria-hidden />
                  {call.label}
                  <span {...sx(a.mono)}>{call.number}</span>
                </a>
              ))}
            </span>
          </Fact>
        )}
        {country.driving && <Fact label="Driving">{country.driving === "left" ? "On the left" : "On the right"}</Fact>}
        {country.tipping && (
          <Fact label="Tipping">
            <span {...sx(a.wrap)}>{country.tipping}</span>
          </Fact>
        )}
        {country.languages && <Fact label="Language">{country.languages}</Fact>}
        {country.callingCode && (
          <Fact label="Calling code">
            <span {...sx(a.mono)}>{country.callingCode}</span>
          </Fact>
        )}
      </dl>
    </section>
  )
}

function LocalTime({ zone, viewer, at, named }: { zone: string; viewer: string; at: Date; named: boolean }) {
  const time = formatLocalTime(zone, at)
  if (!time) return null
  const difference = timeDifference(zone, viewer, at)
  return (
    <Fact label="Local time">
      <span {...sx(a.mono, p.clock)}>
        <time dateTime={at.toISOString()}>{time}</time>
        {named && <span {...sx(a.muted)}> · {zoneCity(zone)}</span>}
      </span>
      {difference && <span {...sx(a.small)}>{difference.label}</span>}
    </Fact>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div {...sx(p.fact)}>
      <dt {...sx(a.eyebrow, p.factLabel)}>{label}</dt>
      <dd {...sx(p.factValue)}>{children}</dd>
    </div>
  )
}

/**
 * The current time, refreshed on each minute boundary while the panel is on
 * screen and the tab is visible; nothing runs otherwise. A pinned `fixed`
 * time never ticks.
 */
function useMinuteClock(fixed: Date | undefined, target: RefObject<HTMLElement | null>): Date {
  const [tick, setTick] = useState(() => new Date())
  const pinned = fixed !== undefined
  useEffect(() => {
    if (pinned) return
    const node = target.current
    let onScreen = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const running = () => onScreen && document.visibilityState !== "hidden"
    const schedule = () => {
      clearTimeout(timer)
      if (!running()) return
      timer = setTimeout(
        () => {
          setTick(new Date())
          schedule()
        },
        60_000 - (Date.now() % 60_000) + 50,
      )
    }
    const wake = () => {
      if (running()) setTick(new Date())
      schedule()
    }
    const observer =
      node && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting)
            wake()
          })
        : null
    if (node) observer?.observe(node)
    document.addEventListener("visibilitychange", wake)
    schedule()
    return () => {
      clearTimeout(timer)
      observer?.disconnect()
      document.removeEventListener("visibilitychange", wake)
    }
  }, [pinned, target])
  return fixed ?? tick
}
