import { lazy, type ComponentType } from "react"

// Lazy chunks are content-hashed. After a deploy, a tab that was already
// open still asks for the old hashes; if the server no longer has them the
// import fails. These helpers retry a blip, recognise a stale build, and
// reload at most once so a broken chunk can never loop.

const CHUNK_ERROR =
  /dynamically imported module|importing a module script failed|error loading dynamically imported|failed to load module script|unable to preload css|chunkloaderror|loading chunk/i

/** A lazy import that could not be fetched or parsed (stale build, offline). */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return CHUNK_ERROR.test(text)
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * How long one import may take. A download that stalls without failing (a lost
 * HTTP/3 stream, a filtering network) never rejects, so without this the
 * Suspense fallback would spin until a manual reload. Generous on purpose: the
 * heaviest route, with its shared chunks, arrives well inside it on a slow
 * phone network.
 */
export const IMPORT_DEADLINE_MS = 20_000

/** Named like webpack's error so `isChunkLoadError`, and the reload behind it, pick it up. */
class ChunkTimeoutError extends Error {
  override name = "ChunkLoadError"
  constructor(ms: number) {
    super(`Loading chunk timed out after ${ms / 1000} s`)
  }
}

function withDeadline<T>(pending: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ChunkTimeoutError(ms)), ms)
  })
  return Promise.race([pending, deadline]).finally(() => clearTimeout(timer))
}

/**
 * Run a dynamic import, trying once more after a short pause. React.lazy
 * remembers a rejection for good, so the retry has to happen in here.
 */
export async function importWithRetry<T>(
  load: () => Promise<T>,
  pauseMs = 400,
  deadlineMs = IMPORT_DEADLINE_MS,
): Promise<T> {
  try {
    return await withDeadline(load(), deadlineMs)
  } catch (first) {
    // A timed-out import is still pending in the browser's module map, so
    // asking again would only wait on the same stalled request: fail now and
    // let the error boundary reload the page.
    if (first instanceof ChunkTimeoutError || !isChunkLoadError(first)) throw first
    await wait(pauseMs)
    return withDeadline(load(), deadlineMs)
  }
}

const RELOAD_KEY = "chunk-reload-at"
const RELOAD_WINDOW_MS = 60_000

/**
 * Reload the page, at most once a minute per `key`. Returns false, and does
 * nothing, when this tab already reloaded for the same reason in that window.
 */
export function reloadOnce(key: string, now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0)
    if (now - last < RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(key, String(now))
  } catch {
    // No storage (private mode): we cannot tell a loop from a first try, so stay put.
    return false
  }
  window.location.reload()
  return true
}

/** Reload to pick up the current build (see `reloadOnce`). */
export function reloadForNewBuild(now = Date.now()): boolean {
  return reloadOnce(RELOAD_KEY, now)
}

/**
 * React.lazy with one retry built in. Use for every lazily loaded component.
 * `preload()` starts the download early (say, while something above it is
 * still waiting) and the first render uses that same import. A failed
 * preload is forgotten, so rendering tries again and reports the error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let started: Promise<{ default: T }> | null = null
  const start = () => {
    started ??= importWithRetry(load).catch((error: unknown) => {
      started = null
      throw error
    })
    return started
  }
  return Object.assign(
    lazy(start),
    {
      preload: () => {
        start().catch(() => {})
      },
    },
  )
}
