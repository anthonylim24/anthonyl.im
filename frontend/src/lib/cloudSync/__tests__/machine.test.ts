// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  INITIAL_SYNC_STATE,
  retryDelay,
  syncReducer,
  syncStatus,
  type SyncEvent,
  type SyncState,
} from '../machine'

const signedOut: SyncState = { tag: 'signedOut', seq: 4 }
const pulling: SyncState = { tag: 'pulling', userId: 'a', seq: 5, attempt: 0 }
const clean: SyncState = { tag: 'ready', userId: 'a', seq: 5, dirty: false, pushing: false, attempt: 0 }
const dirty: SyncState = { ...clean, dirty: true }
const pushing: SyncState = { ...clean, pushing: true }
const pushingDirty: SyncState = { ...clean, pushing: true, dirty: true }
const error: SyncState = { tag: 'error', userId: 'a', seq: 5, attempt: 2, retryAt: 10_000 }

const ALL_STATES = [signedOut, pulling, clean, dirty, pushing, pushingDirty, error]

const ALL_EVENTS: SyncEvent[] = [
  { type: 'SIGNED_IN', userId: 'a' },
  { type: 'SIGNED_IN', userId: 'b' },
  { type: 'SIGNED_OUT' },
  { type: 'PULL_OK', seq: 5 },
  { type: 'PULL_OK', seq: 4 },
  { type: 'PULL_FAIL', seq: 5, now: 0 },
  { type: 'PULL_FAIL', seq: 4, now: 0 },
  { type: 'LOCAL_CHANGE' },
  { type: 'PUSH_START' },
  { type: 'PUSH_OK' },
  { type: 'PUSH_FAIL', now: 0 },
  { type: 'ERASE_START' },
  { type: 'ERASE_DONE' },
  { type: 'RETRY', now: 20_000 },
  { type: 'ONLINE' },
]

function canPush(state: SyncState) {
  return state.tag === 'ready' && state.dirty && !state.pushing
}

