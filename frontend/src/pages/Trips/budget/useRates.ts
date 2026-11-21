import { useEffect, useState } from "react"
import type { Trip } from "../types"
import { defaultCurrency, foreignCurrencies, type Rates } from "./budget"
import { loadRates } from "./rates"

const NONE: Rates = {}

export interface TripRates {
  /** The budget currency: the base of `rates`. */
  currency: string
  rates: Rates
  /** Currencies the trip uses other than the budget's, sorted. */
  foreign: string[]
  /** A lookup for the current set of currencies hasn't answered yet. */
  loading: boolean
}

/**
 * Exchange rates into the trip's budget currency, fetched only when the trip
 * has amounts in another currency, and again when that set changes. Until an
 * answer lands the previous rates for the same base stay in use; an answer
 * for a set the trip no longer has is dropped.
 */
export function useRates(trip: Trip): TripRates {
  const currency = defaultCurrency(trip)
  const foreign = foreignCurrencies(trip, currency)
  const wanted = foreign.join(",")
  const key = `${currency}>${wanted}`
  const [loaded, setLoaded] = useState<{ key: string; base: string; rates: Rates } | null>(null)

  useEffect(() => {
    if (!wanted) return
    let live = true
    void loadRates(currency, wanted.split(",")).then((rates) => {
      if (live) setLoaded({ key: `${currency}>${wanted}`, base: currency, rates })
    })
    return () => {
      live = false
    }
  }, [currency, wanted])

  return {
    currency,
    rates: loaded && loaded.base === currency ? loaded.rates : NONE,
    foreign,
    loading: wanted !== "" && loaded?.key !== key,
  }
}
