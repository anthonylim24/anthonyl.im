import { useEffect, useState } from "react"
import { Effect } from "effect"
import { fetchApi, fetchExternal } from "@/effect/http"
import { runPromise } from "@/effect/runtime"
import { CLERK_PROXY_URL } from "./clerk"
import { reloadOnce } from "./lazyRetry"
import { reportClientEvent } from "./telemetry"

// Clerk can fail to load: the network may block it, or its API may be down.
// Left alone the page would say "Loading…" for ever. This works out what is
// unreachable, tells the visitor, keeps probing, and reloads the page once
// sign-in can load again.

/** What is in the way: no connection, this site, or the sign-in service. */
export type StallCause = "offline" | "site" | "auth"

/** How long Clerk may take before we call it stalled. */
export const STALL_AFTER_MS = 10_000
const RELOAD_KEY = "auth-reload-at"
const RELOAD_COUNT_KEY = "auth-reloads"
const MAX_AUTO_RELOADS = 2

/** Reload to retry sign-in, at most twice a tab and once a minute: if a
 *  reload does not fix it, more of them only get in the visitor's way. */
function reloadToRecover(): boolean {
  try {
    const done = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? 0)
    if (done >= MAX_AUTO_RELOADS) return false
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(done + 1))
  } catch {
    return false
  }
  return reloadOnce(RELOAD_KEY)
}

const reachable = (request: Effect.Effect<Response, Error>) =>
  request.pipe(
    Effect.map((res) => res.status < 500),
    Effect.catchAll(() => Effect.succeed(false)),
  )

/** `null` means everything answers, so a reload should bring sign-in back. */
export const diagnose = Effect.fn("AuthStall.diagnose")(function* (proxyUrl: string | undefined = CLERK_PROXY_URL) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline" as StallCause
  const siteUp = yield* reachable(fetchApi("/health", { cache: "no-store" }))
  if (!siteUp) return "site" as StallCause
  // Without the proxy Clerk is served from its own host, which we cannot probe
  // across origins; the site answering means that host is the part that failed.
  if (!proxyUrl) return "auth" as StallCause
  const authUp = yield* reachable(
    fetchExternal(`${proxyUrl}/v1/environment`, { cache: "no-store", credentials: "omit" }),
  )
  return authUp ? null : ("auth" as StallCause)
})

/** Pause before the next probe: 4 s, doubling to a 30 s ceiling. */
export const probeDelay = (attempt: number): number => Math.min(30_000, 4_000 * 2 ** attempt)

export interface AuthStall {
  stalled: boolean
  cause: StallCause | null
}

const WAITING: AuthStall = { stalled: false, cause: null }

/**
 * Watches a Clerk load. `failed` is Clerk reporting that it gave up; without
 * it the load counts as stalled after `STALL_AFTER_MS`.
 */
export function useAuthStall(isLoaded: boolean, failed: boolean): AuthStall {
  const [timedOut, setTimedOut] = useState(false)
  const [cause, setCause] = useState<StallCause | null>(null)
  const stalled = !isLoaded && (failed || timedOut)

  useEffect(() => {
    if (isLoaded) return
    const timer = setTimeout(() => setTimedOut(true), STALL_AFTER_MS)
    return () => clearTimeout(timer)
  }, [isLoaded])

  useEffect(() => {
    if (!stalled) return
    let live = true
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let reported = false

    const probe = async () => {
      clearTimeout(timer)
      const found = await runPromise(diagnose()).catch(() => "site" as StallCause)
      if (!live) return
      if (!reported) {
        reported = true
        reportClientEvent("auth_stalled", "Clerk did not load", { cause: found ?? "recovered", failed })
      }
      // Everything answers again: a reload brings sign-in back. If reloading
      // has not helped, stay and keep saying so.
      if (found === null && reloadToRecover()) return
      setCause(found ?? "auth")
      timer = setTimeout(probe, probeDelay(attempt++))
    }
    const probeNow = () => {
      if (document.visibilityState === "hidden") return
      attempt = 0
      void probe()
    }

    void probe()
    window.addEventListener("online", probeNow)
    document.addEventListener("visibilitychange", probeNow)
    return () => {
      live = false
      clearTimeout(timer)
      window.removeEventListener("online", probeNow)
      document.removeEventListener("visibilitychange", probeNow)
    }
  }, [stalled, failed])

  return stalled ? { stalled, cause } : WAITING
}
