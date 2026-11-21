import { sx } from "@/styles/merge"
import { FAHRENHEIT, forecastLine, formatTemp, weatherKind, wetWord, type DayForecast } from "../forecast"
import { a } from "../atlas.stylex"
import { ws as s } from "../workspace.stylex"

/** A day row's live forecast in the overview: the sky's glyph, the high over the low, and the chance of what falls when it is worth a look ("60% showers", "70% snow"). */
export function ForecastChip({ forecast }: { forecast: DayForecast }) {
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
