// One SIGTERM / SIGINT handler for the whole process. Each background worker
// registers how it winds down, and the process exits once every one of them
// has finished (each bounds its own wait). Two workers that each called
// `process.exit` would cut the other short: the first to finish wins.
//
// PM2 sends SIGINT on a restart or deploy and kills the process about 1.6 s
// later, so a drain must start its important writes at once.

type Drain = () => Promise<void>

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
