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

// The failures worth hearing about most (a network that stops this site
// loading) are the ones whose report cannot get out either. A report that
// could not be sent waits in localStorage for the next load that can.
const UNSENT_KEY = "telemetry-unsent"
const MAX_UNSENT = 10
const UNSENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface Unsent {
  event: ClientEvent
  /** When it happened, ms since the epoch. */
  at: number
}

const isPrimitive = (value: unknown) =>
  value === null || ["string", "number", "boolean"].includes(typeof value)

/** localStorage is untrusted: keep only entries shaped like ours. */
function readUnsent(): Unsent[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(UNSENT_KEY) ?? "[]")
    if (!Array.isArray(raw)) return []
    return raw.filter((entry): entry is Unsent => {
      const event = entry?.event
      return (
        typeof entry?.at === "number" &&
        typeof event?.kind === "string" &&
        typeof event.message === "string" &&
        typeof event.route === "string" &&
        (event.detail === undefined ||
          (typeof event.detail === "object" && event.detail !== null && Object.values(event.detail).every(isPrimitive)))
      )
    })
  } catch {
    return []
  }
}

function writeUnsent(entries: Unsent[]): void {
  try {
    if (entries.length === 0) localStorage.removeItem(UNSENT_KEY)
    else localStorage.setItem(UNSENT_KEY, JSON.stringify(entries.slice(-MAX_UNSENT)))
  } catch {
    /* private mode or full: the report is lost, as before */
  }
}

/** Send now; if the network will not carry it, keep it for the next load. */
function deliver(event: ClientEvent, at: number): void {
  // A non-2xx answer still reached the server, so only a rejected request is kept.
  void runPromise(send(event)).catch(() => writeUnsent([...readUnsent(), { event, at }]))
}

/** Report one event. Repeats and anything past the per-page cap are dropped;
 *  one that cannot be sent is kept for `sendUnsentEvents` on a later load. */
export function reportClientEvent(kind: string, message: string, detail?: Detail): void {
  const key = `${kind}:${message}`
  if (seen.has(key) || seen.size >= MAX_EVENTS_PER_PAGE) return
  seen.add(key)
  // Reporting a failure must never become a second failure.
  try {
    deliver(
      {
        kind,
        message: message.slice(0, 500),
        route: String(window.location?.pathname ?? "").slice(0, 200),
        detail,
      },
      Date.now(),
    )
  } catch {
    /* nothing to do */
  }
}

/** Send the reports earlier loads could not, marked `late` with their age.
 *  Call once the page has loaded. */
export function sendUnsentEvents(now = Date.now()): void {
  const waiting = readUnsent()
  if (waiting.length === 0) return
  writeUnsent([])
  for (const { event, at } of waiting) {
    if (now - at > UNSENT_MAX_AGE_MS) continue
    deliver({ ...event, detail: { ...event.detail, late: true, ageS: Math.round((now - at) / 1000) } }, at)
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
