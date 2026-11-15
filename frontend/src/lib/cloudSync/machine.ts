/**
 * The cloud-sync lifecycle as a pure reducer. `useCloudSync` feeds it events
 * and performs the I/O a state asks for; nothing here touches the network.
 *
 *   signedOut ─SIGNED_IN→ pulling ─PULL_OK→ ready ⇄ (PUSH_START / PUSH_OK)
 *                            │                 │
 *                         PULL_FAIL         PUSH_FAIL
 *                            ↓                 ↓
 *                          error ─RETRY / ONLINE→ pulling
 *
 * Pushing is legal only in `ready`, so near-empty local state can never be
 * written over the cloud before the cloud copy has been merged in. `seq`
 * increases with every pull started, so a late answer to an abandoned pull
 * (signed out, retried, a different account) is recognised and dropped.
 */

export type SyncState =
  | { tag: 'signedOut'; seq: number }
  | { tag: 'pulling'; userId: string; seq: number; attempt: number }
  /**
   * `dirty`: the stores hold changes the cloud has not got. Cleared when a push
   * starts, so a change made during the push sets it again and is pushed next.
   * `pushing` also covers an erase, which must not overlap a push. `attempt`
   * counts failures since the last good push, so a push that keeps failing
   * backs off instead of retrying every two seconds.
   */
  | { tag: 'ready'; userId: string; seq: number; dirty: boolean; pushing: boolean; attempt: number }
  | { tag: 'error'; userId: string; seq: number; attempt: number; retryAt: number }

export type SyncEvent =
  | { type: 'SIGNED_IN'; userId: string }
  | { type: 'SIGNED_OUT' }
  | { type: 'PULL_OK'; seq: number }
  | { type: 'PULL_FAIL'; seq: number; now: number }
  | { type: 'LOCAL_CHANGE' }
  | { type: 'PUSH_START' }
  | { type: 'PUSH_OK' }
  | { type: 'PUSH_FAIL'; now: number }
  /** An erase of the cloud copy begins (it runs where a push would). */
  | { type: 'ERASE_START' }
  | { type: 'ERASE_DONE' }
  /** The backoff timer fired. */
  | { type: 'RETRY'; now: number }
  /** The browser came back online. */
  | { type: 'ONLINE' }

export const INITIAL_SYNC_STATE: SyncState = { tag: 'signedOut', seq: 0 }

const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 60_000

/** 2 s, 4 s, 8 s … capped at a minute. */
export function retryDelay(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1))
}

function fail(state: SyncState & { userId: string }, attempt: number, now: number): SyncState {
  return { tag: 'error', userId: state.userId, seq: state.seq, attempt, retryAt: now + retryDelay(attempt) }
}

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case 'SIGNED_IN':
      // Clerk re-renders with new object identities for the same person; that is not a new sign-in.
      if (state.tag !== 'signedOut' && state.userId === event.userId) return state
      return { tag: 'pulling', userId: event.userId, seq: state.seq + 1, attempt: 0 }

    case 'SIGNED_OUT':
      return state.tag === 'signedOut' ? state : { tag: 'signedOut', seq: state.seq }

    case 'PULL_OK':
      if (state.tag !== 'pulling' || state.seq !== event.seq) return state
      // The merge may hold what the cloud lacks, so the first push follows at once.
      return { tag: 'ready', userId: state.userId, seq: state.seq, dirty: true, pushing: false, attempt: state.attempt }

    case 'PULL_FAIL':
      if (state.tag !== 'pulling' || state.seq !== event.seq) return state
      return fail(state, state.attempt + 1, event.now)

    case 'LOCAL_CHANGE':
      // While pulling or waiting to retry, the next merge reads the stores as they are then.
      if (state.tag !== 'ready' || state.dirty) return state
      return { ...state, dirty: true }

    case 'PUSH_START':
      if (state.tag !== 'ready' || !state.dirty || state.pushing) return state
      return { ...state, dirty: false, pushing: true }

    case 'PUSH_OK':
      if (state.tag !== 'ready' || !state.pushing) return state
      return { ...state, pushing: false, attempt: 0 }

    case 'ERASE_DONE':
      if (state.tag !== 'ready' || !state.pushing) return state
      return { ...state, pushing: false }

    case 'PUSH_FAIL':
      if (state.tag !== 'ready' || !state.pushing) return state
      return fail(state, state.attempt + 1, event.now)

    case 'ERASE_START':
      if (state.tag !== 'ready' || state.pushing) return state
      return { ...state, pushing: true }

    case 'RETRY':
      if (state.tag !== 'error' || event.now < state.retryAt) return state
      return { tag: 'pulling', userId: state.userId, seq: state.seq + 1, attempt: state.attempt }

    case 'ONLINE':
      if (state.tag !== 'error') return state
      return { tag: 'pulling', userId: state.userId, seq: state.seq + 1, attempt: state.attempt }
  }
}

export type SyncStatus = 'signedOut' | 'synced' | 'syncing' | 'offline'

/** What the person is told. */
export function syncStatus(state: SyncState): SyncStatus {
  switch (state.tag) {
    case 'signedOut':
      return 'signedOut'
    case 'pulling':
      return 'syncing'
    case 'ready':
      return state.dirty || state.pushing ? 'syncing' : 'synced'
    case 'error':
      return 'offline'
  }
}
