import { Effect } from "effect"
import { AuthError, DecodeError, HttpStatusError, PollTimeoutError } from "../../effect/errors"
import {
  bearerHeaders,
  fetchApi,
  parseJson,
  readAuthToken,
  readErrorMessage,
  requestJson,
  requireOk,
  sleep,
  type RequestOptions,
} from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { TripConflictError, TripRefusedError } from "./tripConflict"
import { describeRefusal } from "./offline/saveIssues"
import { READ_TIMEOUT_MS, isOffline } from "./offline/network"
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

/** A copy whose plan never arrived, and whose empty shell couldn't be removed. `cause` is why the plan failed. */
class CopyLeftEmptyError extends Error {
  readonly cause: unknown
  constructor(message: string, cause: unknown) {
    super(message)
    this.name = "CopyLeftEmptyError"
    this.cause = cause
  }
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
    throw new CopyLeftEmptyError(
      `Couldn’t copy the plan, and an empty “${name}” is left in your trips to delete. (${err instanceof Error ? err.message : String(err)})`,
      err,
    )
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

/** Hears the run each time the server's copy of it moves: queued, working, a retry waiting. */
export type OnRunProgress = (run: EnhancementRun) => void

/** The first wait between looks at a run; it grows by about a third each time, to `POLL_MAX_MS`. */
const POLL_FIRST_MS = 400
const POLL_MAX_MS = 3_000
/**
 * How long a page follows one run before it stops asking. The server settles
 * a run still going after 30 minutes (`QUEUED_RUN_MAX_MS`) as failed, so one
 * still `running` past this is a run the server lost track of, not a slow one.
 * Counted from when this page began following, not from `run.createdAt`: the
 * device's clock and the server's need not agree.
 */
export const FOLLOW_CAP_MS = 32 * 60_000

/** What the page says when it stops following a run the server still calls running. */
export const STILL_RUNNING = "The AI review is still running on the server. Its changes will show up here when it finishes."

/** What `fetch` rejects with on abort, so callers test one shape. */
const abortError = () => Object.assign(new Error("The AI run was stopped."), { name: "AbortError" })

/** Statuses worth asking again after: the server, or a proxy in front of it, was busy or restarting. */
const passing = (status: number) => status >= 500 || status === 408 || status === 429

/** Wait while the browser says it is offline. An abort ends the wait (the caller checks `signal.aborted` next). */
const untilOnline = (signal?: AbortSignal): Effect.Effect<void> =>
  Effect.async<void>((resume) => {
    if (signal?.aborted || !isOffline()) return resume(Effect.void)
    const done = () => {
      window.removeEventListener("online", done)
      signal?.removeEventListener("abort", done)
      resume(Effect.void)
    }
    window.addEventListener("online", done)
    signal?.addEventListener("abort", done)
    return Effect.sync(() => {
      window.removeEventListener("online", done)
      signal?.removeEventListener("abort", done)
    })
  })

/** A response body as an enhance answer, or null when it isn't one (a proxy's error page). */
const readEnhanceBody = (res: Response): Effect.Effect<EnhanceTripResult | null> =>
  parseJson<EnhanceTripResult | null>(res).pipe(
    Effect.map((body) => (typeof body === "object" && body !== null ? body : null)),
    Effect.orElseSucceed(() => null),
  )

/** Calls `onProgress` with each run that differs from the last one it heard (its queue moved, or a 409 handed over another run). */
function progressReporter(onProgress?: OnRunProgress): (run: EnhancementRun) => void {
  let last = ""
  return (run) => {
    const key = JSON.stringify([run.id, run.scope, run.dayId ?? null, run.queue ?? null])
    if (key === last) return
    last = key
    onProgress?.(run)
  }
}

/** What one look at a run found. `noAnswer`: nothing usable came back, so look again later. */
type Look = { k: "settled"; result: EnhanceTripResult } | { k: "going"; run: EnhancementRun } | { k: "noAnswer" }

const NO_ANSWER: Look = { k: "noAnswer" }

/** A signal for one look: it aborts with `outer`, or by itself after `ms` (a connection that hangs). */
function lookSignal(outer: AbortSignal | undefined, ms: number) {
  const look = new AbortController()
  const stop = () => look.abort()
  const timer = setTimeout(stop, ms)
  if (outer?.aborted) look.abort()
  outer?.addEventListener("abort", stop)
  return {
    signal: look.signal,
    release: () => {
      clearTimeout(timer)
      outer?.removeEventListener("abort", stop)
    },
  }
}

/** One GET of the run. Fails only when the server says no (sign-in, a run it doesn't have). */
const askAboutRun = (getToken: GetToken, id: string, runId: string, signal: AbortSignal) =>
  Effect.gen(function* () {
    const token = yield* readAuthToken(getToken)
    const res = yield* fetchApi(`/api/trips/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}`, {
      headers: bearerHeaders(token),
      cache: "no-store",
      signal,
    })
    if (res.status === 401 || res.status === 403) {
      return yield* Effect.fail(new AuthError({ message: "Please sign in again to follow the AI review. It may still finish on the server." }))
    }
    if (res.status === 404) {
      return yield* Effect.fail(
        new HttpStatusError({ status: 404, message: "This AI review isn’t on the server any more. Reload to see where your trip stands." }),
      )
    }
    if (passing(res.status)) return NO_ANSWER
    if (!res.ok) {
      const reason = yield* readErrorMessage(res)
      return yield* Effect.fail(
        new HttpStatusError({ status: res.status, message: `Couldn’t follow the AI review (${reason}). Reload to see where your trip stands.` }),
      )
    }
    const body = yield* readEnhanceBody(res)
    if (!body?.run) return NO_ANSWER
    if (body.run.status === "running") return { k: "going", run: body.run } satisfies Look
    return { k: "settled", result: { ...body, applied: body.applied ?? body.run.appliedSuggestionIds } } satisfies Look
  })

/** One look, given at most `READ_TIMEOUT_MS`; anything short of the server saying no is no answer. */
const lookAtRun = (
  getToken: GetToken,
  id: string,
  runId: string,
  signal?: AbortSignal,
): Effect.Effect<Look, AuthError | HttpStatusError | Error> =>
  Effect.acquireUseRelease(
    Effect.sync(() => lookSignal(signal, READ_TIMEOUT_MS)),
    (look) => askAboutRun(getToken, id, runId, look.signal),
    (look) => Effect.sync(look.release),
  ).pipe(
    // No answer (a dropped connection, a look that hung, a token read that
    // failed): look again, unless the wait was stopped. Only the server
    // saying no ends the follow.
    Effect.catchAll((err) =>
      err instanceof AuthError || err instanceof HttpStatusError
        ? Effect.fail(err)
        : signal?.aborted
          ? Effect.fail(abortError())
          : Effect.succeed(NO_ANSWER),
    ),
  )

/**
 * Follow a run until it leaves `running`. There is no deadline but the
 * safety cap: the server retries a slow attempt and settles a run it can't
 * finish, so its word is the one that ends the wait. A dropped connection or
 * a busy server (5xx, 429) only means look again later; offline, it waits
 * for the connection to come back.
 */
const followRun = Effect.fn("TripsService.followEnhancement")(function* (
  getToken: GetToken,
  id: string,
  run: EnhancementRun,
  signal?: AbortSignal,
  onProgress?: OnRunProgress,
) {
  const report = progressReporter(onProgress)
  report(run)
  const since = Date.now()
  let wait = POLL_FIRST_MS
  for (;;) {
    yield* sleep(wait, signal)
    yield* untilOnline(signal)
    if (signal?.aborted) return yield* Effect.fail(abortError())
    wait = Math.min(Math.round(wait * 1.35), POLL_MAX_MS)
    const look = yield* lookAtRun(getToken, id, run.id, signal)
    if (look.k === "settled") return look.result
    if (look.k === "going") report(look.run)
    // Checked after a look, so a page that slept past the cap still asks once more.
    if (Date.now() - since >= FOLLOW_CAP_MS) return yield* Effect.fail(new PollTimeoutError({ message: STILL_RUNNING }))
  }
})

const enhanceTripEffect = Effect.fn("TripsService.enhanceTrip")(function* (
  getToken: GetToken,
  id: string,
  scope: "day" | "trip",
  dayId?: string,
  prompt?: string,
  signal?: AbortSignal,
  onProgress?: OnRunProgress,
) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`/api/trips/${encodeURIComponent(id)}/enhance`, {
    method: "POST",
    headers: bearerHeaders(token, { "Content-Type": "application/json" }),
    cache: "no-store",
    body: JSON.stringify({ scope, dayId, prompt: prompt?.trim() || undefined }),
    signal,
  })
  const body = yield* readEnhanceBody(res)
  // 202 with the new run, or 409 `enhancement_running` with the one already
  // going: either way there is a run in flight to follow.
  if (body?.run?.status === "running") return yield* followRun(getToken, id, body.run, signal, onProgress)
  // Older servers finished inline (200), or answered a failed run with a 502.
  if (body?.run && (res.ok || res.status === 502)) return body
  if (res.ok) {
    return yield* Effect.fail(
      new DecodeError({ message: "The server’s answer about the AI review couldn’t be read. Reload to see where your trip stands." }),
    )
  }
  return yield* Effect.fail(
    new HttpStatusError({
      status: res.status,
      message: body?.message || body?.error || `HTTP ${res.status}`,
    }),
  )
})

