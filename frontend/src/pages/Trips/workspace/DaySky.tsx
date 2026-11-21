import type { CSSProperties } from "react"
import { Sunrise, Sunset } from "lucide-react"
import { sx } from "@/styles/merge"
import { formatClock } from "../meta"
import { FAHRENHEIT, SKIES, formatTemp, weatherKind, type DaySky as Sky, type SkyId } from "../forecast"
import { a } from "../atlas.stylex"
import { sky as k } from "./daySky.stylex"

/** The engraving: its lines on light paper, its print on dark (see `.trips-sky-art` in index.css). */
function Engraving({ sky, faint = false }: { sky: SkyId; faint?: boolean }) {
  const { art, print } = SKIES[sky]
  const masks = { "--sky-ink": `url(${art})`, "--sky-print": `url(${print})` } as CSSProperties
  return <span aria-hidden="true" {...sx(k.art, faint && k.artFaint, "trips-sky-art")} style={masks} />
}

/** Skies whose word already says what falls ("Showers · 60% chance"). */
const WET: ReadonlySet<SkyId> = new Set(["drizzle", "rain", "showers", "snow", "thunder"])

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The day's sky in the day header: an engraving of the weather beside the
 * high and low, the sky in words, the chance of rain and the light.
 * A live forecast says "Forecast"; the plan's own weather for days out of
 * the forecast's reach says "Expected" and is set as an estimate. While a
 * forecast is on its way the place is held so the header does not jump.
 */
export function DaySky({ sky }: { sky: Sky }) {
  if (sky.status === "none") return null
  if (sky.status === "loading") return <div {...sx(k.root, k.holding)} aria-busy="true" aria-label="Loading the forecast" />
  if (sky.status === "unavailable") {
    return (
      <figure {...sx(k.root)}>
        <Engraving sky="cloudy" faint />
        <figcaption {...sx(k.text)}>
          <span {...sx(k.main)}>
            <span {...sx(k.eyebrow)}>Forecast</span>
            <span {...sx(k.word)}>Not available right now</span>
          </span>
        </figcaption>
      </figure>
    )
  }

  if (sky.status === "expected") {
    return (
      <figure {...sx(k.root)} title="The plan's expected weather; the live forecast starts 16 days out">
        <Engraving sky={sky.sky} />
        <figcaption {...sx(k.text)}>
          <span {...sx(k.main)}>
            <span {...sx(k.eyebrow)}>Expected</span>
            <span {...sx(k.temps)}>
              <span {...sx(k.high, k.estimate)}>
                <span {...sx(a.srOnly)}>About </span>
                <span aria-hidden="true">≈</span>
                {formatTemp(sky.highC, FAHRENHEIT)}
              </span>
              <span {...sx(k.low)}>
                <span {...sx(a.srOnly)}>, low </span>
                {formatTemp(sky.lowC, FAHRENHEIT)}
              </span>
            </span>
            <span {...sx(k.word)}>{capital(sky.word)}</span>
          </span>
        </figcaption>
      </figure>
    )
  }

  const live = sky.forecast
  const kind = weatherKind(live.code)
  const chance = live.rainChance >= 30 ? `${live.rainChance}% chance${WET.has(kind.sky) ? "" : " of rain"}` : null
  return (
    <figure {...sx(k.root)} title="Live forecast from Open-Meteo">
      <Engraving sky={kind.sky} />
      <figcaption {...sx(k.text)}>
        <span {...sx(k.main)}>
          <span {...sx(k.eyebrow)}>Forecast</span>
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
            {chance && <span {...sx(k.chance)}> · {chance}</span>}
          </span>
        </span>
        {live.sunrise && live.sunset && (
          <span {...sx(k.light)}>
            <span {...sx(k.lightPart)}>
              <Sunrise size={12} strokeWidth={1.75} aria-hidden />
              <span {...sx(a.srOnly)}>Sunrise </span>
              {formatClock(live.sunrise)}
            </span>
            <span {...sx(k.lightPart)}>
              <Sunset size={12} strokeWidth={1.75} aria-hidden />
              <span {...sx(a.srOnly)}>Sunset </span>
              {formatClock(live.sunset)}
            </span>
          </span>
        )}
      </figcaption>
    </figure>
  )
}
