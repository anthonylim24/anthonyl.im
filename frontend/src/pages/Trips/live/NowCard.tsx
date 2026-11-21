import { useId } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, ChevronRight, Navigation } from "lucide-react"
import { sx } from "@/styles/merge"
import { externalMapsAppName, externalMapsLink } from "@/lib/externalMaps"
import { dayCount, formatClock, formatRange, formatTripDate, plural } from "../meta"
import { FAHRENHEIT, formatTemp, weatherKind, wetSpells, wetWord, type DayForecast } from "../forecast"
import { clockLabel, clockRange } from "../timeline/timeline"
import { formatMinutes } from "../timeline/travel"
import { ItemIcon } from "../ItemIcon"
import { Parts } from "../workspace/Parts"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { a } from "../atlas.stylex"
import { live as s } from "./live.stylex"
import { liveState, type LiveAfter, type LiveBefore, type LiveDuring, type LiveNext } from "./liveTrip"
import { useNow } from "./useNow"

/**
 * The top of a trip's overview: what happens next. Before the trip it counts
 * down to the first day and its first booking; during it, it names the stop
 * under way and the next one, with when to leave and how to get there; after
 * it, a one-line recap. `now` pins the clock (tests, previews); without it the
 * card follows the real time, minute by minute, while the tab is visible.
 * `forecast` (dayId → live forecast) adds today's sky.
 */
export function NowCard({
  trip,
  basePath,
  now: fixed,
  forecast,
}: {
  trip: Trip
  basePath: string
  now?: Date
  forecast?: ReadonlyMap<string, DayForecast>
}) {
  const clock = useNow(60_000, fixed === undefined)
  const state = liveState(trip, fixed ?? clock)
  const titleId = useId()
  const sky = state.phase === "during" && state.day ? forecast?.get(state.day.id) : undefined

  return (
    <section {...sx(s.card)} aria-labelledby={titleId}>
      {state.phase === "before" && <Before trip={trip} basePath={basePath} state={state} titleId={titleId} />}
      {state.phase === "during" && <During trip={trip} basePath={basePath} state={state} titleId={titleId} sky={sky} />}
      {state.phase === "after" && <After trip={trip} state={state} titleId={titleId} />}
    </section>
  )
}

/** The trip-accent date tile: a short word over a serif numeral. */
function DateTile({ top, num, label }: { top: string; num: string; label: string }) {
  return (
    <span {...sx(s.tile)} role="img" aria-label={label}>
      <span {...sx(s.tileTop)} aria-hidden>
        {top}
      </span>
      <span {...sx(s.tileNum)} aria-hidden>
        {num}
      </span>
    </span>
  )
}

function tileFor(date: string, timezone: string, top: "weekday" | "month") {
  return {
    top: formatTripDate(date, timezone, { weekday: top === "weekday" ? "short" : undefined, month: top === "month" ? "short" : undefined, day: undefined }),
    num: formatTripDate(date, timezone, { weekday: undefined, month: undefined, day: "numeric" }),
    label: formatTripDate(date, timezone),
  }
}

const dayLink = (basePath: string, day: TripDay, item?: ItineraryItem) =>
  `${basePath}/day/${day.id}${item ? `#item-${item.id}` : ""}`

// ── Before ────────────────────────────────────────────────────────────────

