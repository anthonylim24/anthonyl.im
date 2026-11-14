import { Effect } from "effect"
import { fetchApi } from "@/effect/http"
import { runPromise } from "@/effect/runtime"

// Sends client-side failures to our own server log (`POST /api/telemetry`).
// Third-party analytics is often blocked on the same networks that break the
// page, so this goes to the one origin we know the browser can reach.

type Detail = Record<string, string | number | boolean | null>

interface ClientEvent {
  kind: string
  message: string
  route: string
  detail?: Detail
}

const MAX_EVENTS_PER_PAGE = 10
const seen = new Set<string>()

const send = Effect.fn("Telemetry.send")(function* (event: ClientEvent) {
  yield* fetchApi("/api/telemetry", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(event),
  })
})

/** Report one event. Repeats and anything past the per-page cap are dropped;
 *  a failed send is ignored. */
export function reportClientEvent(kind: string, message: string, detail?: Detail): void {
  const key = `${kind}:${message}`
  if (seen.has(key) || seen.size >= MAX_EVENTS_PER_PAGE) return
  seen.add(key)
  // Reporting a failure must never become a second failure.
  try {
    const event: ClientEvent = {
      kind,
      message: message.slice(0, 500),
      route: String(window.location?.pathname ?? "").slice(0, 200),
      detail,
    }
    void runPromise(send(event)).catch(() => {})
  } catch {
    /* nothing to do */
  }
}

/** For tests. */
export function resetClientEvents(): void {
  seen.clear()
}

const NOISE = /ResizeObserver loop|^Script error\.?$/

const messageOf = (value: unknown): string =>
  value instanceof Error ? `${value.name}: ${value.message}` : String(value)

/** Report uncaught errors and unhandled rejections from our own code. */
export function installErrorReporting(target: Window = window): void {
  target.addEventListener("error", (event) => {
    // Errors thrown by extensions and third-party scripts are not ours to fix.
    if (event.filename && !event.filename.startsWith(target.location.origin)) return
    const message = event.error ? messageOf(event.error) : event.message
    if (!message || NOISE.test(message)) return
    reportClientEvent("js_error", message, { line: event.lineno ?? null })
  })
  target.addEventListener("unhandledrejection", (event) => {
    const message = messageOf(event.reason)
    if (NOISE.test(message)) return
    reportClientEvent("unhandled_rejection", message)
  })
}
