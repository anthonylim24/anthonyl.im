import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompletedSession } from '@/stores/sessionRecord'
import { emptySnapshot, type Snapshot } from './snapshot'
import { parseCloudSnapshot, sessionToRow, snapshotToStateRow } from './rows'

/**
 * The Supabase calls, and nothing else. Promise-based on purpose: BreathFlow's
 * cloud sync stays on Supabase's own client, not Effect (AGENTS.md).
 */

/** Long enough for a slow phone network, short enough that a hang becomes a retry. */
const REQUEST_TIMEOUT_MS = 15_000

/** Sessions sent with every push even when the cloud already has them, so a rating changed after the fact follows. */
export const RECENT_SESSIONS_RESENT = 50

export class CloudSyncError extends Error {
  readonly cause: unknown

  constructor(step: string, cause: unknown) {
    super(`Cloud sync failed to ${step}`)
    this.name = 'CloudSyncError'
    this.cause = cause
  }
}

type Result<T> = { data?: T | null; error: unknown }

async function run<T>(step: string, request: PromiseLike<Result<T>>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), REQUEST_TIMEOUT_MS)
  })
  try {
    const { data, error } = await Promise.race([request, deadline])
    if (error) throw error
    return data ?? null
  } catch (cause) {
    throw new CloudSyncError(step, cause)
  } finally {
    clearTimeout(timer)
  }
}

export interface CloudCopy {
  snapshot: Snapshot
  sessionIds: Set<string>
}

export async function pullCloud(supabase: SupabaseClient, userId: string): Promise<CloudCopy> {
  const [stateRow, sessionRows] = await Promise.all([
    run('read your progress', supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle()),
    run<unknown[]>('read your sessions', supabase.from('sessions').select('*').eq('user_id', userId).order('date', { ascending: false })),
  ])
  const snapshot = parseCloudSnapshot(stateRow, sessionRows ?? [])
  return { snapshot, sessionIds: new Set(snapshot.history.sessions.map((session) => session.id)) }
}

/** The sessions a push sends: any the cloud does not have yet, plus the most recent few. */
export function sessionsToPush(sessions: readonly CompletedSession[], cloudIds: ReadonlySet<string>): CompletedSession[] {
  return sessions.filter((session, index) => index < RECENT_SESSIONS_RESENT || !cloudIds.has(session.id))
}

export interface PushRequest {
  snapshot: Snapshot
  sessions: readonly CompletedSession[]
  /** History was erased here at this instant and the cloud has not yet dropped its older rows. */
  eraseSessionsUpTo: string | null
}

export async function pushCloud(supabase: SupabaseClient, userId: string, request: PushRequest): Promise<void> {
  if (request.eraseSessionsUpTo !== null) {
    await deleteSessionsUpTo(supabase, userId, request.eraseSessionsUpTo)
  }
  await run('save your progress', supabase.from('user_state').upsert(snapshotToStateRow(request.snapshot, userId), { onConflict: 'user_id' }))
  if (request.sessions.length > 0) {
    await run('save your sessions', supabase.from('sessions').upsert(
      request.sessions.map((session) => sessionToRow(session, userId)),
      { onConflict: 'id' },
    ))
  }
}

function deleteSessionsUpTo(supabase: SupabaseClient, userId: string, upTo: string) {
  return run('erase old sessions', supabase.from('sessions').delete().eq('user_id', userId).lte('date', upTo))
}

/**
 * Resets the progress row to a first run marked as erased at `resetAt`, then
 * deletes the session rows. The reset goes first because it is the commit
 * point: once the marker is written every device drops older sessions, so a
 * failed delete is reported (`sessionsErased: false`) for the next push to
 * retry rather than thrown. A failed reset throws and nothing has changed.
 */
export async function eraseCloud(
  supabase: SupabaseClient,
  userId: string,
  resetAt: string,
): Promise<{ sessionsErased: boolean }> {
  await run('reset your progress', supabase.from('user_state').upsert(snapshotToStateRow(emptySnapshot(resetAt), userId), { onConflict: 'user_id' }))
  try {
    await deleteSessionsUpTo(supabase, userId, resetAt)
    return { sessionsErased: true }
  } catch (error) {
    console.error('[CloudSync] Session rows will be erased on the next sync:', error)
    return { sessionsErased: false }
  }
}

export interface Profile {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

export async function upsertProfile(supabase: SupabaseClient, profile: Profile): Promise<void> {
  await run('save your profile', supabase.from('profiles').upsert({
    user_id: profile.id,
    email: profile.email,
    name: profile.name,
    avatar_url: profile.avatarUrl,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }))
}
