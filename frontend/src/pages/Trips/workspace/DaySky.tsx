import type { CSSProperties, ReactNode } from "react"
import { Lightbulb } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatClock } from "../meta"
import { FAHRENHEIT, SKIES, formatTemp, weatherKind, wetSpells, wetWord, type DaySky as Sky, type SkyId, type TypicalDay, type WetSpell } from "../forecast"
import { timeOfYear, typicalWords } from "../climate"
import { holidayLine, type Holiday } from "../holidays"
import { clockRange, layoutDay, stopNumbers, stopTitle } from "../timeline/timeline"
import { StopRef } from "../timeline/StopRef"
import { reworkLabel } from "./stopAlerts"
import type { TripDay } from "../types"
import compassArt from "../art/compass.webp"
import { a } from "../atlas.stylex"
import { sky as k } from "./daySky.stylex"

/**
 * The engraving: its lines inked in the theme's secondary ink, a sky on a
 * paper plate on dark (see `.trips-sky-art` in index.css). An estimate is
 * drawn fainter; the compass of a missing forecast fainter still, with no plate.
 */
function Engraving({ sky, faint = false }: { sky: SkyId | "compass"; faint?: boolean }) {
  const compass = sky === "compass"
  return (
    <span aria-hidden="true" {...sx(k.art, compass && k.artFaint, faint && k.artEstimate, !compass && "trips-sky-plate")}>
      <span {...sx(k.ink, "trips-sky-art")} style={{ "--sky-ink": `url(${compass ? compassArt : SKIES[sky].art})` } as CSSProperties} />
    </span>
  )
}

/** Skies whose word already says what falls ("Showers · 60% chance"). */
const WET: ReadonlySet<SkyId> = new Set(["drizzle", "rain", "showers", "snow", "thunder"])

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

interface Hit {
  id: string
  number: number | null
  title: string
}

/**
 * What a wet window means for the plan: the stops it falls on and when it
 * meets them, or where it falls between them ("After your last stop").
 * `ahead`: some stop it falls on is not over yet.
 */
type Meets = { hits: Hit[]; from: number; to: number; ahead: boolean } | { text: string }

function meets(day: TripDay | undefined, from: number, to: number, now: number | null): Meets | null {
  if (!day) return null
  const { blocks } = layoutDay(day)
  if (blocks.length === 0) return null
  const numbers = stopNumbers(day)
  const titles = new Map(day.items.map((item) => [item.id, stopTitle(item)]))
  const wet = blocks.filter((b) => b.start < to && b.end > from)
  if (wet.length) {
    return {
      hits: wet.map((b) => ({ id: b.itemId, number: numbers.get(b.itemId) ?? null, title: titles.get(b.itemId)! })),
      from: Math.max(from, Math.min(...wet.map((b) => b.start))),
      to: Math.min(to, Math.max(...wet.map((b) => b.end))),
      ahead: now === null || wet.some((b) => b.end > now),
    }
  }
  if (from >= Math.max(...blocks.map((b) => b.end))) return { text: "After your last stop" }
  if (to <= Math.min(...blocks.map((b) => b.start))) return { text: "Before your first stop" }
  return { text: "Between your stops" }
}

/** "Falls on ⑤ Gion and Hanami-koji · 3:30–5 PM": each stop a button that finds it. */
function FallsOn({ hits, from, to, onStop }: { hits: Hit[]; from: number; to: number; onStop?: (id: string) => void }) {
  const ref = (hit: Hit, named: boolean) => {
    const label = (
      <>
        <StopRef number={hit.number} title={hit.title} style={k.badge} />
        {named && hit.number !== null && <span {...sx(k.hitTitle)}> {hit.title}</span>}
      </>
    )
    return onStop ? (
      <button key={hit.id} type="button" onClick={() => onStop(hit.id)} {...sx(a.focusable, k.stopLink)} aria-label={named || hit.number === null ? undefined : `stop ${hit.number}, ${hit.title}`}>
        {label}
      </button>
    ) : (
      <span key={hit.id}>{label}</span>
    )
  }
  const shown = hits.slice(0, 3)
  return (
    <span {...sx(k.consequence)}>
      Falls on{" "}
      {shown.length === 1
        ? ref(shown[0]!, true)
        : shown.map((hit, i) => (
            <span key={hit.id}>
              {i > 0 && (i === shown.length - 1 && hits.length <= 3 ? " and " : ", ")}
              {ref(hit, false)}
            </span>
          ))}
      {hits.length > 3 && ` and ${hits.length - 3} more`}
      <span {...sx(k.meetsWhen)}> · {clockRange(from, to, "prose")}</span>
    </span>
  )
}

