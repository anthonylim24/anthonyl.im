import type { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { INITIAL_SYNC_STATE, syncReducer, type SyncEvent, type SyncState } from './machine'
import { readSyncMeta, writeSyncMeta } from './meta'
import { eraseCloud } from './remote'
import { resetLocalStores } from './snapshot'

/**
 * The live sync state, for the hook that drives it and for the screens that
 * show it. `client` is the signed-in person's Supabase client, or null.
 */
interface SyncStore {
  state: SyncState
  client: SupabaseClient | null
}

export const useSyncStore = create<SyncStore>()(() => ({
  state: INITIAL_SYNC_STATE,
  client: null,
}))

export function dispatchSync(event: SyncEvent): SyncState {
  const next = syncReducer(useSyncStore.getState().state, event)
  if (next !== useSyncStore.getState().state) useSyncStore.setState({ state: next })
  return next
}

export function setSyncClient(client: SupabaseClient | null): void {
  useSyncStore.setState({ client })
}

/** Thrown when a signed-in erase cannot reach the cloud; nothing has been erased. */
export class EraseUnavailableError extends Error {
  readonly cause: unknown

  constructor(cause?: unknown) {
    super('The synced copy could not be reached')
    this.name = 'EraseUnavailableError'
    this.cause = cause
  }
}

/**
 * "Clear all data". Signed out, this device's stores are reset. Signed in,
 * the synced copy is erased first and this device only after that succeeds,
 * so a failure leaves both as they were (and says so) instead of a local
 * erase the next sync would undo.
 */
export async function eraseAllData(now: Date = new Date()): Promise<void> {
  const resetAt = now.toISOString()
  const { state, client } = useSyncStore.getState()
  if (state.tag === 'signedOut') {
    resetLocalStores(resetAt)
    return
  }
  if (state.tag !== 'ready' || state.pushing || !client) throw new EraseUnavailableError()

  const { userId, seq } = state
  dispatchSync({ type: 'ERASE_START' })
  try {
    const { sessionsErased } = await eraseCloud(client, userId, resetAt)
    const current = useSyncStore.getState().state
    // Signed out or switched account mid-erase: the cloud copy is gone, this device's data is someone else's business now.
    if (current.tag !== 'ready' || current.userId !== userId || current.seq !== seq) return
    writeSyncMeta({
      ownerId: userId,
      xpBase: 0,
      dirty: readSyncMeta()?.dirty ?? false,
      pushedResetAt: sessionsErased ? resetAt : null,
    })
    resetLocalStores(resetAt)
  } catch (error) {
    throw new EraseUnavailableError(error)
  } finally {
    dispatchSync({ type: 'ERASE_DONE' })
  }
}
