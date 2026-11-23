import { foldText } from "./command/commands"
import { validZone } from "./dayClock"

// Every IANA time zone the browser knows, for a place the map could not find.

/** Shown at once; typing narrows the rest. */
export const ZONE_LIMIT = 40

let every: string[] | null = null

export function allZones(): string[] {
  if (!every) {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
    every = intl.supportedValuesOf?.("timeZone") ?? ["UTC"]
  }
  return every
}

/** "America/Argentina/Buenos_Aires" → { city: "Buenos Aires", region: "America · Argentina" }. */
export function zoneParts(zone: string): { city: string; region: string } {
  const parts = zone.split("/").map((part) => part.replace(/_/g, " "))
  return { city: parts[parts.length - 1] ?? zone, region: parts.slice(0, -1).join(" · ") }
}

const offsets = new Map<string, string>()

/** "GMT+9", read once per zone. */
export function offsetOf(zone: string): string {
  let label = offsets.get(zone)
  if (label === undefined) {
    try {
      label =
        new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
          .formatToParts(new Date())
          .find((part) => part.type === "timeZoneName")?.value ?? ""
    } catch {
      label = ""
    }
    offsets.set(zone, label)
  }
  return label
}

/** Zones matching a typed query: city names first, then anywhere in the name. */
export function matchZones(zones: readonly string[], query: string): string[] {
  const q = foldText(query.replace(/[_/]/g, " "))
  if (!q) return [...zones]
  const starts: string[] = []
  const contains: string[] = []
  for (const zone of zones) {
    const city = foldText(zoneParts(zone).city)
    if (city.startsWith(q)) starts.push(zone)
    else if (foldText(zone.replace(/[_/]/g, " ")).includes(q)) contains.push(zone)
  }
  return [...starts, ...contains]
}

const cityOf = (zone: string) => zone.split("/").pop()!.replace(/_/g, " ").toLowerCase()

/**
 * What a typed zone means: an IANA name in any case ("asia/tokyo"), or a
 * city that names exactly one zone ("Tokyo", "new york"). Null otherwise.
 */
export function resolveZone(text: string, zones: readonly string[]): string | null {
  const typed = text.trim().toLowerCase()
  if (!typed) return null
  const exact = zones.find((zone) => zone.toLowerCase() === typed)
  if (exact) return validZone(exact) ?? null
  const byCity = zones.filter((zone) => cityOf(zone) === typed.replace(/_/g, " "))
  return byCity.length === 1 ? (validZone(byCity[0]) ?? null) : null
}