/** "Christmas Day · public holiday: shops and museums may close or keep short hours." */
function HolidayNote({ holidays }: { holidays: readonly Holiday[] }) {
  const { names, note } = holidayLine(holidays)
  return (
    <span {...sx(k.holiday)} title={holidays.map((h) => h.localName).filter((local, i) => local !== holidays[i]!.name).join(" · ") || undefined}>
      <span {...sx(k.holidayName)}>{names}</span> · {note}
    </span>
  )
}

/**
 * A day past the forecast's reach, from the history of its date: drawn back
 * like the plan's estimate (fainter engraving, ≈ high in lighter ink), and
 * named for what it is, so it never passes for a forecast.
 */
function Typical({ typical, holiday }: { typical: TypicalDay; holiday: ReactNode }) {
  const kind = weatherKind(typical.code)
  const words = typicalWords(typical)
  const season = timeOfYear(typical.date)
  const years = `based on the last ${typical.years === 1 ? "year" : `${typical.years} years`}`
  const high = formatTemp(typical.highC, FAHRENHEIT)
  const low = formatTemp(typical.lowC, FAHRENHEIT)
  return (
    <figure {...sx(k.root)} title="What these dates were like in recent years, from the Open-Meteo archive. Not a forecast.">
      <Engraving sky={kind.sky} faint />
      <span {...sx(k.eyebrowRow)}>
        <span {...sx(k.eyebrow)}>Typical for {season}</span>
        <span {...sx(k.light)}>
          {years}
          <span {...sx(a.srOnly)}>, not a forecast</span>
        </span>
      </span>
      <span {...sx(k.temps)}>
        <span {...sx(k.high, k.estimate)}>
          <span {...sx(a.srOnly)}>About </span>
          <span aria-hidden="true" {...sx(k.approx)}>≈</span>
          {high}
        </span>
        <span {...sx(k.low)}>
          <span {...sx(a.srOnly)}>, low </span>
          {low}
        </span>
      </span>
      <span {...sx(k.word)}>
        {words.sky}
        {words.wet && <span {...sx(k.wetDays)}> · {words.wet}</span>}
      </span>
      {holiday}
    </figure>
  )
}

/** Sunrise and sunset in words beside the eyebrow; phones keep the sunset. */
function Light({ sunrise, sunset }: { sunrise: string; sunset: string }) {
  return (
    <span {...sx(k.light)}>
      <span {...sx(k.lightPart, k.sunrise)}>Sunrise {formatClock(sunrise)}</span>
      <span {...sx(k.lightPart)}>Sunset {formatClock(sunset)}</span>
    </span>
  )
}

/**
 * The day's sky in the day header: an engraving of the weather beside the
 * high and low, the sky in words with its wettest window, what that means
 * for the plan on a line of its own, and the light. A live forecast says
 * "Forecast"; a day out of its reach shows the weather typical of its date
 * (history, set back like an estimate), else the plan's own weather as an
 * estimate. While either is on its way the place is held so the header does
 * not jump. A public holiday adds a quiet line under the sky, and stands
 * alone when there is no sky to show. One grid: the engraving on the left,
 * the lines beside it, at every width.
 */
