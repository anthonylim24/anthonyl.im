import { useId } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, BedDouble, BookOpenText, Check, ChevronRight, LifeBuoy, MoreHorizontal, Navigation, Receipt, Route, SkipForward, Timer } from "lucide-react"
import { sx } from "@/styles/merge"
import { externalMapsAppName } from "@/lib/externalMaps"
import { dayCount, formatClock, formatRange, formatTripDate, plural } from "../meta"
import { FAHRENHEIT, formatTemp, weatherKind, wetSpells, wetWord, type DayForecast } from "../forecast"
import { clockLabel, clockRange } from "../timeline/timeline"
import { formatMinutes } from "../timeline/travel"
import { ItemIcon } from "../ItemIcon"
import { Menu, type MenuItem } from "../components/kit"
import { Parts } from "../workspace/Parts"
import type { UndoMark } from "../editorMachine"
import type { ItineraryItem, Trip, TripDay } from "../types"
import { a } from "../atlas.stylex"
import { live as s } from "./live.stylex"
import { liveState, type LiveAfter, type LiveBefore, type LiveDuring, type LiveNext, type LiveStop } from "./liveTrip"
import { directionsTo, hotelTonight, routeToday, shiftRemaining, stopsAhead, withStatus } from "./onTheGo"
import { useNow } from "./useNow"

/** Change one day of the plan; the workspace records `undo` and saves. */
export type UpdateDay = (dayId: string, change: (day: TripDay) => TripDay, undo: UndoMark) => void

/**
 * The top of a trip's overview: what happens next. Before the trip it counts
 * down to the first day and its first booking; during it, it names the stop
 * under way and the next one, with when to leave and how to get there, and
 * the things a traveller reaches for on the move; after it, a one-line
 * recap. `now` pins the clock (tests, previews); without it the card follows
 * the real time, minute by minute, while the tab is visible. `forecast`
 * (dayId → live forecast) adds today's sky.
 *
 * Edits (done, skip, running late, log an expense) appear only with
 * `canEdit`, and the first three only with `onUpdateDay` to make them.
 */
