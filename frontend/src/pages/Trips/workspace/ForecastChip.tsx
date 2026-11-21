import { sx } from "@/styles/merge"
import { FAHRENHEIT, forecastLine, weatherKind, type DayForecast } from "../forecast"
import { a } from "../atlas.stylex"

/** The day's live forecast: icon, high / low, the sky, rain when likely. */
export function ForecastChip({ forecast, compact = false }: { forecast: DayForecast; compact?: boolean }) {
  const kind = weatherKind(forecast.code)
  const Icon = kind.icon
  const line = forecastLine(forecast, FAHRENHEIT)
  return (
    <span {...sx(a.row, a.small)} style={{ gap: "0.375rem" }} title="Live forecast from Open-Meteo">
      <Icon size={14} strokeWidth={1.75} aria-hidden />
      {compact ? (
        <>
          <span {...sx(a.srOnly)}>{line}</span>
          <span aria-hidden>{line.split(" · ")[0]!.split(" / ")[0]}</span>
        </>
      ) : (
        line
      )}
    </span>
  )
}