describe('syncReducer', () => {
  it('starts signed out', () => {
    expect(INITIAL_SYNC_STATE).toEqual({ tag: 'signedOut', seq: 0 })
  })

  describe('signing in and out', () => {
    it('starts a pull with a new sequence number', () => {
      expect(syncReducer(signedOut, { type: 'SIGNED_IN', userId: 'a' })).toEqual({ tag: 'pulling', userId: 'a', seq: 5, attempt: 0 })
    })

    it('ignores a repeat sign-in for the same person in every signed-in state', () => {
      for (const state of [pulling, clean, dirty, pushing, error]) {
        expect(syncReducer(state, { type: 'SIGNED_IN', userId: 'a' })).toBe(state)
      }
    })

    it('starts over for a different account, whatever was in flight', () => {
      for (const state of [pulling, clean, dirty, pushing, error]) {
        expect(syncReducer(state, { type: 'SIGNED_IN', userId: 'b' })).toEqual({ tag: 'pulling', userId: 'b', seq: 6, attempt: 0 })
      }
    })

    it('signs out from anywhere, keeping the sequence so later answers stay stale', () => {
      for (const state of ALL_STATES) {
        expect(syncReducer(state, { type: 'SIGNED_OUT' })).toEqual({ tag: 'signedOut', seq: state.seq })
      }
    })
  })

  describe('pulling', () => {
    it('becomes ready and due a push when its own pull lands', () => {
      expect(syncReducer(pulling, { type: 'PULL_OK', seq: 5 })).toEqual({ ...clean, dirty: true })
    })

    it('drops the answer to an abandoned pull', () => {
      expect(syncReducer(pulling, { type: 'PULL_OK', seq: 4 })).toBe(pulling)
      expect(syncReducer(pulling, { type: 'PULL_FAIL', seq: 4, now: 0 })).toBe(pulling)
      expect(syncReducer(signedOut, { type: 'PULL_OK', seq: 4 })).toBe(signedOut)
    })

    it('a pull that resolves after sign-out and back in is not mistaken for the new one', () => {
      const out = syncReducer(pulling, { type: 'SIGNED_OUT' })
      const again = syncReducer(out, { type: 'SIGNED_IN', userId: 'a' })
      expect(syncReducer(again, { type: 'PULL_OK', seq: 5 })).toBe(again)
    })

    it('fails into a backoff', () => {
      expect(syncReducer(pulling, { type: 'PULL_FAIL', seq: 5, now: 1_000 })).toEqual({
        tag: 'error', userId: 'a', seq: 5, attempt: 1, retryAt: 1_000 + retryDelay(1),
      })
    })

    it('never pushes while pulling', () => {
      expect(syncReducer(pulling, { type: 'PUSH_START' })).toBe(pulling)
      expect(syncReducer(pulling, { type: 'LOCAL_CHANGE' })).toBe(pulling)
    })
  })

  describe('ready', () => {
    it('marks a local change dirty', () => {
      expect(syncReducer(clean, { type: 'LOCAL_CHANGE' })).toEqual(dirty)
      expect(syncReducer(dirty, { type: 'LOCAL_CHANGE' })).toBe(dirty)
    })

    it('pushes only when dirty and idle', () => {
      expect(syncReducer(dirty, { type: 'PUSH_START' })).toEqual(pushing)
      expect(syncReducer(clean, { type: 'PUSH_START' })).toBe(clean)
      expect(syncReducer(pushingDirty, { type: 'PUSH_START' })).toBe(pushingDirty)
    })

    it('keeps a change made during a push, so it is pushed next', () => {
      const during = syncReducer(pushing, { type: 'LOCAL_CHANGE' })
      expect(during).toEqual(pushingDirty)
      const after = syncReducer(during, { type: 'PUSH_OK' })
      expect(after).toEqual(dirty)
      expect(canPush(after)).toBe(true)
    })

    it('a finished push leaves it synced and resets the failure count', () => {
      expect(syncReducer({ ...pushing, attempt: 3 }, { type: 'PUSH_OK' })).toEqual(clean)
    })

    it('a failed push backs off longer each time', () => {
      const first = syncReducer(pushing, { type: 'PUSH_FAIL', now: 0 })
      expect(first).toMatchObject({ tag: 'error', attempt: 1, retryAt: retryDelay(1) })
      const third = syncReducer({ ...pushing, attempt: 2 }, { type: 'PUSH_FAIL', now: 0 })
      expect(third).toMatchObject({ tag: 'error', attempt: 3, retryAt: retryDelay(3) })
    })

    it('an erase holds off pushes until it is done', () => {
      const erasing = syncReducer(dirty, { type: 'ERASE_START' })
      expect(erasing).toEqual({ ...dirty, pushing: true })
      expect(syncReducer(erasing, { type: 'PUSH_START' })).toBe(erasing)
      expect(syncReducer(pushing, { type: 'ERASE_START' })).toBe(pushing)
      expect(syncReducer(erasing, { type: 'ERASE_DONE' })).toEqual(dirty)
    })
  })

  describe('error', () => {
    it('retries with a fresh pull once the backoff has passed', () => {
      expect(syncReducer(error, { type: 'RETRY', now: 9_999 })).toBe(error)
      expect(syncReducer(error, { type: 'RETRY', now: 10_000 })).toEqual({ tag: 'pulling', userId: 'a', seq: 6, attempt: 2 })
    })

    it('retries at once when the browser comes back online', () => {
      expect(syncReducer(error, { type: 'ONLINE' })).toEqual({ tag: 'pulling', userId: 'a', seq: 6, attempt: 2 })
    })

    it('ignores pushes and local changes (the next pull merges them)', () => {
      for (const type of ['PUSH_START', 'PUSH_OK', 'LOCAL_CHANGE', 'ERASE_START', 'ERASE_DONE'] as const) {
        expect(syncReducer(error, { type })).toBe(error)
      }
    })
  })

  it('no event ever starts a push outside ready, or loses a pending change', () => {
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        const next = syncReducer(state, event)
        if (next.tag === 'ready' && next.pushing && !(state.tag === 'ready' && state.pushing)) {
          expect(state.tag).toBe('ready')
          expect(['PUSH_START', 'ERASE_START']).toContain(event.type)
        }
        // A pending change survives everything except a sign-out, an account
        // switch or a failure (the retry's merge carries it).
        if (state.tag === 'ready' && state.dirty && next.tag === 'ready' && next.userId === state.userId) {
          const started = event.type === 'PUSH_START' && next.pushing && !state.pushing
          expect(next.dirty || started).toBe(true)
        }
      }
    }
  })

  it('backoff doubles from two seconds up to a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10].map(retryDelay)).toEqual([2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000])
  })
})

describe('syncStatus', () => {
  it('names each state in the words Settings shows', () => {
    expect(syncStatus(signedOut)).toBe('signedOut')
    expect(syncStatus(pulling)).toBe('syncing')
    expect(syncStatus(dirty)).toBe('syncing')
    expect(syncStatus(pushing)).toBe('syncing')
    expect(syncStatus(clean)).toBe('synced')
    expect(syncStatus(error)).toBe('offline')
  })
})
