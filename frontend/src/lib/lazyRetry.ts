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
 * Run a dynamic import, trying once more after a short pause. React.lazy
 * remembers a rejection for good, so the retry has to happen in here.
 */
export async function importWithRetry<T>(load: () => Promise<T>, pauseMs = 400): Promise<T> {
  try {
    return await load()
  } catch (first) {
    if (!isChunkLoadError(first)) throw first
    await wait(pauseMs)
    return load()
  }
}

const RELOAD_KEY = "chunk-reload-at"
const RELOAD_WINDOW_MS = 60_000

/**
 * Reload to pick up the current build. Returns false, and does nothing,
 * when this tab already reloaded for the same reason in the last minute.
 */
export function reloadForNewBuild(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (now - last < RELOAD_WINDOW_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // No storage (private mode): we cannot tell a loop from a first try, so stay put.
    return false
  }
  window.location.reload()
  return true
}

/** React.lazy with one retry built in. Use for every lazily loaded component. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => importWithRetry(load))
}
