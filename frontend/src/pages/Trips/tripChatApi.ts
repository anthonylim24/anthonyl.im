import { Effect } from "effect"
import {
  visibleConciergeText,
  type ConciergeMeta,
  type ConciergeMove,
  type ConciergePlace,
  type ConciergeProposal,
  type ConciergeSource,
  type ConciergeStatus,
} from "../../lib/conciergeGrounding"
import { parseConciergeSsePayload } from "../../lib/conciergeSse"
import { errorIfIncomplete, remapChatFailure } from "../../effect/chatErrors"
import { AuthError, HttpStatusError, StreamError } from "../../effect/errors"
import { fetchApi, readAuthToken } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { readSse } from "../../effect/sse"
import { streamKoreaChat } from "../Korea/koreaChatApi"
import { isKoreaSeedTrip, wrapTripChatPrompt } from "./tripChatFallback"
import type { Trip } from "./types"

/** A card the traveller saw under an earlier reply, sent back so the
 *  concierge can resolve "the second one". */
export type TripChatPriorPlace = Pick<
  ConciergePlace,
  "ref" | "name" | "address" | "lat" | "lng" | "category" | "placeId" | "mapsUrl" | "dayId" | "time"
>

export type ProposalState = "pending" | "applied" | "dismissed" | "undone"

export interface TripChatMessage {
  role: "user" | "assistant"
  content: string
  places?: TripChatPriorPlace[]
  proposal?: { summary: string; state?: ProposalState }
}

export interface TripChatResult {
  content: string
  error?: string
  places?: ConciergePlace[]
  moves?: ConciergeMove[]
  sources?: ConciergeSource[]
  proposal?: ConciergeProposal
  followups?: string[]
  meta?: ConciergeMeta
}

/** Live events while the reply streams. */
export interface TripChatHandlers {
  onText: (content: string) => void
  /** Real tool activity ("Checking Google Maps"); `done` when the text is complete. */
  onStatus?: (status: ConciergeStatus) => void
  onMeta?: (meta: ConciergeMeta) => void
  onPlaces?: (places: ConciergePlace[]) => void
  onProposal?: (proposal: ConciergeProposal) => void
  onSources?: (sources: ConciergeSource[]) => void
  onFollowups?: (followups: string[]) => void
}

export interface TripChatRequest {
  tripId: string
  prompt: string
  messages: TripChatMessage[]
  dayId?: string
  /** Only when the traveller chose to share it with this message. */
  location?: { lat: number; lng: number }
  trip?: Trip
  signal?: AbortSignal
}

function isMissingChatRoute(status: number, error: string): boolean {
  if (status !== 404) return false
  return error !== "day not found" && error !== "trip not found"
}

function streamKoreaAsTripChat(
  prompt: string,
  messages: TripChatMessage[],
  slug: string | undefined,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
): Promise<TripChatResult> {
  return streamKoreaChat(
    prompt,
    messages,
    slug,
    (content) => onUpdate(visibleConciergeText(content)),
    signal,
  ).then((result) => ({
    content: visibleConciergeText(result.content),
    error: result.error,
    sources: result.sources,
  }))
}

const streamTripChatEffect = Effect.fn("TripChatService.stream")(function* (
  request: TripChatRequest,
  getToken: () => Promise<string | null>,
  handlers: TripChatHandlers,
) {
  const { tripId, prompt, messages, dayId, location, trip, signal } = request
  const onUpdate = handlers.onText
  const token = yield* readAuthToken(getToken).pipe(Effect.mapError(remapChatFailure))
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
      ...(location ? { location } : {}),
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
      const plain = messages.map((m) => ({ role: m.role, content: m.content }))
      if ((trip && isKoreaSeedTrip(trip)) || tripId === "korea-2026") {
        return yield* Effect.tryPromise({
          try: () => streamKoreaAsTripChat(prompt, plain, dayId, onUpdate, signal),
          catch: remapChatFailure,
        })
      }
      if (trip) {
        return yield* Effect.tryPromise({
          try: () =>
            streamKoreaAsTripChat(wrapTripChatPrompt(trip, prompt, dayId), plain, undefined, onUpdate, signal),
          catch: remapChatFailure,
        })
      }
    }
    if (response.status === 401) {
      return yield* Effect.fail(new AuthError({ message: "Please sign in again to use the concierge." }))
    }
    if (response.status === 429) {
      return yield* Effect.fail(new HttpStatusError({
        status: response.status,
        message: "The concierge is busy. Give it a moment and try again.",
      }))
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
  let moves: ConciergeMove[] | undefined
  let sources: ConciergeSource[] | undefined
  let proposal: ConciergeProposal | undefined
  let followups: string[] | undefined
  let meta: ConciergeMeta | undefined

  const { completed } = yield* readSse(response.body, {
    signal,
    onData: (data) => {
      const parsed = parseConciergeSsePayload(data)
      switch (parsed.kind) {
        case "text":
          content += parsed.text
          onUpdate(visibleConciergeText(content))
          break
        case "error":
          streamError = parsed.error
          break
        case "status":
          handlers.onStatus?.(parsed.status)
          break
        case "meta":
          meta = parsed.meta
          handlers.onMeta?.(parsed.meta)
          break
        case "places":
          places = parsed.places
          handlers.onPlaces?.(parsed.places)
          break
        case "moves":
          moves = parsed.moves
          break
        case "proposal":
          proposal = parsed.proposal
          handlers.onProposal?.(parsed.proposal)
          break
        case "sources":
          sources = parsed.sources
          handlers.onSources?.(parsed.sources)
          break
        case "followups":
          followups = parsed.followups
          handlers.onFollowups?.(parsed.followups)
          break
        case "ignore":
          break
      }
    },
  }).pipe(Effect.mapError(remapChatFailure))

  return {
    content: visibleConciergeText(content),
    error: errorIfIncomplete(completed, streamError),
    places,
    moves,
    sources,
    proposal,
    followups,
    meta,
  } satisfies TripChatResult
})

export function streamTripChat(
  request: TripChatRequest,
  getToken: () => Promise<string | null>,
  handlers: TripChatHandlers,
): Promise<TripChatResult> {
  return runPromise(streamTripChatEffect(request, getToken, handlers))
}
