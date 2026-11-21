import { Effect } from "effect"
import { AuthError, HttpStatusError, PollTimeoutError } from "../../effect/errors"
import { bearerHeaders, fetchApi, parseJson, readAuthToken, requestJson, requireOk, sleep, type RequestOptions } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { TripConflictError, TripRefusedError } from "./tripConflict"
import { describeRefusal } from "./offline/saveIssues"
import type {
  ChecklistItem,
  EnhancementRun,
  GeneratePreferences,
  ItineraryItem,
  Trip,
  TripAccess,
  TripAppearance,
  TripBudget,
  TripCenter,
  TripCollaborator,
  TripInvite,
  CollaboratorRole,
  TripDay,
  TripExpense,
  TripPerson,
  TripStatus,
  TripSummary,
} from "./types"

export type GetToken = () => Promise<string | null>

function request<T>(getToken: GetToken, path: string, init: RequestInit = {}, options?: RequestOptions): Promise<T> {
  return runPromise(requestJson<T>(getToken, `/api/trips${path}`, init, options))
}

/** Opt-in deadline for reads (`READ_TIMEOUT_MS` in offline/network); never for AI calls. */
export interface ReadOptions {
  timeoutMs?: number
}

const readOptions = (options?: ReadOptions): RequestOptions | undefined =>
  options?.timeoutMs === undefined ? undefined : { timeoutMs: options.timeoutMs, timeoutMessage: "Couldn’t reach the server." }

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
  center?: TripCenter
}

export const listTrips = (getToken: GetToken, options?: ReadOptions) =>
  request<{ trips: TripSummary[] }>(getToken, "", {}, readOptions(options)).then((r) => r.trips)

export const getTrip = (getToken: GetToken, id: string, options?: ReadOptions) =>
  request<{ trip: Trip; access: TripAccess }>(getToken, `/${encodeURIComponent(id)}`, {}, readOptions(options))

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
  center?: TripCenter
  /** `null` removes the budget. */
  budget?: TripBudget | null
  party?: TripPerson[]
  expenses?: TripExpense[]
  checklist?: ChecklistItem[]
  ideas?: ItineraryItem[]
  /** The `updatedAt` this change was made against; see `updateTrip`. */
  baseUpdatedAt?: string
}

