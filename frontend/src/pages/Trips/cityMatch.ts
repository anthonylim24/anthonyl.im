import { foldText } from "./command/commands"
import type { CityResult } from "./geocode"

// Matching a typed place name to a geocoder result without the traveller
// picking one. Only an unmistakable match counts: the result's name is the
// typed name (case, accents and Hangul composition aside), so "Kyoto" finds
// Kyōto but "Seoul station" never quietly becomes Seoul.

/** The comparable form of a typed place: the part before the first comma ("Porto, Portugal" → "porto"). */
export function placeKey(name: string): string {
  return foldText(name.split(",")[0] ?? "")
}

/** The result whose name is exactly the typed place, if any. */
export function exactCity(results: readonly CityResult[], typed: string): CityResult | undefined {
  const key = placeKey(typed)
  if (!key) return undefined
  return results.find((city) => foldText(city.name) === key)
}