export function NowCard({
  trip,
  basePath,
  now: fixed,
  forecast,
  canEdit = false,
  onUpdateDay,
  onOpenRecap,
}: {
  trip: Trip
  basePath: string
  now?: Date
  forecast?: ReadonlyMap<string, DayForecast>
  canEdit?: boolean
  onUpdateDay?: UpdateDay
  onOpenRecap?: () => void
}) {
  const clock = useNow(60_000, fixed === undefined)
  const state = liveState(trip, fixed ?? clock)
  const titleId = useId()
  // In the small hours the day's own forecast is a day old: say nothing rather than last night's sky.
  const sky = state.phase === "during" && state.day && !state.night ? forecast?.get(state.day.id) : undefined
  const update = canEdit ? onUpdateDay : undefined

  return (
    <section {...sx(s.card)} aria-labelledby={titleId}>
      {state.phase === "before" && <Before trip={trip} basePath={basePath} state={state} titleId={titleId} />}
      {state.phase === "during" && (
        <During trip={trip} basePath={basePath} state={state} titleId={titleId} sky={sky} canEdit={canEdit} update={update} />
      )}
      {state.phase === "after" && <After trip={trip} state={state} titleId={titleId} onOpenRecap={onOpenRecap} />}
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

function tileFor(date: string, top: "weekday" | "month") {
  return {
    top: formatTripDate(date, undefined, { weekday: top === "weekday" ? "short" : undefined, month: top === "month" ? "short" : undefined, day: undefined }),
    num: formatTripDate(date, undefined, { weekday: undefined, month: undefined, day: "numeric" }),
    label: formatTripDate(date),
  }
}

const titleOf = (item: ItineraryItem) => item.title || "Untitled"

/**
 * A day, or a stop picked out in its list. `#stop-` keeps a phone on the
 * list (never switches it to the map), which is what a traveller wants.
 */
const dayLink = (basePath: string, day: TripDay, item?: ItineraryItem) =>
  `${basePath}/day/${day.id}${item ? `#stop-${item.id}` : ""}`

// ── Before ────────────────────────────────────────────────────────────────

function Before({ trip, basePath, state, titleId }: { trip: Trip; basePath: string; state: LiveBefore; titleId: string }) {
  const first = state.first
  return (
    <>
      <div {...sx(s.head)}>
        <DateTile {...tileFor(trip.startDate, "month")} />
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
              <span {...sx(s.rowTitle, a.truncate)}>{titleOf(first.item)}</span>
              <span {...sx(a.small, a.mono)}>
                {formatTripDate(first.day.date)}
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

const LATE_STEPS = [
  { minutes: 15, label: "Running late · 15 min" },
  { minutes: 30, label: "Running late · 30 min" },
  { minutes: 60, label: "Running late · 1 hour" },
] as const

const isStop = (item: ItineraryItem) => item.kind !== "section" && item.kind !== "note"

function During({
  trip,
  basePath,
  state,
  titleId,
  sky,
  canEdit,
  update,
}: {
  trip: Trip
  basePath: string
  state: LiveDuring
  titleId: string
  sky: DayForecast | undefined
  canEdit: boolean
  update: UpdateDay | undefined
}) {
  const { day, current, next } = state
  const dayName = day?.title?.trim() || day?.city?.trim()
  const lastDay = state.dayIndex === state.dayCount - 1
  const stops = day?.items.filter(isStop) ?? []

  const mark = (stop: LiveStop, status: "completed" | "skipped") =>
    update?.(stop.day.id, (d) => withStatus(d, stop.item.id, status), {
      label: status === "completed" ? `Marked “${titleOf(stop.item)}” done` : `Skipped “${titleOf(stop.item)}”`,
      toast: true,
    })

  return (
    <>
      <div {...sx(s.head)}>
        <DateTile {...tileFor(state.date, "weekday")} />
        <div {...sx(s.headText)}>
          {/* The clock shares the eyebrow's row, so the name and the sky have the full width. */}
          <div {...sx(s.headTop)}>
            <h2 id={titleId} {...sx(a.eyebrow)}>
              {state.night ? "Tonight" : "Today"} · Day {state.dayIndex + 1} of {state.dayCount}
            </h2>
            <p {...sx(a.mono, s.clock)} title={`Local time (${state.zone})`}>
              {formatClock(state.clock)}
              <span {...sx(a.srOnly)}> local time</span>
            </p>
          </div>
          {dayName && <p {...sx(a.display, s.dayTitle, a.wrap)}>{dayName}</p>}
          {sky && <SkyLine forecast={sky} clock={state.clock} />}
        </div>
      </div>

      {current && (
        <div {...sx(s.nowBar)}>
          <p {...sx(s.nowRow)}>
            <span {...sx(a.eyebrow)}>Now</span>
            <Link to={dayLink(basePath, current.day, current.item)} {...sx(a.focusable, s.stopLink, s.nowName, a.wrap)}>
              {titleOf(current.item)}
            </Link>
            {current.end && <span {...sx(a.small, a.mono)}>until {formatClock(current.end)}</span>}
          </p>
          {update && (
            <button type="button" onClick={() => mark(current, "completed")} {...sx(a.btn, a.btnSecondary, a.btnSm, s.doneBtn)}>
              <Check size={16} strokeWidth={2} aria-hidden />
              Done
              <span {...sx(a.srOnly)}> with {titleOf(current.item)}</span>
            </button>
          )}
        </div>
      )}

      <hr {...sx(s.rule)} />

      {next ? (
        <NextStop basePath={basePath} next={next} state={state} update={update} mark={mark} />
      ) : (
        <div {...sx(s.next)}>
          <p {...sx(a.body)}>
            {!day || stops.length === 0
              ? "Nothing is planned for today."
              : state.total === 0
                ? "Everything on today’s list is done."
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

      <OnTheGo trip={trip} basePath={basePath} state={state} canEdit={canEdit} />

      {/* Announce a new next stop, never the minute-by-minute countdown. */}
      <p {...sx(a.srOnly)} role="status">
        {next ? `${next.when === "tomorrow" ? "First tomorrow" : "Next"}: ${titleOf(next.item)}` : ""}
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

function NextStop({
  basePath,
  next,
  state,
  update,
  mark,
}: {
  basePath: string
  next: LiveNext
  state: LiveDuring
  update: UpdateDay | undefined
  mark: (stop: LiveStop, status: "completed" | "skipped") => void
}) {
  const location = next.item.location
  const title = titleOf(next.item)
  // From the stop before it in clock order (or last night's bed) when today's; else from wherever the phone is.
  const directions = directionsTo(next.item, next.when === "today" ? state.from : null)
  const { travel, leaveBy, leaveIn, minutesToNext } = state
  const day = state.day

  const items: MenuItem[] = []
  if (update && day && next.when !== "tomorrow") {
    items.push(
      { label: "Mark done", icon: <Check size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => mark(next, "completed") },
      { label: "Skip", icon: <SkipForward size={16} strokeWidth={1.75} aria-hidden />, onSelect: () => mark(next, "skipped") },
    )
    if (next.when === "today") {
      for (const [i, step] of LATE_STEPS.entries()) {
        items.push({
          label: step.label,
          icon: <Timer size={16} strokeWidth={1.75} aria-hidden />,
          separated: i === 0,
          // Off when nothing would move, or the new times would not read back as today's.
          disabled: shiftRemaining(day, state.now, step.minutes) === null,
          onSelect: () =>
            update(day.id, (d) => shiftRemaining(d, state.now, step.minutes) ?? d, {
              label: `Moved the rest of today ${step.minutes === 60 ? "an hour" : `${step.minutes} min`} later`,
              toast: true,
            }),
        })
      }
    }
  }

  return (
    <div {...sx(s.next)}>
      <div {...sx(s.nextHead)}>
        <p {...sx(a.eyebrow)}>
          {next.when === "tomorrow" ? "First tomorrow" : "Next"}
          {next.start ? (
            <>
              {" · "}
              <span {...sx(a.ink)}>{formatClock(next.start)}</span>
            </>
          ) : (
            " · any time today"
          )}
        </p>
        {minutesToNext !== null && <p {...sx(s.countdown)}>in {formatMinutes(minutesToNext)}</p>}
      </div>
      {/* Edits sit beside the name, as on a stop in the list, so the two buttons below keep a phone's row to themselves. */}
      <div {...sx(s.nameRow)}>
        <Link to={dayLink(basePath, next.day, next.item)} {...sx(a.display, a.focusable, s.stopLink, s.nextName, a.wrap)}>
          {title}
        </Link>
        {items.length > 0 && (
          <Menu
            label={`More for ${title}`}
            trigger={<MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />}
            triggerStyle={[a.iconBtn, s.more]}
            items={items}
          />
        )}
      </div>
      {travel && leaveBy && leaveIn !== null ? (
        <p {...sx(a.small, s.leave)}>
          <span {...sx(a.mono, leaveIn <= 0 && s.leaveNow)}>{leaveIn <= 0 ? "Leave now" : `Leave by ${formatClock(leaveBy)}`}</span>
          <span aria-hidden>·</span>
          <span>
            {travel.label}
            <span {...sx(s.leaveFrom)}> from {titleOf(travel.from)}</span>
          </span>
        </p>
      ) : (
        location?.address && <p {...sx(a.small, a.wrap)}>{location.address}</p>
      )}
      <div {...sx(s.actions)}>
        {directions && (
          <a href={directions.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnPrimary, s.action)}>
            <Navigation size={16} strokeWidth={1.75} aria-hidden />
            Directions
            <span {...sx(a.srOnly)}>
              {" "}
              to {title}, in {externalMapsAppName(directions.app)}
            </span>
          </a>
        )}
        <Link to={dayLink(basePath, next.day, next.item)} {...sx(a.btn, directions ? a.btnSecondary : a.btnPrimary, s.action)}>
          {next.when === "tomorrow" ? "Open tomorrow" : "Open today"}
          <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </div>
  )
}

/**
 * What a traveller reaches for on the move, in one quiet row: the rest of the
 * day as a route, the way back to the hotel, the trip's essentials, and (for
 * editors) logging what something cost.
 */
function OnTheGo({ trip, basePath, state, canEdit }: { trip: Trip; basePath: string; state: LiveDuring; canEdit: boolean }) {
  const day = state.day
  // A day with no times is walked in list order.
  const route = day ? routeToday(stopsAhead(day, state.total === 0 ? null : state.now)) : undefined
  const hotel = day ? hotelTonight(trip, day) : null
  const home = hotel ? directionsTo(hotel, null) : undefined
  return (
    <nav aria-label="On the go" {...sx(s.goRow)}>
      {route && (
        <a href={route.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnGhost, a.btnSm)}>
          <Route size={16} strokeWidth={1.75} aria-hidden />
          Route today
          <span {...sx(a.srOnly)}>
            {" "}
            through the next {route.stops} stops, in {externalMapsAppName(route.app)}
          </span>
        </a>
      )}
      {hotel && home && (
        <a href={home.href} target="_blank" rel="noreferrer" {...sx(a.btn, a.btnGhost, a.btnSm)}>
          <BedDouble size={16} strokeWidth={1.75} aria-hidden />
          Back to hotel
          <span {...sx(a.srOnly)}>
            {" "}
            {titleOf(hotel)}, in {externalMapsAppName(home.app)}
          </span>
        </a>
      )}
      <Link to={`${basePath}?tab=essentials`} {...sx(a.btn, a.btnGhost, a.btnSm)}>
        <LifeBuoy size={16} strokeWidth={1.75} aria-hidden />
        Essentials
      </Link>
      {canEdit && (
        <Link to={`${basePath}?tab=budget&add=expense`} {...sx(a.btn, a.btnGhost, a.btnSm)}>
          <Receipt size={16} strokeWidth={1.75} aria-hidden />
          Log expense
        </Link>
      )}
    </nav>
  )
}

// ── After ─────────────────────────────────────────────────────────────────

function After({ trip, state, titleId, onOpenRecap }: { trip: Trip; state: LiveAfter; titleId: string; onOpenRecap?: () => void }) {
  const range = formatRange(trip.startDate, trip.endDate)
  return (
    <>
      <div {...sx(s.head)}>
        <DateTile {...tileFor(trip.endDate, "month")} />
        <div {...sx(s.headText)}>
          <h2 id={titleId} {...sx(a.eyebrow)}>
            {state.label ? `${state.label} · ${range}` : range}
          </h2>
          <p {...sx(a.display, s.recap)}>
            {[plural(state.days, "day"), plural(state.places, "place"), plural(state.cities, "city", "cities")].join(" · ")}
          </p>
        </div>
      </div>
      {onOpenRecap && (
        <div {...sx(s.actions)}>
          <button type="button" onClick={onOpenRecap} {...sx(a.btn, a.btnSecondary, s.action)}>
            <BookOpenText size={16} strokeWidth={1.75} aria-hidden />
            See your recap
          </button>
        </div>
      )}
    </>
  )
}
