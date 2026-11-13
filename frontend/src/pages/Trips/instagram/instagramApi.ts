import { Effect } from "effect"
import { HttpStatusError } from "../../../effect/errors"
import { bearerHeaders, fetchApi, parseJson, readAuthToken, readErrorMessage } from "../../../effect/http"
import { runPromise } from "../../../effect/runtime"

// Client for the Instagram place extractor. A post goes in as a link; the
// server reads the caption, the video and the comments, and each place it
// names comes back geocoded. Places belong to the signed-in user, not to a
// trip: adding one to a day copies it into the trip document.

const BASE = "/api/instagram"

export type GetToken = () => Promise<string | null>

export type IgJobStatus = "pending" | "running" | "done" | "failed" | "dead"
export type IgJobStep = "queued" | "fetching" | "bundling" | "extracting" | "geocoding" | "saving" | "done"

export interface IgPlace {
  id: number
  post_id: number | null
  name: string
  name_romanized: string | null
  city: string | null
  category: string
  confidence_band: "high" | "medium" | "low"
  is_subject?: boolean
  supporting_quote: string | null
  address: string | null
  lat: number | null
  lng: number | null
  google_place_id?: string | null
  rating?: number | null
  geocode_disagree?: boolean
}

export interface IgJob {
  id: number
  url: string
  status: IgJobStatus
  step: IgJobStep
  step_started_at: string | null
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
  post_id: number | null
  skip_video?: boolean | null
  places: IgPlace[]
  post_preview: {
    caption: string | null
    owner_username?: string | null
    shortcode?: string | null
    location_tag?: { name?: string } | null
  } | null
}

export interface SavedPlace extends IgPlace {
  created_at: string
  post: { id: number; url: string; shortcode: string | null; owner_username: string | null; caption: string | null } | null
}

export interface SubmitResult {
  jobs: Array<{ jobId: number; status: IgJobStatus; reused: boolean; shared_from_other_user?: number }>
}

/** The server has no extractor to talk to (no database or auth configured). */
export class IgNotConfiguredError extends Error {
  readonly _tag = "IgNotConfiguredError" as const
  constructor() {
    super("Instagram import isn’t switched on for this server.")
    this.name = "IgNotConfiguredError"
  }
}

const check = (res: Response) =>
  Effect.gen(function* () {
    const type = res.headers.get("content-type") ?? ""
    // A 200 that isn't JSON is the SPA shell answering for an unmounted route.
    if (res.ok && res.status !== 204 && !type.includes("application/json")) {
      return yield* Effect.fail(new IgNotConfiguredError())
    }
    if (res.ok) return
    const message = yield* readErrorMessage(res, "error-first")
    if (res.status === 503 && /not_configured/i.test(message)) return yield* Effect.fail(new IgNotConfiguredError())
    return yield* Effect.fail(new HttpStatusError({ status: res.status, message }))
  })

const submitEffect = Effect.fn("Instagram.submit")(function* (getToken: GetToken, urls: string[], skipVideo: boolean) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearerHeaders(token) },
    body: JSON.stringify({ urls, ...(skipVideo ? { skipVideo: true } : { skipVideo: false }) }),
  })
  yield* check(res)
  return yield* parseJson<SubmitResult>(res)
})

const jobsEffect = Effect.fn("Instagram.jobs")(function* (getToken: GetToken, limit: number) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`${BASE}/jobs?limit=${limit}&logs=0`, { headers: bearerHeaders(token), cache: "no-store" })
  yield* check(res)
  return yield* parseJson<IgJob[]>(res)
})

const jobActionEffect = Effect.fn("Instagram.jobAction")(function* (
  getToken: GetToken,
  jobId: number,
  action: "retry" | "reextract",
) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`${BASE}/jobs/${jobId}/${action}`, { method: "POST", headers: bearerHeaders(token) })
  yield* check(res)
})

const savedEffect = Effect.fn("Instagram.saved")(function* (
  getToken: GetToken,
  opts: { q?: string; limit?: number; offset?: number },
) {
  const token = yield* readAuthToken(getToken)
  const params = new URLSearchParams({ limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0) })
  if (opts.q?.trim()) params.set("q", opts.q.trim())
  const res = yield* fetchApi(`${BASE}/extracted?${params.toString()}`, { headers: bearerHeaders(token), cache: "no-store" })
  yield* check(res)
  return yield* parseJson<{ places: SavedPlace[]; total: number; hasMore: boolean }>(res)
})

const removeSavedEffect = Effect.fn("Instagram.removeSaved")(function* (getToken: GetToken, placeId: number) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`${BASE}/extracted/${placeId}`, { method: "DELETE", headers: bearerHeaders(token) })
  yield* check(res)
})

/** Queue posts. `skipVideo` reads the caption and comments only (seconds, not a minute). */
export function submitPosts(getToken: GetToken, urls: string[], skipVideo: boolean): Promise<SubmitResult> {
  return runPromise(submitEffect(getToken, urls, skipVideo))
}

export function listJobs(getToken: GetToken, limit = 30): Promise<IgJob[]> {
  return runPromise(jobsEffect(getToken, limit))
}

/** Re-queue a post that failed. */
export function retryJob(getToken: GetToken, jobId: number): Promise<void> {
  return runPromise(jobActionEffect(getToken, jobId, "retry"))
}

/** Read a post again from scratch (its places are replaced). */
export function reextractJob(getToken: GetToken, jobId: number): Promise<void> {
  return runPromise(jobActionEffect(getToken, jobId, "reextract"))
}

export function listSaved(
  getToken: GetToken,
  opts: { q?: string; limit?: number; offset?: number } = {},
): Promise<{ places: SavedPlace[]; total: number; hasMore: boolean }> {
  return runPromise(savedEffect(getToken, opts))
}

export function removeSaved(getToken: GetToken, placeId: number): Promise<void> {
  return runPromise(removeSavedEffect(getToken, placeId))
}
