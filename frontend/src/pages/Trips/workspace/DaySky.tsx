import type { CSSProperties } from "react"
import { Sunrise, Sunset } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatClock } from "../meta"
import { FAHRENHEIT, SKIES, formatTemp, weatherKind, wetSpells, wetWord, type DaySky as Sky, type SkyId } from "../forecast"
import { clockRange, layoutDay, stopNumbers, stopTitle } from "../timeline/timeline"
import type { TripDay } from "../types"
import compassArt from "../art/compass.webp"
import { a } from "../atlas.stylex"
import { sky as k } from "./daySky.stylex"

/** The engraving: its lines inked in the theme's secondary ink (see `.trips-sky-art` in index.css). An estimate is drawn fainter. */
function Engraving({ sky, faint = false }: { sky: SkyId | "compass"; faint?: boolean }) {
  const art = sky === "compass" ? compassArt : SKIES[sky].art
  return <span aria-hidden="true" {...sx(k.art, sky === "compass" && k.artFaint, faint && k.artEstimate, "trips-sky-art")} style={{ "--sky-ink": `url(${art})` } as CSSProperties} />
}

/** Skies whose word already says what falls ("Showers · 60% chance"). */
const WET: ReadonlySet<SkyId> = new Set(["drizzle", "rain", "showers", "snow", "thunder"])

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** What a wet window means for the plan: "meets stop 5", "after your last stop". */
function meets(day: TripDay | undefined, from: number, to: number): { text: string; hits: boolean } | null {
  if (!day) return null
  const { blocks } = layoutDay(day)
  if (blocks.length === 0) return null
  const numbers = stopNumbers(day)
  const titles = new Map(day.items.map((item) => [item.id, stopTitle(item)]))
  // A stop off the map has no number: it is named instead.
  const hit = blocks.filter((b) => b.start < to && b.end > from).map((b) => (numbers.has(b.itemId) ? `stop ${numbers.get(b.itemId)}` : titles.get(b.itemId)!))
  if (hit.length) return { text: hit.length === 1 ? `meets ${hit[0]}` : `meets ${hit.length} stops`, hits: true }
  if (from >= Math.max(...blocks.map((b) => b.end))) return { text: "after your last stop", hits: false }
  if (to <= Math.min(...blocks.map((b) => b.start))) return { text: "before your first stop", hits: false }
  return { text: "between your stops", hits: false }
}

/** Sunrise and sunset, in the eyebrow's line so they never float apart from the sky. */
function Light({ sunrise, sunset }: { sunrise: string; sunset: string }) {
  return (
    <span {...sx(k.light)}>
      <span {...sx(k.lightPart)}>
        <Sunrise size={12} strokeWidth={1.75} aria-hidden />
        <span {...sx(a.srOnly)}>Sunrise </span>
        {formatClock(sunrise)}
      </span>
      <span {...sx(k.lightPart)}>
        <Sunset size={12} strokeWidth={1.75} aria-hidden />
        <span {...sx(a.srOnly)}>Sunset </span>
        {formatClock(sunset)}
      </span>
    </span>
  )
}

/**
 * The day's sky in the day header: an engraving of the weather beside the
 * high and low, the sky in words with its wettest window, what that means
 * for the plan on a line of its own, and the light. A live forecast says
 * "Forecast"; the plan's own weather for days out of the forecast's reach is
 * set as an estimate. While a forecast is on its way the place is held so
 * the header does not jump. One grid: on phones the words run full width
 * under the engraving and the temperatures.
 */
export function DaySky({ sky, day }: { sky: Sky; day?: TripDay }) {
  if (sky.status === "none") return null
  if (sky.status === "loading") return <div {...sx(k.root, k.holding)} aria-busy="true" aria-label="Loading the forecast" />
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
      </figure>
    )
  }

  const live = sky.forecast
  const kind = weatherKind(live.code)
  // The wettest stretch says when: "Showers 2–5 PM · 60% chance". Without one, the day's chance alone.
  const spell = wetSpells(live.hours ?? []).reduce<ReturnType<typeof wetSpells>[number] | null>((top, s) => (!top || s.chance > top.chance ? s : top), null)
  const wet = WET.has(kind.sky)
  const when = spell ? `${wet ? "" : `${wetWord(spell.code).toLowerCase()} `}${clockRange(spell.from, spell.to, "prose")}` : null
  const percent = spell ? spell.chance : live.rainChance
  const chance = spell || live.rainChance >= 30 ? `${percent}% chance${wet || spell ? "" : " of rain"}` : null
  const consequence = spell ? meets(day, spell.from, spell.to) : null
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
      {consequence && <span {...sx(k.meets, consequence.hits && k.consequence)}>{capital(consequence.text)}</span>}
    </figure>
  )
}
