import { Effect, Schema } from "effect"
import { apiFetch } from "../lib/apiBase"
import { DecodeError, HttpStatusError, TimeoutError } from "./errors"

const ErrorEnvelope = Schema.Struct({
  error: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.Unknown),
})

export type GetToken = () => Promise<string | null>

/** Wrap `apiFetch` so preview-base rewriting and `redirect: "manual"` stay
 *  the single transport. Native `Error`s (TypeError "Failed to fetch") are
 *  rethrown unchanged so existing UI copy and tests keep matching. */
export const fetchApi = (
  path: string,
  init?: RequestInit,
): Effect.Effect<Response, Error> =>
  Effect.tryPromise({
    try: () => apiFetch(path, init),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })

/** Absolute-URL fetch for third-party APIs (Wikipedia, Google Places).
 *  Do not use `fetchApi` here — that helper rewrites relative `/api` paths. */
export const fetchExternal = (
  url: string,
  init?: RequestInit,
): Effect.Effect<Response, Error> =>
  Effect.tryPromise({
    try: () => fetch(url, init),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })

export const readAuthToken = (getToken: GetToken): Effect.Effect<string | null, Error> =>
  Effect.tryPromise({
    try: () => getToken(),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })

export const bearerHeaders = (token: string | null, extra?: Record<string, string>): Record<string, string> => ({
  ...extra,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

export type ErrorMessageMode = "message-first" | "error-first" | "error-only"

/** Pull `error` / `message` off a JSON error body. Falls back to `HTTP <status>`.
 *  Mode matches each legacy API's field priority so UI copy stays identical. */
export const readErrorMessage = (
  res: Response,
  mode: ErrorMessageMode = "message-first",
): Effect.Effect<string, never> =>
  Effect.gen(function* () {
    const fallback = `HTTP ${res.status}`
    const raw: unknown = yield* Effect.tryPromise({
      try: () => res.json() as Promise<unknown>,
      catch: () => fallback,
    }).pipe(Effect.catchAll(() => Effect.succeed<unknown>(null)))
    const decoded = Schema.decodeUnknownEither(ErrorEnvelope)(raw)
    if (decoded._tag === "Left") return fallback
    const { error, message } = decoded.right
    const errorStr = typeof error === "string" && error.length > 0 ? error : undefined
    const messageStr = typeof message === "string" && message.length > 0 ? message : undefined
    switch (mode) {
      case "error-only":
        return errorStr ?? fallback
      case "error-first":
        return errorStr ?? messageStr ?? fallback
      default:
        return messageStr ?? errorStr ?? fallback
    }
  })

export const parseJson = <T>(res: Response): Effect.Effect<T, DecodeError> =>
  Effect.tryPromise({
    try: () => res.json() as Promise<T>,
    catch: () => new DecodeError({ message: `HTTP ${res.status}` }),
  })

export const requireOk = (res: Response): Effect.Effect<Response, HttpStatusError> =>
  Effect.gen(function* () {
    if (res.ok) return res
    const message = yield* readErrorMessage(res)
    return yield* Effect.fail(new HttpStatusError({ status: res.status, message }))
  })

export interface RequestOptions {
  /**
   * Give up after this many milliseconds, the token read included, with a
   * `TimeoutError` carrying `timeoutMessage`; the request in flight is
   * aborted. Off by default. Not for AI calls, which can rightly take minutes.
   */
  timeoutMs?: number
  timeoutMessage?: string
}

/** `fetchApi` that aborts the request when its fiber is interrupted (a deadline passing). */
const fetchApiAbortable = (path: string, init: RequestInit): Effect.Effect<Response, Error> =>
  Effect.tryPromise({
    try: (signal) => apiFetch(path, { ...init, signal: init.signal ?? signal }),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })

/** Authenticated JSON request used by trips / places / ingest. */
export const requestJson = <T>(
  getToken: GetToken,
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Effect.Effect<T, Error | HttpStatusError | DecodeError | TimeoutError> => {
  const { timeoutMs } = options
  const request = Effect.gen(function* () {
    const token = yield* readAuthToken(getToken)
    const headers = new Headers(init.headers)
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (token) headers.set("Authorization", `Bearer ${token}`)
    const sent = { ...init, headers, cache: "no-store" as const }
    const res = yield* timeoutMs === undefined ? fetchApi(path, sent) : fetchApiAbortable(path, sent)
    yield* requireOk(res)
    return yield* parseJson<T>(res)
  })
  if (timeoutMs === undefined) return request
  return request.pipe(
    Effect.timeoutFail({
      duration: timeoutMs,
      onTimeout: () => new TimeoutError({ message: options.timeoutMessage ?? "The server didn’t answer in time." }),
    }),
  )
}

/** Wait `ms`. With a `signal`, an abort ends the wait at once (the caller
 *  checks `signal.aborted` next), and an interrupted fiber clears the timer. */
export const sleep = (ms: number, signal?: AbortSignal): Effect.Effect<void> =>
  Effect.async<void>((resume) => {
    if (signal?.aborted) return resume(Effect.void)
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", done)
      resume(Effect.void)
    }
    const timer = setTimeout(done, ms)
    signal?.addEventListener("abort", done)
    return Effect.sync(() => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", done)
    })
  })
