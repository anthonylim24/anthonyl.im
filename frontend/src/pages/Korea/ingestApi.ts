import { Effect } from "effect"
import { bearerHeaders, fetchApi, parseJson, readAuthToken, readErrorMessage } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { HttpStatusError } from "../../effect/errors"

export type PlaceResult = {
  id: number
  name: string
  name_romanized: string | null
  city: string | null
  category: "restaurant" | "cafe" | "bar" | "shopping" | "activity" | "hotel" | "landmark" | "other"
  confidence: number
  confidence_band: "high" | "medium" | "low"
  is_subject: boolean
  supporting_quote: string | null
  address: string | null
  lat: number | null
  lng: number | null
  geocode_source: string | null
  geocode_disagree: boolean
  signal_source: "caption" | "transcript" | "ocr" | "location_tag" | "multiple" | null
  vote_count: number
}

export type JobStatus = "pending" | "running" | "done" | "failed" | "dead"
export type JobStep = "queued" | "fetching" | "bundling" | "extracting" | "geocoding" | "saving" | "done"

export interface LogLine {
  id: number
  job_id: number
  step: JobStep
  level: "info" | "warn" | "error"
  message: string
  created_at: string
}

export interface PostPreview {
  caption: string | null
  caption_truncated: boolean
  transcript: string | null
  transcript_truncated: boolean
  has_ocr: boolean
  location_tag: { name?: string; lat?: number; lng?: number } | null
}

export type Job = {
  id: number
  url: string
  status: JobStatus
  step: JobStep
  step_started_at: string | null
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
  post_id: number | null
  places: PlaceResult[]
  logs: LogLine[]
  post_preview: PostPreview | null
}

export type Stats = {
  enabled: boolean
  pending?: number
  running?: number
  done?: number
  failed?: number
  dead?: number
  error?: string
}

type SubmitResult = {
  jobs: Array<{ jobId: number; status: string; reused: boolean; shared_from_other_user?: number }>
}

const BASE = "/api/korea/places/from-instagram"

/** Common error type so callers can branch on infrastructure misconfig. */
export class ApiNotConfiguredError extends Error {
  readonly _tag = "ApiNotConfiguredError" as const
  constructor(message = "The Instagram places API is not configured on the server.") {
    super(message)
    this.name = "ApiNotConfiguredError"
  }
}

const throwOnError = (res: Response): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const ct = res.headers.get("content-type") ?? ""
    if (res.ok && !ct.includes("application/json")) {
      return yield* Effect.fail(
        new ApiNotConfiguredError(
          `Server returned ${ct || "no content-type"} instead of JSON — the IG places ` +
            `endpoint is not mounted. Set CLERK_SECRET_KEY (or IG_DEV_BEARER) on the server.`,
        ),
      )
    }
    if (res.ok) return
    const message = yield* readErrorMessage(res, "error-first")
    if (res.status === 503 && message.toLowerCase().includes("not_configured")) {
      return yield* Effect.fail(new ApiNotConfiguredError(message))
    }
    return yield* Effect.fail(new HttpStatusError({ status: res.status, message }))
  })

const submitUrlEffect = Effect.fn("IngestService.submitUrl")(function* (
  getToken: () => Promise<string | null>,
  url: string,
  opts?: { skipVideo?: boolean },
) {
  const token = yield* readAuthToken(getToken)
  const body: Record<string, unknown> = { url }
  if (opts?.skipVideo) body.skipVideo = true
  const res = yield* fetchApi(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bearerHeaders(token) },
    body: JSON.stringify(body),
  })
  yield* throwOnError(res)
  return yield* parseJson<SubmitResult>(res)
})

export function submitUrl(
  getToken: () => Promise<string | null>,
  url: string,
  opts?: { skipVideo?: boolean },
): Promise<SubmitResult> {
  return runPromise(submitUrlEffect(getToken, url, opts))
}

const listJobsEffect = Effect.fn("IngestService.listJobs")(function* (
  getToken: () => Promise<string | null>,
  limit = 200,
) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`${BASE}/jobs?limit=${limit}`, { headers: bearerHeaders(token) })
  yield* throwOnError(res)
  return yield* parseJson<Job[]>(res)
})

export function listJobs(getToken: () => Promise<string | null>, limit = 200): Promise<Job[]> {
  return runPromise(listJobsEffect(getToken, limit))
}

const retryJobEffect = Effect.fn("IngestService.retryJob")(function* (
  getToken: () => Promise<string | null>,
  jobId: number,
) {
  const token = yield* readAuthToken(getToken)
  const r = yield* fetchApi(`${BASE}/jobs/${jobId}/retry`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  })
  if (!r.ok) {
    const msg = yield* readErrorMessage(r, "error-only")
    return yield* Effect.fail(new HttpStatusError({ status: r.status, message: msg }))
  }
})

export function retryJob(getToken: () => Promise<string | null>, jobId: number): Promise<void> {
  return runPromise(retryJobEffect(getToken, jobId))
}

const reextractJobEffect = Effect.fn("IngestService.reextractJob")(function* (
  getToken: () => Promise<string | null>,
  jobId: number,
) {
  const token = yield* readAuthToken(getToken)
  const r = yield* fetchApi(`${BASE}/jobs/${jobId}/reextract`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  })
  if (!r.ok) {
    const msg = yield* readErrorMessage(r, "error-only")
    return yield* Effect.fail(new HttpStatusError({ status: r.status, message: msg }))
  }
})

export function reextractJob(getToken: () => Promise<string | null>, jobId: number): Promise<void> {
  return runPromise(reextractJobEffect(getToken, jobId))
}

const fetchStatsEffect = Effect.fn("IngestService.fetchStats")(function* (
  getToken: () => Promise<string | null>,
) {
  const token = yield* readAuthToken(getToken)
  const res = yield* fetchApi(`${BASE}/_stats`, { headers: bearerHeaders(token) })
  yield* throwOnError(res)
  return yield* parseJson<Stats>(res)
})

export function fetchStats(getToken: () => Promise<string | null>): Promise<Stats> {
  return runPromise(fetchStatsEffect(getToken))
}