/**
 * Start a review (202) and follow it until it leaves `running`; a 409 with a
 * review already going follows that one. `onProgress` hears the run each time
 * its place in the server's queue moves. A legacy 502 with a `{ run }` body is
 * still accepted so older servers keep working. Aborting `signal` stops the
 * wait only (it rejects with an `AbortError`): the server goes on with the
 * run, and its changes arrive like any other.
 */
export function enhanceTrip(
  getToken: GetToken,
  id: string,
  scope: "day" | "trip",
  dayId?: string,
  prompt?: string,
  signal?: AbortSignal,
  onProgress?: OnRunProgress,
): Promise<EnhanceTripResult> {
  return runPromise(enhanceTripEffect(getToken, id, scope, dayId, prompt, signal, onProgress))
}

/** Follow a run already under way (found after a reload, or started on another device), as `enhanceTrip` follows its own. */
export function followEnhancement(
  getToken: GetToken,
  id: string,
  run: EnhancementRun,
  signal?: AbortSignal,
  onProgress?: OnRunProgress,
): Promise<EnhanceTripResult> {
  return runPromise(followRun(getToken, id, run, signal, onProgress))
}

/** A trip's reviews, newest first. A run the server lost track of is already settled as failed. */
export const listEnhancements = (getToken: GetToken, id: string, options?: ReadOptions) =>
  request<{ runs?: EnhancementRun[] }>(getToken, `/${encodeURIComponent(id)}/enhancements`, {}, readOptions(options)).then(
    (r) => r.runs ?? [],
  )

export const applySuggestions = (getToken: GetToken, id: string, runId: string, suggestionIds: string[]) =>
  request<{ trip: Trip; applied: string[]; skipped: string[] }>(
    getToken,
    `/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}/apply`,
    { method: "POST", body: JSON.stringify({ suggestionIds }) },
  )
