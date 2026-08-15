import { Effect } from "effect"
import { visibleConciergeText, type ConciergePlace, type ConciergeSource } from "../../lib/conciergeGrounding"
import { parseConciergeSsePayload } from "../../lib/conciergeSse"
import { AuthError, HttpStatusError, StreamError } from "../../effect/errors"
import { fetchApi, readAuthToken } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { readSse } from "../../effect/sse"
import { streamKoreaChat } from "../Korea/koreaChatApi"
import { isKoreaSeedTrip, wrapTripChatPrompt } from "./tripChatFallback"
import type { Trip } from "./types"

export interface TripChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface TripChatResult {
  content: string
  error?: string
  places?: ConciergePlace[]
  sources?: ConciergeSource[]
}

function isMissingChatRoute(status: number, error: string): boolean {
  if (status !== 404) return false
  return error !== "day not found" && error !== "trip not found"
}

function isLostConnection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /network\s*error|failed to fetch|load failed|opaqueredirect/i.test(message)
}

function remapChatFailure(err: unknown): Error {
  if (err instanceof DOMException && err.name === "AbortError") return err
  if (isLostConnection(err)) {
    return new Error("The concierge lost its connection. Please try again.")
  }
  return err instanceof Error ? err : new Error(String(err))
}

const streamTripChatEffect = Effect.fn("TripChatService.stream")(function* (
  tripId: string,
  prompt: string,
  messages: TripChatMessage[],
  dayId: string | undefined,
  getToken: () => Promise<string | null>,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
  trip?: Trip,
) {
  const token = yield* readAuthToken(getToken)
  const response = yield* fetchApi(`/api/trips/${encodeURIComponent(tripId)}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      messages,
      ...(dayId ? { dayId } : {}),
    }),
    credentials: "include",
    signal,
  }).pipe(Effect.mapError(remapChatFailure))

  if (response.type === "opaqueredirect" || response.status === 0) {
    return yield* Effect.fail(new Error("The concierge lost its connection. Please try again."))
  }

  if (!response.ok) {
    let error = ""
    let message = `Request failed (${response.status})`
    const raw: unknown = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => null,
    }).pipe(Effect.catchAll(() => Effect.succeed<unknown>(null)))

    if (raw && typeof raw === "object") {
      const body = raw as { error?: unknown; message?: unknown }
      error = typeof body.error === "string" ? body.error : ""
      if (response.status === 404) {
        if (error === "day not found") message = "This day is no longer on the trip."
        else if (error === "trip not found") message = "This trip could not be found."
        else message = "Concierge is not available on this server yet."
      } else if (typeof body.message === "string") message = body.message
      else if (body.error) message = String(body.error)
    } else if (response.status === 404) {
      message = "Concierge is not available on this server yet."
    }

    if (isMissingChatRoute(response.status, error)) {
      if ((trip && isKoreaSeedTrip(trip)) || tripId === "korea-2026") {
        return yield* Effect.tryPromise({
          try: () => streamKoreaChat(prompt, messages, dayId, onUpdate, signal),
          catch: remapChatFailure,
        })
      }
      if (trip) {
        return yield* Effect.tryPromise({
          try: () =>
            streamKoreaChat(wrapTripChatPrompt(trip, prompt, dayId), messages, undefined, onUpdate, signal),
          catch: remapChatFailure,
        })
      }
    }
    if (response.status === 401) {
      return yield* Effect.fail(new AuthError({ message: "Please sign in again to use the concierge." }))
    }
    if (response.status === 502 || response.status === 504) {
      return yield* Effect.fail(new HttpStatusError({
        status: response.status,
        message: "The concierge did not respond in time. Please try again.",
      }))
    }
    return yield* Effect.fail(new HttpStatusError({ status: response.status, message }))
  }

  if (!response.body) {
    return yield* Effect.fail(new StreamError({ message: "Response body is empty" }))
  }

  let content = ""
  let streamError: string | undefined
  let places: ConciergePlace[] | undefined
  let sources: ConciergeSource[] | undefined

  yield* readSse(response.body, {
    signal,
    onData: (data) => {
      const parsed = parseConciergeSsePayload(data)
      if (parsed.kind === "text") {
        content += parsed.text
        onUpdate(visibleConciergeText(content))
      } else if (parsed.kind === "error") {
        streamError = parsed.error
      } else if (parsed.kind === "places") {
        places = parsed.places
      } else if (parsed.kind === "sources") {
        sources = parsed.sources
      }
    },
  }).pipe(Effect.mapError(remapChatFailure))

  return {
    content: visibleConciergeText(content),
    error: streamError,
    places,
    sources,
  } satisfies TripChatResult
})

export function streamTripChat(
  tripId: string,
  prompt: string,
  messages: TripChatMessage[],
  dayId: string | undefined,
  getToken: () => Promise<string | null>,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
  trip?: Trip,
): Promise<TripChatResult> {
  return runPromise(streamTripChatEffect(tripId, prompt, messages, dayId, getToken, onUpdate, signal, trip))
}
