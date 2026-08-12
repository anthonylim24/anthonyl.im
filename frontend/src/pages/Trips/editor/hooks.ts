import { useMemo } from "react"
import { formatTripDate } from "../theme"
import type { TripDay } from "../types"
import type { DayOption } from "./editorUi"

const FIELD = "\u0000"
const RECORD = "\u0001"

/**
 * Serialized day identity: ids and dates only. A keystroke rebuilds `days`,
 * but this string is unchanged, so anything derived from it keeps its
 * identity and memoized day cards and item rows stay memoized.
 */
export function daysKey(days: TripDay[]): string {
  return days.map((d) => `${d.id}${FIELD}${d.date}`).join(RECORD)
}

export function dayIdsFrom(key: string): string[] {
  return key ? key.split(RECORD).map((record) => record.slice(0, record.indexOf(FIELD))) : []
}

/** Move-to-day options, rebuilt only when a day's id or date changes. */
export function useDayOptions(days: TripDay[], timezone: string): DayOption[] {
  const key = daysKey(days)
  return useMemo(() => {
    if (!key) return []
    return key.split(RECORD).map((record, i) => {
      const at = record.indexOf(FIELD)
      return {
        id: record.slice(0, at),
        label: `Day ${i + 1} · ${formatTripDate(record.slice(at + 1), timezone)}`,
      }
    })
  }, [key, timezone])
}
