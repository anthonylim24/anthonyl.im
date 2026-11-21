import { sx } from "@/styles/merge"
import { FAHRENHEIT, forecastLine, formatTemp, weatherKind, wetWord, type DayForecast, type TypicalDay } from "../forecast"
import { timeOfYear, typicalWords } from "../climate"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"
import { typicalChip as t } from "./daySky.stylex"

/**
 * A day row's weather in the overview. A live forecast: the sky's glyph, the
 * high over the low, and the chance of what falls when it is worth a look
 * ("60% showers", "70% snow"). A day past the forecast's reach: its date's
 * typical weather, set back a step and labelled "typical", never a chance.
 */
export function ForecastChip(props: { forecast: DayForecast } | { typical: TypicalDay }) {
  if ("typical" in props) return <TypicalChip typical={props.typical} />
  const { forecast } = props
  const Icon = weatherKind(forecast.code).icon
  return (
    <span {...sx(s.rowSky)} title="Live forecast from Open-Meteo">
      <span {...sx(a.srOnly)}>{forecastLine(forecast, FAHRENHEIT)}</span>
      <Icon size={20} strokeWidth={1.5} aria-hidden {...sx(s.rowSkyIcon)} />
      <span {...sx(s.rowSkyTemps)} aria-hidden>
        <span {...sx(s.rowSkyHigh)}>{formatTemp(forecast.highC, FAHRENHEIT)}</span>
        <span {...sx(s.rowSkyLow)}>{formatTemp(forecast.lowC, FAHRENHEIT)}</span>
      </span>
      {forecast.rainChance >= 30 && (
        <span {...sx(s.rowSkyChance)} aria-hidden>
          {forecast.rainChance}% {wetWord(forecast.code).toLowerCase()}
        </span>
      )}
    </span>
  )
}

function TypicalChip({ typical }: { typical: TypicalDay }) {
  const Icon = weatherKind(typical.code).icon
  const words = typicalWords(typical)
  const high = formatTemp(typical.highC, FAHRENHEIT)
  const low = formatTemp(typical.lowC, FAHRENHEIT)
  return (
    <span {...sx(s.rowSky)} title="Typical for these dates in recent years. Not a forecast.">
      <span {...sx(a.srOnly)}>
        {`Typical for ${timeOfYear(typical.date)}, not a forecast: ${high} / ${low}, ${[words.sky, words.wet].filter(Boolean).join(", ").toLowerCase()}`}
      </span>
      <Icon size={20} strokeWidth={1.5} aria-hidden {...sx(s.rowSkyIcon, t.icon)} />
      <span {...sx(s.rowSkyTemps)} aria-hidden>
        <span {...sx(s.rowSkyHigh, t.high)}>{high}</span>
        <span {...sx(s.rowSkyLow)}>{low}</span>
      </span>
      <span {...sx(t.note)} aria-hidden>
        Typical
      </span>
    </span>
  )
}