const updateTripEffect = Effect.fn("TripsService.update")(function* (
  getToken: GetToken,
  id: string,
  patch: UpdateTripPatch,
  signal?: AbortSignal,
) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`/api/trips/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: bearerHeaders(token, { "Content-Type": "application/json" }),
    cache: "no-store",
    body: JSON.stringify(patch),
    signal,
  })
  if (res.status === 409) {
    const body = yield* parseJson<{ error?: string; message?: string; trip?: Trip }>(res).pipe(
      Effect.orElseSucceed(() => ({}) as { error?: string; message?: string; trip?: Trip }),
    )
    if (body.error === "conflict" && body.trip) {
      return yield* Effect.fail(
        new TripConflictError({ message: "Someone else changed this trip since it was opened.", trip: body.trip }),
      )
    }
    // A link name someone else has: the same PATCH would only be refused again.
    return yield* Effect.fail(new TripRefusedError({ message: body.message || body.error || "HTTP 409" }))
  }
  if (res.status === 400) {
    // `readErrorMessage` would keep only `error` ("invalid update"); the
    // `issues` say which field, which is what the traveller needs to fix it.
    const body = yield* parseJson<unknown>(res).pipe(Effect.orElseSucceed(() => null))
    return yield* Effect.fail(new TripRefusedError({ message: describeRefusal(body) }))
  }
  yield* requireOk(res)
  const body = yield* parseJson<{ trip: Trip }>(res)
  return body.trip
})

/**
 * Write trip fields. With `baseUpdatedAt` (the `updatedAt` the change was
 * made against) a server that has a newer copy writes nothing and this
 * rejects with `TripConflictError` carrying that copy. Servers that predate
 * the check ignore the field and write as before.
 */
export const updateTrip = (
  getToken: GetToken,
  id: string,
  patch: UpdateTripPatch,
  init?: Pick<RequestInit, "signal">,
): Promise<Trip> => runPromise(updateTripEffect(getToken, id, patch, init?.signal ?? undefined))

export const deleteTrip = (getToken: GetToken, id: string) =>
  request<{ ok: boolean }>(getToken, `/${encodeURIComponent(id)}`, { method: "DELETE" })

export const createInvite = (getToken: GetToken, id: string, role: CollaboratorRole) =>
  request<{ invite: TripInvite }>(getToken, `/${encodeURIComponent(id)}/invites`, {
    method: "POST",
    body: JSON.stringify({ role }),
  }).then((r) => r.invite)

export const revokeInvite = (getToken: GetToken, id: string, token: string) =>
  request<{ ok: boolean }>(getToken, `/${encodeURIComponent(id)}/invites/${encodeURIComponent(token)}`, {
    method: "DELETE",
  })

export const joinTrip = (getToken: GetToken, token: string, name?: string) =>
  request<{ trip: { id: string; slug?: string; name: string }; access: TripAccess }>(
    getToken,
    `/join/${encodeURIComponent(token)}`,
    { method: "POST", body: JSON.stringify(name ? { name } : {}) },
  )

export const leaveTrip = (getToken: GetToken, id: string) =>
  request<{ ok: boolean }>(getToken, `/${encodeURIComponent(id)}/leave`, { method: "POST" })

/** Statuses that describe what happened on the original trip, not the plan. */
const LIVED: ReadonlySet<ItineraryItem["status"]> = new Set(["booked", "completed", "skipped"])

/**
 * A stop as a template: the plan stays (place, time, notes, what the booking
 * is), what belonged to the original journey goes (bookings made, stops done
 * or skipped, highlights, the confirmation number and seat).
 */
function templateItem(item: ItineraryItem, id: string): ItineraryItem {
  const out: ItineraryItem = { ...item, id, status: LIVED.has(item.status) ? "none" : item.status, highlight: undefined }
  if (item.reservation) {
    out.reservation = {
      ...item.reservation,
      status: item.reservation.status === "confirmed" ? "pending" : item.reservation.status,
      confirmation: undefined,
      seat: undefined,
    }
  }
  return out
}

/** Copy a trip (days, look, place) into a new draft owned by the caller. */
export async function duplicateTrip(getToken: GetToken, source: Trip): Promise<Trip> {
  const name = `${source.name} (copy)`.slice(0, 160)
  const created = await createTrip(getToken, {
    name,
    destinations: source.destinations,
    startDate: source.startDate,
    endDate: source.endDate,
    timezone: source.timezone,
    tags: source.tags,
    description: source.description,
    center: source.center,
  })
  const byDate = new Map(source.days.map((d) => [d.date, d]))
  const stamp = () => `it-${crypto.randomUUID().slice(0, 8)}`
  // A copy is a template for another trip: the plan, budget and lists come
  // along; ticks, journals, highlights and bookings made are cleared, and
  // money already spent stays with the original.
  try {
    return await updateTrip(getToken, created.id, {
      appearance: source.appearance,
      budget: source.budget,
      party: source.party,
      checklist: source.checklist?.map((entry) => ({ ...entry, done: false })),
      ideas: source.ideas?.map((idea) => templateItem(idea, stamp())),
      days: created.days.map((day) => {
        const from = byDate.get(day.date)
        if (!from) return day
        return { ...from, id: day.id, journal: undefined, items: from.items.map((item) => templateItem(item, stamp())) }
      }),
    })
  } catch (err) {
    // Without its plan the new trip is an empty shell named like a copy:
    // remove it, so a retry doesn't leave a pile of them behind.
    const removed = await deleteTrip(getToken, created.id).then(
      () => true,
      () => false,
    )
    if (removed) throw err
    throw new Error(`Couldn’t copy the plan, and an empty “${name}” is left in your trips to delete. (${err instanceof Error ? err.message : String(err)})`, {
      cause: err,
    })
  }
}

export const generateItinerary = (
  getToken: GetToken,
  id: string,
  input: { prompt?: string; preferences?: GeneratePreferences; replaceExisting?: boolean },
  signal?: AbortSignal,
) =>
  // A slow draft answers 200 with a heartbeat body, so a late failure
  // arrives as `{ error, message }` rather than a status code.
  request<{ trip?: Trip; summary?: string; incompleteDays?: number[]; error?: string; message?: string }>(getToken, `/${encodeURIComponent(id)}/generate`, {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  }).then((body) => {
    if (!body.trip) throw new Error(body.message ?? body.error ?? "The draft did not finish.")
    return { trip: body.trip, summary: body.summary, incompleteDays: body.incompleteDays ?? [] }
  })

export interface EnhanceTripResult {
  run: EnhancementRun
  trip?: Trip
  applied?: string[]
  error?: string
  message?: string
}

const ENHANCE_POLL_MS = 180_000

/** What `fetch` rejects with on abort, so callers test one shape. */
const abortError = () => Object.assign(new Error("The AI run was stopped."), { name: "AbortError" })

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
  signal?: AbortSignal,
) {
  const deadline = Date.now() + ENHANCE_POLL_MS
  let wait = 400
  while (Date.now() < deadline) {
    yield* sleep(wait, signal)
    if (signal?.aborted) return yield* Effect.fail(abortError())
    wait = Math.min(Math.round(wait * 1.35), 2000)
    const token = yield* readAuthToken(getToken)
    const res = yield* fetchApi(
      `/api/trips/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
        signal,
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
  signal?: AbortSignal,
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
    signal,
  })
  const body = yield* readEnhanceBody(res)
  if (body.run?.status === "running") return yield* pollEnhancement(getToken, id, body.run.id, signal)
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
 *  with a `{ run }` body is still accepted so older servers keep working.
 *  Aborting `signal` stops the wait (it rejects with an `AbortError`); the
 *  server may still finish the run, and its changes arrive like any other. */
export function enhanceTrip(
  getToken: GetToken,
  id: string,
  scope: "day" | "trip",
  dayId?: string,
  prompt?: string,
  signal?: AbortSignal,
): Promise<EnhanceTripResult> {
  return runPromise(enhanceTripEffect(getToken, id, scope, dayId, prompt, signal))
}

export const applySuggestions = (getToken: GetToken, id: string, runId: string, suggestionIds: string[]) =>
  request<{ trip: Trip; applied: string[]; skipped: string[] }>(
    getToken,
    `/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}/apply`,
    { method: "POST", body: JSON.stringify({ suggestionIds }) },
  )
