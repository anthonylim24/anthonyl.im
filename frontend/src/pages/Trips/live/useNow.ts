import { useEffect, useState } from "react"

/**
 * The current time, refreshed on each `stepMs` boundary of the clock (so a
 * one-minute step lands on :00, as a wall clock does). Nothing runs while the
 * tab is hidden; coming back refreshes at once. `enabled: false` stops the
 * clock (a caller with a fixed `now`), leaving the time it mounted with.
 *
 * A step of 15 minutes or less also lands on every zone's midnight: all
 * real UTC offsets are whole quarter hours.
 */
export function useNow(stepMs = 60_000, enabled = true): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = undefined
      if (document.hidden) return
      // A beat past the boundary, so the new minute has certainly begun.
      timer = setTimeout(tick, stepMs - (Date.now() % stepMs) + 50)
    }
    const tick = () => {
      setNow(new Date())
      schedule()
    }
    const onVisibility = () => (document.hidden ? schedule() : tick())
    schedule()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [stepMs, enabled])

  return now
}
