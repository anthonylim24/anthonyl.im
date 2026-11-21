import { formatMoney, isCurrencyCode, parseAmount, roundMinor } from "../budget/budget"
import type { Trip } from "../types"
import { countryForZone } from "./essentials"

// The Essentials converter's maths: the viewer's home currency, an amount
// typed on either side, and a one-line reference rate. Pure. `rate` is how
// many units of the home currency one unit of the local one buys (Frankfurter
// with the local currency as the base, `budget/rates.ts`).

/** The viewer's own currency: their time zone's country's, else the trip's budget currency, else US dollars. */
export function homeCurrency(viewerZone: string, trip: Pick<Trip, "budget">): string {
  const byZone = countryForZone(viewerZone)?.currency.code
  if (byZone) return byZone
  const budget = trip.budget?.currency
  return budget && isCurrencyCode(budget) ? budget : "USD"
}

export type Side = "local" | "home"

/** What the other field shows for an amount typed on `side`; null when the text is not an amount yet. */
export function converted(text: string, side: Side, local: string, home: string, rate: number): number | null {
  const from = side === "local" ? local : home
  const to = side === "local" ? home : local
  const amount = parseAmount(text, from)
  if (amount === null) return null
  return roundMinor(side === "local" ? amount * rate : amount / rate, to)
}

/**
 * "₩10,000 ≈ $7.20", "€1 ≈ $1.08": the smallest round amount of the local
 * currency (1, 10, 100…) that is worth at least one unit of home money.
 */
export function rateReference(local: string, home: string, rate: number): string {
  let unit = 1
  while (unit * rate < 1 && unit < 1_000_000) unit *= 10
  return `${formatMoney(unit, local)} ≈ ${formatMoney(unit * rate, home)}`
}
