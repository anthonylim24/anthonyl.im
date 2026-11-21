import { Schema } from "effect"
import type { Trip } from "./types"

// The two ways a save can be turned away, as errors of their own. They live
// apart from `tripsApi.ts` so tests that stub the API still see them.

/**
 * A PATCH carried `baseUpdatedAt` and someone else had written the trip
 * since: the server wrote nothing and answered 409 with its own copy.
 */
export class TripConflictError extends Schema.TaggedError<TripConflictError>()("TripConflictError", {
  message: Schema.String,
  /** The server's current trip. Not decoded: `Trip` is an evolving document. */
  trip: Schema.Unknown,
}) {}

export const isTripConflict = (err: unknown): err is TripConflictError & { trip: Trip } =>
  err instanceof TripConflictError

/**
 * The server can't store this change (a 400 from its schema, or a link
 * name someone else has). `message` says what to fix, in the traveller's
 * words; sending the same trip again would fail the same way.
 */
export class TripRefusedError extends Schema.TaggedError<TripRefusedError>()("TripRefusedError", {
  message: Schema.String,
}) {}

export const isTripRefused = (err: unknown): err is TripRefusedError => err instanceof TripRefusedError
