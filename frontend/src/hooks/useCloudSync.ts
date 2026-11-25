import { useEffect, useEffectEvent, useRef } from 'react'
import { useAuth, useSession, useUser } from '@clerk/clerk-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClerkSupabaseClient } from '@/lib/supabase'
import { reportClientEvent } from '@/lib/telemetry'
import { mergeSnapshots } from '@/lib/cloudSync/merge'
import { markSyncMetaDirty, readSyncMeta, writeSyncMeta } from '@/lib/cloudSync/meta'
import { pullCloud, pushCloud, sessionsToPush, upsertProfile } from '@/lib/cloudSync/remote'
import { applySnapshot, readLocalSnapshot, resetLocalStores, subscribeToStores } from '@/lib/cloudSync/snapshot'
import { dispatchSync, setSyncClient, useSyncStore } from '@/lib/cloudSync/store'

/** A burst of changes (a finished session writes three stores) goes up as one push. */
const PUSH_DELAY_MS = 2000

function isStill(userId: string, seq: number): boolean {
  const state = useSyncStore.getState().state
  return state.tag !== 'signedOut' && state.userId === userId && state.seq === seq
}

function report(step: 'pull' | 'push', error: unknown) {
  console.error(`[CloudSync] ${step} failed:`, error)
  reportClientEvent('cloud_sync', `${step} failed`, { message: error instanceof Error ? error.message : String(error) })
}

/**
 * Pulls the cloud copy and merges it into the stores. Runs once per `seq`.
 * The local copy is read after the network answers and written back in the
 * same tick, so a change made while the request was out is merged, not lost.
 */
async function pull(client: SupabaseClient, userId: string, seq: number): Promise<Set<string> | null> {
  try {
    const cloud = await pullCloud(client, userId)
    if (!isStill(userId, seq)) return null

    const meta = readSyncMeta()
    // This device's data belongs to another account: start this one clean.
    if (meta && meta.ownerId !== userId) resetLocalStores(null)
    const own = meta !== null && meta.ownerId === userId
    const merged = mergeSnapshots(readLocalSnapshot(), cloud.snapshot, {
      xpBase: meta === null ? null : own ? meta.xpBase : 0,
      prefer: own && meta.dirty ? 'local' : 'cloud',
      localIsOwn: own,
    })
    applySnapshot(merged)
    writeSyncMeta({
      ownerId: userId,
      xpBase: cloud.snapshot.gamification.xp,
      dirty: true,
      pushedResetAt: cloud.snapshot.history.resetAt,
    })
    dispatchSync({ type: 'PULL_OK', seq })
    return cloud.sessionIds
  } catch (error) {
    report('pull', error)
    if (isStill(userId, seq)) dispatchSync({ type: 'PULL_FAIL', seq, now: Date.now() })
    return null
  }
}

async function push(client: SupabaseClient, userId: string, seq: number, cloudIds: Set<string>): Promise<void> {
  const before = useSyncStore.getState().state
  if (before.tag !== 'ready' || !before.dirty || before.pushing) return
  dispatchSync({ type: 'PUSH_START' })

  const snapshot = readLocalSnapshot()
  const meta = readSyncMeta()
  const resetAt = snapshot.history.resetAt
  const sessions = sessionsToPush(snapshot.history.sessions, cloudIds)
  try {
    await pushCloud(client, userId, {
      snapshot,
      sessions,
      eraseSessionsUpTo: resetAt !== null && resetAt !== meta?.pushedResetAt ? resetAt : null,
    })
    if (!isStill(userId, seq)) return
    for (const session of sessions) cloudIds.add(session.id)
    const after = dispatchSync({ type: 'PUSH_OK' })
    writeSyncMeta({
      ownerId: userId,
      xpBase: snapshot.gamification.xp,
      dirty: after.tag === 'ready' && after.dirty,
      pushedResetAt: resetAt,
    })
  } catch (error) {
    report('push', error)
    if (isStill(userId, seq)) dispatchSync({ type: 'PUSH_FAIL', now: Date.now() })
  }
}

/**
 * Keeps the BreathFlow stores and the signed-in person's cloud copy in step.
 * The lifecycle is `lib/cloudSync/machine.ts`; this hook only feeds it events
 * and performs the pull or push its state calls for. localStorage stays the
 * offline cache throughout: nothing here deletes it.
 */
export function useCloudSync() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { session } = useSession()
  const sync = useSyncStore((store) => store.state)
  const client = useSyncStore((store) => store.client)
  const cloudIdsRef = useRef<Set<string>>(new Set())
  const pulledSeqRef = useRef(-1)

  useEffect(() => {
    setSyncClient(session ? createClerkSupabaseClient(session) : null)
  }, [session])

  // Without a client (Supabase not configured) there is nothing to sync with.
  const userId = isSignedIn && user && client ? user.id : null
  useEffect(() => {
    dispatchSync(userId ? { type: 'SIGNED_IN', userId } : { type: 'SIGNED_OUT' })
  }, [userId])

  const saveProfile = useEffectEvent(() => {
    if (!client || !user) return
    upsertProfile(client, {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      name: user.fullName ?? null,
      avatarUrl: user.imageUrl ?? null,
    }).catch((error: unknown) => console.error('[CloudSync] Failed to save profile:', error))
  })
  useEffect(() => {
    if (userId) saveProfile()
  }, [userId])

  // Pull when the machine asks for one.
  useEffect(() => {
    if (sync.tag !== 'pulling' || !client || pulledSeqRef.current === sync.seq) return
    pulledSeqRef.current = sync.seq
    void pull(client, sync.userId, sync.seq).then((ids) => {
      if (ids) cloudIdsRef.current = ids
    })
  }, [sync, client])

  const pushNow = useEffectEvent(() => {
    const state = useSyncStore.getState().state
    if (state.tag !== 'ready' || !state.dirty || state.pushing || !client) return
    void push(client, state.userId, state.seq, cloudIdsRef.current)
  })

  // Push once the stores have unsynced changes and nothing else is in flight.
  useEffect(() => {
    if (sync.tag !== 'ready' || !sync.dirty || sync.pushing) return
    const timer = setTimeout(() => pushNow(), PUSH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [sync])

  // Retry after the backoff, or as soon as the browser is back online.
  useEffect(() => {
    if (sync.tag !== 'error') return
    const timer = setTimeout(() => dispatchSync({ type: 'RETRY', now: Date.now() }), Math.max(0, sync.retryAt - Date.now()))
    return () => clearTimeout(timer)
  }, [sync])

  useEffect(() => {
    const online = () => dispatchSync({ type: 'ONLINE' })
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])

  // Every store change is a local change. Signed out, it is still remembered
  // as unsynced for the account that owns this device's data.
  useEffect(() => subscribeToStores(() => {
    markSyncMetaDirty()
    dispatchSync({ type: 'LOCAL_CHANGE' })
  }), [])

  // Leaving the page (or this hook unmounting) sends what is waiting rather than dropping it.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') pushNow()
    }
    const onPageHide = () => pushNow()
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onHidden)
      pushNow()
    }
  }, [])
}
