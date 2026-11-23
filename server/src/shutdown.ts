// One SIGTERM / SIGINT handler for the whole process. Each background worker
// registers how it winds down, and the process exits once every one of them
// has finished (each bounds its own wait). Two workers that each called
// `process.exit` would cut the other short: the first to finish wins.
//
// systemd sends SIGTERM on a restart or deploy and kills whatever is left
// 10 s later (TimeoutStopSec in deploy/systemd/anthonyl.im.service), so a
// drain must start its important writes at once. The HTTP server is one of
// the drains (index.ts): it stops listening at once, since deploy/restart.sh
// keeps a second process on the port to take new connections, and finishes
// the requests it already has.

type Drain = () => Promise<void>

/** How long the HTTP server waits for requests in flight after SIGTERM:
 *  inside systemd's 10 s, so they finish before the kill. A chat stream
 *  still open then is cut. */
export const HTTP_DRAIN_MS = 8_000

/** The part of `process` this needs; tests pass a stand-in. */
export interface ShutdownHost {
  on(signal: "SIGTERM" | "SIGINT", listener: () => void): unknown
  exit(code: number): void
}

export function createShutdown(host: ShutdownHost) {
  const drains = new Map<string, Drain>()
  let listening = false
  let exiting = false

  async function shutdown(signal: string) {
    // A second signal (Ctrl+C twice) means "now".
    if (exiting) return host.exit(0)
    exiting = true
    console.log(`[shutdown] ${signal}: waiting for ${[...drains.keys()].join(", ") || "nothing"}`)
    const results = await Promise.allSettled([...drains.values()].map((drain) => drain()))
    for (const [i, result] of results.entries()) {
      if (result.status === "rejected") {
        const name = [...drains.keys()][i]
        console.warn(`[shutdown] ${name} failed to wind down:`, result.reason instanceof Error ? result.reason.message : result.reason)
      }
    }
    host.exit(0)
  }

  return {
    /** Run `drain` before the process exits on SIGTERM / SIGINT. */
    onShutdown(name: string, drain: Drain) {
      drains.set(name, drain)
      if (listening) return
      listening = true
      host.on("SIGTERM", () => void shutdown("SIGTERM"))
      host.on("SIGINT", () => void shutdown("SIGINT"))
    },
  }
}

export const { onShutdown } = createShutdown(process)
