import { useCallback, useState } from "react"

export type DayView = "list" | "timeline"

const KEY = "trips-day-view"

function read(): DayView {
  try {
    return localStorage.getItem(KEY) === "timeline" ? "timeline" : "list"
  } catch {
    return "list"
  }
}

/** The day's layout, remembered on this device so it carries from day to day. */
export function useDayView(): [DayView, (view: DayView) => void] {
  const [view, setView] = useState<DayView>(read)
  const change = useCallback((next: DayView) => {
    setView(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }, [])
  return [view, change]
}
