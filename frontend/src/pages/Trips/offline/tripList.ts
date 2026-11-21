import { listTrips } from "../tripsApi"
import type { TripSummary } from "../types"
import { READ_TIMEOUT_MS, isNetworkError, isOffline } from "./network"
import { keepList, readList } from "./tripCopies"
import type { TripsDevice } from "./tripsDevice"

type GetToken = () => Promise<string | null>

export interface TripList {
  trips: TripSummary[]
  /** Set when the list is the copy kept on this device: when it was taken. */
  copiedAt: number | null
}

/** Whether the index can load its list yet: once sign-in is ready, or straight away from the device copy. */
export const canLoadTripList = (authReady: boolean, device: Pick<TripsDevice, "mode">) => authReady || device.mode === "copy"

/**
 * The trip list for the index. From the server when it answers (and kept on
 * this device for next time); from the device when there is no connection,
 * the server doesn't answer within `READ_TIMEOUT_MS`, or sign-in can't load.
 * Rejects as before when there is no kept copy to fall back on.
 */
export async function loadTripList(readToken: GetToken, device: Pick<TripsDevice, "store" | "owner" | "mode">): Promise<TripList> {
  const { store, owner, mode } = device
  const fromDevice = async (err: unknown): Promise<TripList> => {
    const kept = owner ? await readList(store, owner) : null
    if (!kept) throw err
    return { trips: kept.trips, copiedAt: kept.savedAt }
  }
  if (mode === "copy" || isOffline()) return fromDevice(new Error("You’re offline, and your trips aren’t saved on this device yet."))
  try {
    const trips = await listTrips(readToken, { timeoutMs: READ_TIMEOUT_MS })
    if (owner) void keepList(store, owner, trips)
    return { trips, copiedAt: null }
  } catch (err) {
    if (!isNetworkError(err)) throw err
    return fromDevice(err)
  }
}
