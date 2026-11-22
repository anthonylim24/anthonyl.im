import { Effect } from "effect"
import { TimeoutError } from "../../../effect/errors"
import { requestJson, type GetToken } from "../../../effect/http"
import { runPromise } from "../../../effect/runtime"
import type { ItineraryItem } from "../types"
import type { DayPick, DaySuggestions, SuggestDaysRequest } from "./contract"
import { withDeadline } from "./deadline"

// Client for POST /api/trips/:id/ideas/suggest-days: the days an idea fits
// best. The server always answers something it can (the distance ranking
// when its model can't), so a failure here is the network or the session;
// the picker then just shows every day.

/** The server waits on its model for 8 s; past this the answer is not coming. */
const SUGGEST_TIMEOUT_MS = 12_000
const TOO_SLOW = "The server didn’t suggest days in time."

const clip = (value: string | undefined, max: number) => (value === undefined ? undefined : value.slice(0, max))
const finite = (value: number | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : undefined)

/** The idea as the request carries it, within the server's limits (the item schema's own). */
export function suggestRequest(idea: ItineraryItem): SuggestDaysRequest {
  const where = idea.location
  return {
    idea: {
      title: idea.title.slice(0, 300),
      notes: clip(idea.notes, 8000),
      theme: idea.theme,
      location: where
        ? {
            name: where.name.slice(0, 200),
            address: clip(where.address, 400),
            lat: finite(where.lat),
            lng: finite(where.lng),
            category: clip(where.category, 40),
            placeId: clip(where.placeId, 256),
          }
        : undefined,
    },
  }
}

const isPick = (value: unknown): value is DayPick => {
  const pick = value as DayPick | null
  return typeof pick?.dayId === "string" && typeof pick.reason === "string" && (pick.nearestKm === undefined || Number.isFinite(pick.nearestKm))
}

const suggestDaysEffect = Effect.fn("TripsService.suggestDays")(function* (
  getToken: GetToken,
  tripId: string,
  idea: ItineraryItem,
  signal?: AbortSignal,
) {
  // One signal for the caller and the deadline. `requestJson`'s `timeoutMs`
  // alone never aborted the request: given the caller's signal, the request
  // listens to that one instead of the deadline's. `timeoutMs` still bounds
  // the token read.
  const body = yield* Effect.acquireUseRelease(
    Effect.sync(() => withDeadline(signal, SUGGEST_TIMEOUT_MS)),
    (deadline) =>
      requestJson<{ picks?: unknown; source?: unknown }>(
        getToken,
        `/api/trips/${encodeURIComponent(tripId)}/ideas/suggest-days`,
        { method: "POST", body: JSON.stringify(suggestRequest(idea)), signal: deadline.signal },
        { timeoutMs: SUGGEST_TIMEOUT_MS, timeoutMessage: TOO_SLOW },
      ).pipe(Effect.mapError((err) => (deadline.timedOut() ? new TimeoutError({ message: TOO_SLOW }) : err))),
    (deadline) => Effect.sync(deadline.release),
  )
  const picks = Array.isArray(body.picks) ? body.picks.filter(isPick).slice(0, 3) : []
  return { picks, source: body.source === "ai" ? "ai" : "nearby" } satisfies DaySuggestions
})

export function suggestDays(getToken: GetToken, tripId: string, idea: ItineraryItem, signal?: AbortSignal): Promise<DaySuggestions> {
  return runPromise(suggestDaysEffect(getToken, tripId, idea, signal))
}

/** "650 m", "1.2 km", "9.9 km", "10 km", "14 km" (the server's `formatKm`). */
export function formatKm(km: number): string {
  const meters = Math.round((km * 1000) / 50) * 50
  if (meters < 1000) return `${Math.max(50, meters)} m`
  // Rounded before choosing the form: 9.96 is "10 km", never "10.0 km".
  const tenths = Math.round(km * 10) / 10
  return tenths < 10 ? `${tenths.toFixed(1)} km` : `${Math.round(km)} km`
}
