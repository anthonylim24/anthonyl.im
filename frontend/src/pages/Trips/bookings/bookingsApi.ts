import { Effect, Schema } from "effect"
import { HttpStatusError } from "../../../effect/errors"
import { requestJson, type GetToken } from "../../../effect/http"
import { runPromise } from "../../../effect/runtime"
import type { ItineraryItem } from "../types"

// Client for POST /api/trips/:id/bookings/parse: the bookings in a pasted
// confirmation, as items to review. The server writes nothing.

/** The server's cap on a paste (`MAX_PASTE_CHARS` in server/src/trips/bookingParse.ts). */
export const MAX_PASTE_CHARS = 20_000

export interface ParsedBooking {
  /** The day it starts on. */
  date: string
  item: Omit<ItineraryItem, "id">
}

/** Reading a paste failed; `message` is the sentence to show. */
export class PasteReadError extends Schema.TaggedError<PasteReadError>()("PasteReadError", {
  message: Schema.String,
}) {}

const AGAIN = "Couldn’t read that confirmation. Try again in a moment."

/** A sentence for each way the server can say no; its own message where it wrote one for people. */
export function pasteErrorMessage(status: number, serverMessage: string): string {
  const own = serverMessage && !/^HTTP \d+$/.test(serverMessage) ? serverMessage : null
  if (status === 429) return "Too many confirmations in a short while. Try again in a few minutes, or add this one by hand."
  if (status === 403) return "You can view this trip but not change it, so bookings can’t be added."
  if (status === 401) return "Your session ended. Sign in again, then paste it once more."
  if (status === 413 || status === 503 || status === 502 || status === 400) return own ?? AGAIN
  return AGAIN
}

const isParsedBooking = (value: unknown): value is ParsedBooking => {
  const entry = value as ParsedBooking | null
  return typeof entry?.date === "string" && entry.item?.kind === "reservation" && typeof entry.item.title === "string"
}

const parseBookingsEffect = Effect.fn("TripsService.parseBookings")(function* (
  getToken: GetToken,
  tripId: string,
  text: string,
  signal?: AbortSignal,
) {
  const body = yield* requestJson<{ bookings?: unknown }>(getToken, `/api/trips/${encodeURIComponent(tripId)}/bookings/parse`, {
    method: "POST",
    body: JSON.stringify({ text }),
    signal,
  }).pipe(
    Effect.mapError((err) =>
      err instanceof HttpStatusError
        ? new PasteReadError({ message: pasteErrorMessage(err.status, err.message) })
        : new PasteReadError({ message: "Couldn’t reach the server. Check your connection and try again." }),
    ),
  )
  return Array.isArray(body.bookings) ? body.bookings.filter(isParsedBooking) : []
})

export function parseBookings(getToken: GetToken, tripId: string, text: string, signal?: AbortSignal): Promise<ParsedBooking[]> {
  return runPromise(parseBookingsEffect(getToken, tripId, text, signal))
}
