import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { Phone } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { wallClock } from "../dayClock"
import { useHolidays, type Holiday } from "../holidays"
import { formatTripDate } from "../meta"
import type { Trip } from "../types"
import type { Country } from "./countries"
import { homeCurrency } from "./conversion"
import { CurrencyConverter } from "./CurrencyConverter"
import { DriverCard } from "./DriverCard"
import {
  countriesFor,
  dayCountries,
  formatLocalTime,
  formatMains,
  localZone,
  timeDifference,
  viewerTimeZone,
  zoneCity,
  zoneOffsetMinutes,
} from "./essentials"
import { tonightsStay } from "./tonight"
import { prep as p } from "./prep.stylex"

// What to know on arrival, and on the go: tonight's place to sleep in large
// type for a driver, then per country the trip visits the local clock, money
// (with a converter to the viewer's own), plugs, who to call, public
// holidays on the trip's days, which side of the road, tipping, language.
// The facts are static (`countries.ts`); the rate (Frankfurter) and the
// holidays (Nager.Date) are fetched, and simply missing when they fail.

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
  // The converter shows where the money differs from the viewer's own as their zone tells it; what
  // they pick in it is `home`, so picking the local money keeps the picker there to change back.
  const ownMoney = homeCurrency(viewer, trip)
  const [home, setHome] = useState(ownMoney)
  const stay = tonightsStay(trip, clock)
  const holidays = useHolidays(trip, now ? wallClock(now.getTime(), trip.timezone).date : undefined)
  const holidaysIn = useMemo(() => {
    const where = dayCountries(trip)
    const byCountry = new Map<string, Holiday[]>()
    for (const day of trip.days) {
      const country = where.get(day.id)
      for (const holiday of holidays.get(day.id) ?? []) if (country) byCountry.set(country.code, [...(byCountry.get(country.code) ?? []), holiday])
    }
    return byCountry
  }, [trip, holidays])

  const knownZone =
    countries.length === 0 && !/^(UTC|Etc\/|GMT)/.test(trip.timezone) && zoneOffsetMinutes(trip.timezone, clock) !== null

  return (
    <div ref={rootRef} {...sx(p.root)}>
      {stay && <DriverCard stay={stay} timezone={trip.timezone} />}
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
          <CountryEssentials
            key={country.code}
            country={country}
            zone={localZone(trip, country)}
            viewer={viewer}
            at={clock}
            home={home}
            converts={country.currency.code !== ownMoney}
            onHome={setHome}
            holidays={holidaysIn.get(country.code) ?? []}
          />
        ))
      )}
    </div>
  )
}

function CountryEssentials({
  country,
  zone,
  viewer,
  at,
  home,
  converts,
  onHome,
  holidays,
}: {
  country: Country
  zone: string
  viewer: string
  at: Date
  /** The viewer's own currency, for the converter. */
  home: string
  /** Whether this money differs from the viewer's own: a converter is worth showing. */
  converts: boolean
  onHome: (code: string) => void
  /** Public holidays on the trip's days in this country, in date order. */
  holidays: readonly Holiday[]
}) {
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
          {converts && <CurrencyConverter local={country.currency.code} home={home} onHome={onHome} />}
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
                <a key={`${call.label}-${call.number}`} href={`tel:${call.number}`} {...sx(a.btn, a.btnSecondary, p.call)}>
                  <Phone size={16} strokeWidth={1.75} aria-hidden />
                  {call.label}
                  <span {...sx(a.mono, p.callNumber)}>{call.number}</span>
                </a>
              ))}
            </span>
          </Fact>
        )}
        {holidays.length > 0 && (
          <Fact label="Public holidays">
            <ul {...sx(p.holidays)}>
              {holidays.map((holiday) => (
                <li key={`${holiday.date}-${holiday.name}`} {...sx(p.holiday)}>
                  <span {...sx(a.mono, p.holidayDate)}>{formatTripDate(holiday.date, zone)}</span>
                  <span {...sx(a.wrap)}>{holiday.name}</span>
                </li>
              ))}
            </ul>
            <span {...sx(a.small)}>Shops and museums may close or keep short hours.</span>
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
