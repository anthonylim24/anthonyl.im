import { Effect, Schema } from "effect"
import { apiFetch } from "../lib/apiBase"
import { DecodeError, HttpStatusError } from "./errors"

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

export const readAuthToken = (getToken: GetToken): Effect.Effect<string | null, Error> =>
  Effect.tryPromise({
    try: () => getToken(),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  })

export const bearerHeaders = (token: string | null, extra?: Record<string, string>): Record<string, string> => ({
  ...extra,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

export type ErrorMessageMode = "message-first" | "error-first" | "error-only" | "message-only"

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
      case "message-only":
        return messageStr ?? fallback
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

/** Authenticated JSON request used by trips / places / ingest. */
export const requestJson = <T>(
  getToken: GetToken,
  path: string,
  init: RequestInit = {},
): Effect.Effect<T, Error | HttpStatusError | DecodeError> =>
  Effect.gen(function* () {
    const token = yield* readAuthToken(getToken)
    const headers = new Headers(init.headers)
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (token) headers.set("Authorization", `Bearer ${token}`)
    const res = yield* fetchApi(path, { ...init, headers, cache: "no-store" })
    yield* requireOk(res)
    return yield* parseJson<T>(res)
  })

export const sleep = (ms: number): Effect.Effect<void> =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
