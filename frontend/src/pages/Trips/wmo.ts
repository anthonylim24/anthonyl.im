// WMO weather codes, as Open-Meteo reports them, in words and as the nine
// almanac skies the day header can draw. Pure, and free of the art and the
// glyphs (`forecast.ts` adds those), so the live forecast and the climate
// history (`climate.ts`) read codes the same way without importing each other.

export type SkyId = "clear" | "partly-cloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "showers" | "snow" | "thunder"

/** WMO codes in order; the first row that matches names the sky. */
const CODES: ReadonlyArray<readonly [(code: number) => boolean, string, SkyId]> = [
  [(c) => c === 0, "Clear", "clear"],
  [(c) => c <= 2, "Partly cloudy", "partly-cloudy"],
  [(c) => c === 3, "Overcast", "cloudy"],
  [(c) => c === 45 || c === 48, "Fog", "fog"],
  [(c) => c >= 51 && c <= 57, "Drizzle", "drizzle"],
  [(c) => c >= 61 && c <= 67, "Rain", "rain"],
  [(c) => c >= 80 && c <= 82, "Showers", "showers"],
  [(c) => (c >= 71 && c <= 77) || c === 85 || c === 86, "Snow", "snow"],
  [(c) => c >= 95, "Thunderstorms", "thunder"],
]

/** Every sky, driest first: the order the table above names them in. */
export const SKY_ORDER: readonly SkyId[] = CODES.map(([, , sky]) => sky)

/** WMO code → a word and a sky. An unknown code reads as cloudy. */
export function wmoSky(code: number): { word: string; sky: SkyId } {
  const [, word, sky] = CODES.find(([test]) => test(code)) ?? [null, "Cloudy", "cloudy" as const]
  return { word, sky }
}
