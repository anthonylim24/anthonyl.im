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

/** What is in the way: no connection, the network between here and the
 *  site, this site, or the sign-in service. */
export type StallCause = "offline" | "network" | "site" | "auth"

/** How long Clerk may take before we call it stalled. */
export const STALL_AFTER_MS = 10_000
const RELOAD_KEY = "auth-reload-at"
const RELOAD_COUNT_KEY = "auth-reloads"
const MAX_AUTO_RELOADS = 2

/** Reload to retry sign-in, at most twice a tab and once a minute: if a
 *  reload does not fix it, more of them only get in the visitor's way. */
export function reloadToRecover(): boolean {
  let done: number
  try {
    done = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? 0)
  } catch {
    return false
  }
  if (done >= MAX_AUTO_RELOADS) return false
  // Spend the budget only on a reload that happens: `reloadOnce` declines
  // inside its one-minute window, and that attempt must not count.
  if (!reloadOnce(RELOAD_KEY)) return false
  try {
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(done + 1))
  } catch {
    /* reloadOnce just wrote to the same storage; nothing left to do */
  }
  return true
}

type Probe = "up" | "down" | "unreached"

/** A probe with no answer by then counts as unreached. Without a deadline a
 *  request the network swallows would keep the stall screen from ever saying
 *  why. */
export const PROBE_DEADLINE_MS = 6_000

// Cloudflare answers for this site even when the server behind it is down,
// with a 5xx. A request that gets no answer at all was stopped on the way:
// a Wi-Fi filter, DNS, a captive portal.
const probe = (request: Effect.Effect<Response, Error>) =>
  request.pipe(
    Effect.map((res): Probe => (res.status < 500 ? "up" : "down")),
    Effect.catchAll(() => Effect.succeed<Probe>("unreached")),
  )

/** `null` means everything answers, so a reload should bring sign-in back. */
export const diagnose = Effect.fn("AuthStall.diagnose")(function* (proxyUrl: string | undefined = CLERK_PROXY_URL) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline" as StallCause
  const site = yield* probe(fetchApi("/health", { cache: "no-store", signal: AbortSignal.timeout(PROBE_DEADLINE_MS) }))
  if (site === "unreached") return "network" as StallCause
  if (site === "down") return "site" as StallCause
  // Without the proxy Clerk is served from its own host, which we cannot probe
  // across origins; the site answering means that host is the part that failed.
  if (!proxyUrl) return "auth" as StallCause
  const auth = yield* probe(
    fetchExternal(`${proxyUrl}/v1/environment`, {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(PROBE_DEADLINE_MS),
    }),
  )
  return auth === "up" ? null : ("auth" as StallCause)
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