function Before({ trip, basePath, state, titleId }: { trip: Trip; basePath: string; state: LiveBefore; titleId: string }) {
  const first = state.first
  return (
    <>
      <div {...sx(s.head)}>
        <DateTile {...tileFor(trip.startDate, trip.timezone, "month")} />
        <div {...sx(s.headText)}>
          <h2 id={titleId} {...sx(a.srOnly)}>
            {state.label}
          </h2>
          <p {...sx(a.eyebrow)} aria-hidden>
            Starts{state.count ? " in" : ""}
          </p>
          <p {...sx(s.countRow)} aria-hidden>
            {state.count ? (
              <>
                <span {...sx(a.display, s.countNum)}>{state.count.value}</span>
                <span {...sx(a.display, a.italic, s.countUnit)}>{state.count.unit}</span>
              </>
            ) : (
              <span {...sx(a.display, a.italic, s.countNum)}>tomorrow</span>
            )}
          </p>
        </div>
      </div>
      <p {...sx(a.small)}>
        {formatRange(trip.startDate, trip.endDate)} · {plural(dayCount(trip.startDate, trip.endDate), "day")}
      </p>
      {first && (
        <>
          <hr {...sx(s.rule)} />
          <Link to={dayLink(basePath, first.day, first.item)} {...sx(a.focusable, s.rowLink)}>
            <span {...sx(s.iconTile)}>
              <ItemIcon
                kind={first.item.kind}
                category={first.item.location?.category}
                reservationType={first.item.reservation?.type}
                size={16}
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
            <span {...sx(a.stack)} style={{ gap: "0.125rem" }}>
              <span {...sx(a.eyebrow)}>{first.kind === "booking" ? "First booking" : "First stop"}</span>
              <span {...sx(s.rowTitle, a.truncate)}>{first.item.title || "Untitled"}</span>
              <span {...sx(a.small, a.mono)}>
                {formatTripDate(first.day.date, trip.timezone)}
                {first.item.time ? ` · ${formatClock(first.item.time)}` : ""}
              </span>
            </span>
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden {...sx(a.muted)} />
          </Link>
        </>
      )}
    </>
  )
}

// ── During ────────────────────────────────────────────────────────────────

function During({
  trip,
  basePath,
  state,
  titleId,
  sky,
}: {
  trip: Trip
  basePath: string
  state: LiveDuring
  titleId: string
  sky: DayForecast | undefined
}) {
  const { day, current, next } = state
  const dayName = day?.title?.trim() || day?.city?.trim()
  const lastDay = state.dayIndex === state.dayCount - 1
  return (
    <>
      <div {...sx(s.head)}>
        <DateTile {...tileFor(state.date, trip.timezone, "weekday")} />
        <div {...sx(s.headText)}>
          {/* The clock shares the eyebrow's row, so the name and the sky have the full width. */}
          <div {...sx(s.headTop)}>
            <h2 id={titleId} {...sx(a.eyebrow)}>
              Today · Day {state.dayIndex + 1} of {state.dayCount}
            </h2>
            <p {...sx(a.mono, s.clock)} title={`Local time (${trip.timezone})`}>
              {formatClock(state.clock)}
              <span {...sx(a.srOnly)}> local time</span>
            </p>
          </div>
          {dayName && <p {...sx(a.display, s.dayTitle, a.wrap)}>{dayName}</p>}
          {sky && <SkyLine forecast={sky} clock={state.clock} />}
        </div>
      </div>

      {current && (
        <p {...sx(s.nowRow)}>
          <span {...sx(a.eyebrow)}>Now</span>
          <span {...sx(s.nowName, a.wrap)}>{current.item.title || "Untitled"}</span>
          {current.end && <span {...sx(a.small, a.mono)}>until {formatClock(current.end)}</span>}
        </p>
      )}

      <hr {...sx(s.rule)} />

      {next ? (
        <NextStop basePath={basePath} next={next} state={state} />
      ) : (
        <div {...sx(s.next)}>
          <p {...sx(a.body)}>
            {!day
              ? "Nothing is planned for today."
              : state.total === 0
                ? "Nothing on today’s plan has a time."
                : lastDay
                  ? "That’s the last timed stop of the trip."
                  : "Nothing else timed today."}
          </p>
          {day && (
            <div {...sx(s.actions)}>
              <Link to={dayLink(basePath, day)} {...sx(a.btn, a.btnSecondary, s.action)}>
                Open today
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
              </Link>
            </div>
          )}
        </div>
      )}

      {state.total > 1 && (
        <div {...sx(s.progress)}>
          <span {...sx(s.ticks)} aria-hidden>
            {Array.from({ length: state.total }, (_, i) => (
              <span key={i} {...sx(s.tick, i < state.started && s.tickOn)} />
            ))}
          </span>
          <span {...sx(a.small, a.mono)}>
            {state.started} of {state.total} started
          </span>
        </div>
      )}

      {/* Announce a new next stop, never the minute-by-minute countdown. */}
      <p {...sx(a.srOnly)} role="status">
        {next ? `${next.tomorrow ? "First tomorrow" : "Next"}: ${next.item.title || "Untitled"}` : ""}
      </p>
    </>
  )
}