export function DaySky({
  sky,
  day,
  now = null,
  onStop,
  onRework,
  holidays,
}: {
  sky: Sky
  day?: TripDay
  /** On today, minutes from midnight in the trip's zone. */
  now?: number | null
  /** Find a stop the rain falls on (the map for a pinned stop). */
  onStop?: (id: string) => void
  /** Ask Ideas to rework the day around the wet window. */
  onRework?: (spell: WetSpell) => void
  /** The day's public holidays where it is spent (`useHolidays`). */
  holidays?: readonly Holiday[]
}) {
  const holiday = holidays && holidays.length > 0 ? <HolidayNote holidays={holidays} /> : null
  if (sky.status === "none") return holiday && <p {...sx(k.alone)}>{holiday}</p>
  if (sky.status === "loading") {
    return (
      <div {...sx(k.root, k.holding)} aria-busy="true" aria-label="Loading the forecast">
        {holiday}
      </div>
    )
  }
  if (sky.status === "typical") return <Typical typical={sky.typical} holiday={holiday} />
  if (sky.status === "unavailable") {
    return (
      <figure {...sx(k.root)}>
        <Engraving sky="compass" />
        <span {...sx(k.eyebrowRow)}>
          <span {...sx(k.eyebrow)}>Forecast</span>
        </span>
        <span {...sx(k.word)}>
          Not available right now
          {sky.retry && (
            <>
              {" "}
              <button type="button" onClick={sky.retry} {...sx(a.focusable, k.retry)}>
                Try again
              </button>
            </>
          )}
        </span>
        {holiday}
      </figure>
    )
  }

  if (sky.status === "expected") {
    return (
      <figure {...sx(k.root)} aria-label={`The plan's estimate, not a forecast: about ${formatTemp(sky.highC, FAHRENHEIT)}, ${sky.word}`}>
        <Engraving sky={sky.sky} faint />
        <span {...sx(k.eyebrowRow)}>
          <span {...sx(k.eyebrow)}>Estimate · from the plan</span>
        </span>
        <span {...sx(k.temps)}>
          <span {...sx(k.high, k.estimate)}>
            <span {...sx(a.srOnly)}>About </span>
            <span aria-hidden="true" {...sx(k.approx)}>≈</span>
            {formatTemp(sky.highC, FAHRENHEIT)}
          </span>
          <span {...sx(k.low)}>
            <span {...sx(a.srOnly)}>, low </span>
            {formatTemp(sky.lowC, FAHRENHEIT)}
          </span>
        </span>
        <span {...sx(k.word)}>{capital(sky.word)}</span>
        {holiday}
      </figure>
    )
  }

  const live = sky.forecast
  const kind = weatherKind(live.code)
  // The wettest stretch says when: "Showers 2–5 PM · 60% chance". Without one, the day's chance alone.
  const spell = wetSpells(live.hours ?? []).reduce<ReturnType<typeof wetSpells>[number] | null>((top, s) => (!top || s.chance > top.chance ? s : top), null)
  const wet = WET.has(kind.sky)
  // Wet with no hour at even odds: it comes and goes, and no stop can be named.
  const scattered = !spell && (live.hours?.length ?? 0) > 0 && (wet || live.rainChance >= 30)
  const when = spell ? `${wet ? "" : `${wetWord(spell.code).toLowerCase()} `}${clockRange(spell.from, spell.to, "prose")}` : scattered && wet ? "on and off" : null
  const percent = spell ? spell.chance : live.rainChance
  const chance = spell || live.rainChance >= 30 ? `${percent}% chance${wet || spell ? "" : " of rain"}` : null
  const consequence = spell ? meets(day, spell.from, spell.to, now) : null
  return (
    <figure {...sx(k.root)} title="Live forecast from Open-Meteo">
      <Engraving sky={kind.sky} />
      <span {...sx(k.eyebrowRow)}>
        <span {...sx(k.eyebrow)}>Forecast</span>
        {live.sunrise && live.sunset && <Light sunrise={live.sunrise} sunset={live.sunset} />}
      </span>
      <span {...sx(k.temps)}>
        <span {...sx(k.high)}>
          <span {...sx(a.srOnly)}>High </span>
          {formatTemp(live.highC, FAHRENHEIT)}
        </span>
        <span {...sx(k.low)}>
          <span {...sx(a.srOnly)}>, low </span>
          {formatTemp(live.lowC, FAHRENHEIT)}
        </span>
      </span>
      <span {...sx(k.word)}>
        {kind.word}
        {when && (wet ? ` ${when}` : ` · ${when}`)}
        {chance && <span {...sx(k.chance)}> · {chance}</span>}
      </span>
      {consequence && (
        <span {...sx(k.meets)}>
          {"hits" in consequence ? <FallsOn hits={consequence.hits} from={consequence.from} to={consequence.to} onStop={onStop} /> : consequence.text}
          {spell && "hits" in consequence && consequence.ahead && onRework && (
            <button type="button" onClick={() => onRework(spell)} aria-label={reworkLabel(spell)} {...sx(a.focusable, k.rework)}>
              <Lightbulb size={13} strokeWidth={1.75} aria-hidden />
              <span {...sx(k.reworkLong)}>{reworkLabel(spell)}</span>
              <span {...sx(k.reworkShort)}>Rework</span>
            </button>
          )}
        </span>
      )}
      {scattered && <span {...sx(k.meets)}>No hour more likely than not</span>}
      {holiday}
    </figure>
  )
}
