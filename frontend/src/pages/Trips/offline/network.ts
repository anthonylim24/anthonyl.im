import { useSyncExternalStore } from "react"
import { TimeoutError } from "@/effect/errors"
import type { SaveFailure } from "../editorMachine"
import { isTripRefused } from "../tripConflict"

// What the connection is doing, and what a failed request says about it.

/** Only an explicit `false` counts: some browsers report `true` on a captive portal, none report `false` online. */
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false

/**
 * The request never got an answer: no connection, a dropped one, or a
 * deadline that passed. `fetch` rejects with a `TypeError` for all of
 * these ("Failed to fetch", Safari's "Load failed", Firefox's "NetworkError…").
 */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || err instanceof TimeoutError || isOffline()
}

/** Sort a failed save into what can be done about it (see `SaveFailure`). */
export function saveFailure(err: unknown): SaveFailure {
  if (isTripRefused(err)) return "refused"
  return isNetworkError(err) ? "network" : "server"
}

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/** False while the browser says there is no connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !isOffline(),
    () => true,
  )
}