/**
 * Today's sky in one line: "57° now · Showers 2–5 PM", or "Showers until
 * 5 PM" once it has begun (this hour's temperature, then the wet spell under
 * way or still to come), or the day's
 * sky word once no wet spell is left. Without hourly data, the day's high.
 */
function SkyLine({ forecast, clock }: { forecast: DayForecast; clock: string }) {
  const minute = Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
  const hour = forecast.hours?.find((h) => Number(h.time.slice(0, 2)) === Math.floor(minute / 60))
  const spell = wetSpells(forecast.hours ?? []).find((wet) => wet.to > minute)
  const Icon = weatherKind(spell?.code ?? forecast.code).icon
  const temp = hour ? `${formatTemp(hour.tempC, FAHRENHEIT)} now` : `High ${formatTemp(forecast.highC, FAHRENHEIT)}`
  // Under way, only its end is news: "Showers until 5 PM".
  const words = !spell
    ? weatherKind(forecast.code).word
    : spell.from <= minute
      ? `${wetWord(spell.code)} until ${clockLabel(spell.to).replace(":00 ", " ")}`
      : `${wetWord(spell.code)} ${clockRange(spell.from, spell.to, "prose")}`
  return (
    <p {...sx(a.small, s.sky)} title="Forecast from Open-Meteo">
      <Icon size={16} strokeWidth={1.75} aria-hidden {...sx(s.skyIcon)} />
      <span>
        <Parts parts={[temp, words]} />
      </span>
    </p>
  )
}

function NextStop({ basePath, next, state }: { basePath: string; next: LiveNext; state: LiveDuring }) {
  const location = next.item.location
  const maps = location
    ? externalMapsLink({ name: location.name || next.item.title, address: location.address, lat: location.lat, lng: location.lng })
    : undefined
  const { travel, leaveBy, leaveIn, minutesToNext } = state
  return (
    <div {...sx(s.next)}>
      <div {...sx(s.nextHead)}>
        <p {...sx(a.eyebrow)}>
          {next.tomorrow ? "First tomorrow" : "Next"} · <span {...sx(a.ink)}>{formatClock(next.start)}</span>
        </p>
        {minutesToNext !== null && <p {...sx(s.countdown)}>in {formatMinutes(minutesToNext)}</p>}
      </div>
      <p {...sx(a.display, s.nextName, a.wrap)}>{next.item.title || "Untitled"}</p>
      {travel && leaveBy && leaveIn !== null ? (
        <p {...sx(a.small, s.leave)}>
          <span {...sx(a.mono, leaveIn <= 0 && s.leaveNow)}>{leaveIn <= 0 ? "Leave now" : `Leave by ${formatClock(leaveBy)}`}</span>
          <span aria-hidden>·</span>
          <span>
            {travel.label}
            <span {...sx(s.leaveFrom)}> from {travel.from.title || "the stop before"}</span>
          </span>
        </p>
      ) : (
        location?.address && <p {...sx(a.small, a.wrap)}>{location.address}</p>
      )}
      <div {...sx(s.actions)}>
        {maps && (
          <a href={maps.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnPrimary, s.action)}>
            <Navigation size={16} strokeWidth={1.75} aria-hidden />
            Directions
            <span {...sx(a.srOnly)}>
              {" "}
              to {next.item.title || location?.name}, in {externalMapsAppName(maps.app)}
            </span>
          </a>
        )}
        <Link to={dayLink(basePath, next.day, next.item)} {...sx(a.btn, maps ? a.btnSecondary : a.btnPrimary, s.action)}>
          {next.tomorrow ? "Open tomorrow" : "Open today"}
          <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </div>
  )
}

// ── After ─────────────────────────────────────────────────────────────────

function After({ trip, state, titleId }: { trip: Trip; state: LiveAfter; titleId: string }) {
  const range = formatRange(trip.startDate, trip.endDate)
  return (
    <div {...sx(s.head)}>
      <DateTile {...tileFor(trip.endDate, trip.timezone, "month")} />
      <div {...sx(s.headText)}>
        <h2 id={titleId} {...sx(a.eyebrow)}>
          {state.label ? `${state.label} · ${range}` : range}
        </h2>
        <p {...sx(a.display, s.recap)}>
          {[plural(state.days, "day"), plural(state.places, "place"), plural(state.cities, "city", "cities")].join(" · ")}
        </p>
      </div>
    </div>
  )
}
