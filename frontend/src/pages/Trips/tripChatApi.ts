import { apiFetch } from "../../lib/apiBase"
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
}

function isMissingChatRoute(status: number, error: string): boolean {
  if (status !== 404) return false
  return error !== "day not found" && error !== "trip not found"
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
  const response = await apiFetch(`/api/trips/${encodeURIComponent(tripId)}/chat`, {
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
    if (response.status === 502 || response.status === 504) {
      throw new Error("The concierge did not respond in time. Please try again.")
    }
    throw new Error(message)
  }

  if (!response.body) throw new Error("Response body is empty")

  let content = ""
  let streamError: string | undefined

  const handleData = (data: string) => {
    if (data === "[DONE]") return
    try {
      const parsed = JSON.parse(data)
      if (typeof parsed === "string") {
        content += parsed
        onUpdate(content)
      } else if (parsed && typeof parsed === "object" && "error" in parsed) {
        streamError = String((parsed as { error: unknown }).error)
      }
    } catch {
      content += data
      onUpdate(content)
    }
  }

  await readSseStream(response.body, { onData: handleData, signal })

  return { content, error: streamError }
}
