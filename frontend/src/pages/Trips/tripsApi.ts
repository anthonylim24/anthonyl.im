import { Effect } from "effect"
import { AuthError, HttpStatusError, PollTimeoutError } from "../../effect/errors"
import { fetchApi, parseJson, readAuthToken, requestJson, sleep } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import type {
  EnhancementRun,
  GeneratePreferences,
  Trip,
  TripAccess,
  TripAppearance,
  TripCollaborator,
  TripDay,
  TripStatus,
  TripSummary,
} from "./types"

export type GetToken = () => Promise<string | null>

function request<T>(getToken: GetToken, path: string, init: RequestInit = {}): Promise<T> {
  return runPromise(requestJson<T>(getToken, `/api/trips${path}`, init))
}

export interface CreateTripInput {
  name: string
  destinations: string[]
  startDate: string
  endDate: string
  timezone: string
  status?: TripStatus
  tags?: string[]
  description?: string
  collaborators?: TripCollaborator[]
}

export const listTrips = (getToken: GetToken) =>
  request<{ trips: TripSummary[] }>(getToken, "").then((r) => r.trips)

export const getTrip = (getToken: GetToken, id: string) =>
  request<{ trip: Trip; access: TripAccess }>(getToken, `/${encodeURIComponent(id)}`)

export const createTrip = (getToken: GetToken, input: CreateTripInput) =>
  request<{ trip: Trip }>(getToken, "", { method: "POST", body: JSON.stringify(input) }).then((r) => r.trip)

export type UpdateTripPatch = {
  name?: string
  destinations?: string[]
  startDate?: string
  endDate?: string
  timezone?: string
  status?: TripStatus
  tags?: string[]
  collaborators?: TripCollaborator[]
  days?: TripDay[]
  slug?: string
  appearance?: TripAppearance
  description?: string | null
}

export const updateTrip = (
  getToken: GetToken,
  id: string,
  patch: UpdateTripPatch,
  init?: Pick<RequestInit, "signal">,
) =>
  request<{ trip: Trip }>(getToken, `/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    signal: init?.signal,
  }).then((r) => r.trip)

export const deleteTrip = (getToken: GetToken, id: string) =>
  request<{ ok: boolean }>(getToken, `/${encodeURIComponent(id)}`, { method: "DELETE" })

export const generateItinerary = (
  getToken: GetToken,
  id: string,
  input: { prompt?: string; preferences?: GeneratePreferences; replaceExisting?: boolean },
) =>
  request<{ trip: Trip; summary?: string }>(getToken, `/${encodeURIComponent(id)}/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  })

export interface EnhanceTripResult {
  run: EnhancementRun
  trip?: Trip
  applied?: string[]
  error?: string
  message?: string
}

const ENHANCE_POLL_MS = 180_000

const readEnhanceBody = (res: Response): Effect.Effect<EnhanceTripResult, Error> =>
  parseJson<EnhanceTripResult>(res).pipe(
    Effect.flatMap((body) => {
      if (typeof body !== "object" || body === null) {
        return Effect.fail(new Error(`HTTP ${res.status}`))
      }
      return Effect.succeed(body)
    }),
    Effect.mapError(() => new Error(`HTTP ${res.status}`)),
  )

const pollEnhancement = Effect.fn("TripsService.pollEnhancement")(function* (
  getToken: GetToken,
  id: string,
  runId: string,
) {
  const deadline = Date.now() + ENHANCE_POLL_MS
  let wait = 400
  while (Date.now() < deadline) {
    yield* sleep(wait)
    wait = Math.min(Math.round(wait * 1.35), 2000)
    const token = yield* readAuthToken(getToken)
    const res = yield* fetchApi(
      `/api/trips/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      },
    )
    if (res.status === 401 || res.status === 403) {
      return yield* Effect.fail(new AuthError({ message: "Please sign in again to finish the AI review." }))
    }
    if (!res.ok) continue
    const body = yield* readEnhanceBody(res)
    if (body.run && body.run.status !== "running") {
      return {
        ...body,
        applied: body.applied ?? body.run.appliedSuggestionIds,
      } satisfies EnhanceTripResult
    }
  }
  return yield* Effect.fail(
    new PollTimeoutError({
      message: "The AI review is taking too long. Nothing in your itinerary changed, so you can run it again.",
    }),
  )
})

const enhanceTripEffect = Effect.fn("TripsService.enhanceTrip")(function* (
  getToken: GetToken,
  id: string,
  scope: "day" | "trip",
  dayId?: string,
  prompt?: string,
) {
  const token = yield* readAuthToken(getToken)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = yield* fetchApi(`/api/trips/${encodeURIComponent(id)}/enhance`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({ scope, dayId, prompt: prompt?.trim() || undefined }),
  })
  const body = yield* readEnhanceBody(res)
  if (body.run?.status === "running") return yield* pollEnhancement(getToken, id, body.run.id)
  if (res.ok) return body
  if (res.status === 502 && body.run) return body
  return yield* Effect.fail(
    new HttpStatusError({
      status: res.status,
      message: body.message || body.error || `HTTP ${res.status}`,
    }),
  )
})

/** Starts a run (202) and polls until it leaves `running`. A legacy 502
 *  with a `{ run }` body is still accepted so older servers keep working. */
export function enhanceTrip(
  getToken: GetToken,
  id: string,
  scope: "day" | "trip",
  dayId?: string,
  prompt?: string,
): Promise<EnhanceTripResult> {
  return runPromise(enhanceTripEffect(getToken, id, scope, dayId, prompt))
}

export const applySuggestions = (getToken: GetToken, id: string, runId: string, suggestionIds: string[]) =>
  request<{ trip: Trip; applied: string[]; skipped: string[] }>(
    getToken,
    `/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}/apply`,
    { method: "POST", body: JSON.stringify({ suggestionIds }) },
  )

const listForeignInstagramTripsEffect = Effect.fn("TripsService.listForeignInstagramTrips")(
  function* (getToken: GetToken, currentTripId: string) {
    const summaries = yield* Effect.tryPromise({
      try: () => listTrips(getToken),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
    const others = summaries.filter((s) => s.id !== currentTripId)
    const loaded = yield* Effect.all(
      others.map((s) =>
        Effect.tryPromise({
          try: () => getTrip(getToken, s.id).then((r) => r.trip),
          catch: () => null as Trip | null,
        }).pipe(Effect.catchAll(() => Effect.succeed<Trip | null>(null))),
      ),
      { concurrency: "unbounded" },
    )
    return loaded.filter((t): t is Trip => t != null)
  },
)

/** Other trips' Instagram places, via list+get (routes that exist on production). */
export function listForeignInstagramTrips(getToken: GetToken, currentTripId: string): Promise<Trip[]> {
  return runPromise(listForeignInstagramTripsEffect(getToken, currentTripId))
}
