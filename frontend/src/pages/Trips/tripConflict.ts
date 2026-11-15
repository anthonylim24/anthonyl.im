import { Schema } from "effect"
import type { Trip } from "./types"

/**
 * A PATCH carried `baseUpdatedAt` and someone else had written the trip
 * since: the server wrote nothing and answered 409 with its own copy.
 * Lives apart from `tripsApi.ts` so tests that stub the API still see it.
 */
export class TripConflictError extends Schema.TaggedError<TripConflictError>()("TripConflictError", {
  message: Schema.String,
  /** The server's current trip. Not decoded: `Trip` is an evolving document. */
  trip: Schema.Unknown,
}) {}

export const isTripConflict = (err: unknown): err is TripConflictError & { trip: Trip } =>
  err instanceof TripConflictError
