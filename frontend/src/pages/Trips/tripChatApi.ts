import { apiFetch } from "../../lib/apiBase"
import { visibleConciergeText, type ConciergePlace, type ConciergeSource } from "../../lib/conciergeGrounding"
import { parseConciergeSsePayload } from "../../lib/conciergeSse"
import { readSseStream } from "../../lib/sseStream"
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

function chatRequestFailed(err: unknown): never {
  if (err instanceof DOMException && err.name === "AbortError") throw err
  if (isLostConnection(err)) {
    throw new Error("The concierge lost its connection. Please try again.")
  }
  throw err instanceof Error ? err : new Error(String(err))
}

/**
 * Streams a reply from the trip concierge (Gemini, server-relayed as SSE).
 * Same wire format as the Korea concierge: each `data:` line is a
 * JSON-encoded text delta, terminated by `[DONE]`.
 *
 * When `POST /api/trips/:id/chat` is not on the server yet, falls back
 * to `/api/korea/chat` with trip context. Preview builds prefer
 * `/preview/pr/<n>/api` via `apiFetch`.
 */
export async function streamTripChat(
  tripId: string,
  prompt: string,
  messages: TripChatMessage[],
  dayId: string | undefined,
  getToken: () => Promise<string | null>,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
  trip?: Trip,
): Promise<TripChatResult> {
  const token = await getToken()
  let response: Response
  try {
    response = await apiFetch(`/api/trips/${encodeURIComponent(tripId)}/chat`, {
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
    })
  } catch (err) {
    chatRequestFailed(err)
  }

  if (response.type === "opaqueredirect" || response.status === 0) {
    throw new Error("The concierge lost its connection. Please try again.")
  }

  if (!response.ok) {
    let error = ""
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      error = typeof body?.error === "string" ? body.error : ""
      if (response.status === 404) {
        if (error === "day not found") message = "This day is no longer on the trip."
        else if (error === "trip not found") message = "This trip could not be found."
        else message = "Concierge is not available on this server yet."
      } else if (body?.message) message = body.message
      else if (body?.error) message = String(body.error)
    } catch {
      if (response.status === 404) message = "Concierge is not available on this server yet."
    }

    if (isMissingChatRoute(response.status, error)) {
      if ((trip && isKoreaSeedTrip(trip)) || tripId === "korea-2026") {
        return streamKoreaChat(prompt, messages, dayId, onUpdate, signal)
      }
      if (trip) {
        return streamKoreaChat(
          wrapTripChatPrompt(trip, prompt, dayId),
          messages,
          undefined,
          onUpdate,
          signal,
        )
      }
    }
    if (response.status === 401) {
      throw new Error("Please sign in again to use the concierge.")
    }
    if (response.status === 502 || response.status === 504) {
      throw new Error("The concierge did not respond in time. Please try again.")
    }
    throw new Error(message)
  }

  if (!response.body) throw new Error("Response body is empty")

  let content = ""
  let streamError: string | undefined
  let places: ConciergePlace[] | undefined
  let sources: ConciergeSource[] | undefined

  const handleData = (data: string) => {
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
  }

  try {
    await readSseStream(response.body, { onData: handleData, signal })
  } catch (err) {
    chatRequestFailed(err)
  }

  return { content: visibleConciergeText(content), error: streamError, places, sources }
}
