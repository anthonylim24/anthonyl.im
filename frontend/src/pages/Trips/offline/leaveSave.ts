import { sameContent } from "../editorMachine"
import { rebaseTrip } from "../tripMerge"
import { isTripConflict } from "../tripConflict"
import type { Trip } from "../types"
import { sanitizeForSave } from "./sanitize"

/**
 * The save sent as the traveller leaves a trip with edits not yet stored.
 * It waits for the save already on its way (so the two can't land out of
 * order), fits the document to the server's limits, and if someone else
 * saved in between, folds their changes in once and tries again. Resolves
 * to the stored trip; rejects when it can't be stored (no connection, a
 * refusal, or a clash only the traveller can settle).
 */
export async function saveOnLeave({
  doc,
  base,
  before,
  update,
}: {
  doc: Trip
  /** The server's copy `doc` was edited from. */
  base: Trip
  /** The save in flight, resolving to what it stored (null if it didn't). */
  before?: Promise<Trip | null>
  update: (trip: Trip, against: string) => Promise<Trip>
}): Promise<Trip> {
  const landed = before ? await before : null
  const against = landed ?? base
  const fitted = sanitizeForSave(doc, against).trip
  if (sameContent(fitted, against)) return against // the save in flight already stored everything
  try {
    return await update(fitted, against.updatedAt)
  } catch (err) {
    if (!isTripConflict(err)) throw err
    const rebased = rebaseTrip(against, doc, err.trip)
    if (!rebased) throw err
    return update(sanitizeForSave(rebased, err.trip).trip, err.trip.updatedAt)
  }
}
