import { STORAGE_KEYS } from '@/lib/constants'
import { isDateString, isNonNegativeNumber, isRecord } from '@/stores/sessionRecord'

/**
 * What this device remembers about its last sync, across reloads. Kept apart
 * from the stores so an export or import never carries it.
 *
 * - `ownerId`: the account the local stores belong to. Set on the first
 *   successful pull and kept after sign-out, so the data stays usable offline
 *   but is never merged into a different account.
 * - `xpBase`: the cloud XP total this device last agreed with (see `mergeXP`).
 * - `dirty`: local changes have not reached the cloud yet. Decides whose copy
 *   wins a conflict on the next pull, even after a reload.
 * - `pushedResetAt`: the history erase the cloud has already applied, so the
 *   matching delete is sent once.
 *
 * No record at all means data from before this existed: merged cautiously.
 */
export interface SyncMeta {
  ownerId: string
  xpBase: number
  dirty: boolean
  pushedResetAt: string | null
}

type MetaStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): MetaStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // Storage blocked (private mode, sandboxed frame): sync runs without memory.
    return null
  }
}

export function parseSyncMeta(raw: string | null): SyncMeta | null {
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.ownerId !== 'string' || value.ownerId.length === 0) return null
  return {
    ownerId: value.ownerId,
    xpBase: isNonNegativeNumber(value.xpBase) ? value.xpBase : 0,
    dirty: value.dirty === true,
    pushedResetAt: isDateString(value.pushedResetAt) ? value.pushedResetAt : null,
  }
}

export function readSyncMeta(storage: MetaStorage | null = browserStorage()): SyncMeta | null {
  return parseSyncMeta(storage?.getItem(STORAGE_KEYS.SYNC_META) ?? null)
}

export function writeSyncMeta(meta: SyncMeta, storage: MetaStorage | null = browserStorage()): void {
  storage?.setItem(STORAGE_KEYS.SYNC_META, JSON.stringify(meta))
}

/** Records an unsynced local change for the account that owns this device's data. */
export function markSyncMetaDirty(storage: MetaStorage | null = browserStorage()): void {
  const meta = readSyncMeta(storage)
  if (meta && !meta.dirty) writeSyncMeta({ ...meta, dirty: true }, storage)
}
