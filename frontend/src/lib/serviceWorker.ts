// Service worker registration + update flow.
//
// Toggled by VITE_ENABLE_SERVICE_WORKER (default: on). Set the flag to
// "false" / "0" / "no" / "off" to disable; on a production (`BASE_URL=/`)
// build that additionally unregisters any existing SW and deletes its
// caches so a previously-installed worker cannot keep serving stale
// bundles. Preview builds (`BASE_URL=/preview/...`) also disable
// registration but must NOT unregister — they share the production origin.
//
// Updates never interrupt someone. A new worker installs and waits; the page
// moves to `updateReady` and posts SKIP_WAITING (then reloads on
// `controllerchange`) only once a reload is safe: see `isSafeToReload`. The
// first install takes control without a reload, because the page it claims
// already runs the current build. `registration.update()` runs every five
// minutes so a long-lived tab still finds new deploys; old lazy chunks stay
// on the server for 14 days and `lazyRetry` covers the gap meanwhile.

const SERVICE_WORKER_PATH = "/sw.js"
const UPDATE_INTERVAL_MS = 5 * 60 * 1000
const IDLE_CHECK_MS = 15_000

interface ServiceWorkerEnv {
  PROD?: boolean
  BASE_URL?: string
  VITE_ENABLE_SERVICE_WORKER?: string | boolean
}

interface ServiceWorkerNavigator {
  serviceWorker?: ServiceWorkerContainer
}

interface ServiceWorkerWindow {
  addEventListener: Window["addEventListener"]
  location?: { reload: () => void; pathname?: string }
  document?: Document
}

interface CacheGlobal {
  caches?: CacheStorage
}

// ---------------------------------------------------------------------------
// Update machine (pure). The effect is what the caller does next.

export type UpdateState =
  /** No worker controls this page (first visit, or a hard reload). */
  | { phase: "uncontrolled" }
  /** Served by the current worker; nothing to do. */
  | { phase: "controlled" }
  /** A newer build is ready. `waiting`: a worker waits for SKIP_WAITING;
   *  otherwise another tab already activated it and only a reload is left. */
  | { phase: "updateReady"; waiting: boolean }
  /** Committed to reloading. `awaitingController`: SKIP_WAITING was posted
   *  and the reload follows `controllerchange`. */
  | { phase: "reloading"; awaitingController: boolean }

export type UpdateEvent =
  | { type: "REGISTERED"; hadController: boolean }
  | { type: "UPDATE_INSTALLED" }
  | { type: "SAFE_TO_RELOAD" }
  | { type: "CONTROLLER_CHANGED" }

export type UpdateEffect = "none" | "skipWaiting" | "reload"

export const INITIAL_UPDATE_STATE: UpdateState = { phase: "uncontrolled" }

export function updateStep(state: UpdateState, event: UpdateEvent): [UpdateState, UpdateEffect] {
  switch (event.type) {
    case "REGISTERED":
      return state.phase === "uncontrolled" && event.hadController ? [{ phase: "controlled" }, "none"] : [state, "none"]

    case "UPDATE_INSTALLED":
      switch (state.phase) {
        // Nothing on this page came from a worker, so there is nothing to
        // reload: let the new worker take over. Other tabs decide for themselves.
        case "uncontrolled":
          return [state, "skipWaiting"]
        case "controlled":
        case "updateReady":
          return [{ phase: "updateReady", waiting: true }, "none"]
        // A newer worker replaced the one we asked to skip waiting: ask it too.
        case "reloading":
          return [state, state.awaitingController ? "skipWaiting" : "none"]
      }
      return [state, "none"]

    case "SAFE_TO_RELOAD":
      if (state.phase !== "updateReady") return [state, "none"]
      return state.waiting
        ? [{ phase: "reloading", awaitingController: true }, "skipWaiting"]
        : [{ phase: "reloading", awaitingController: false }, "reload"]

    case "CONTROLLER_CHANGED":
      switch (state.phase) {
        // The first install claimed this page: it already runs the current build.
        case "uncontrolled":
          return [{ phase: "controlled" }, "none"]
        // Another tab activated the update; this one reloads when it is safe.
        case "controlled":
        case "updateReady":
          return [{ phase: "updateReady", waiting: false }, "none"]
        case "reloading":
          return state.awaitingController ? [{ phase: "reloading", awaitingController: false }, "reload"] : [state, "none"]
      }
      return [state, "none"]
  }
}

// ---------------------------------------------------------------------------
// When a reload is safe.

/** How long the page must go untouched before an update may reload it. */
export const IDLE_RELOAD_MS = 60_000

export interface ReloadContext {
  /** An app called `setReloadBlocked(key, true)` and has not released it. */
  blocked: boolean
  /** The router just moved to another route. */
  navigated: boolean
  hidden: boolean
  idleMs: number
  /** A text field has focus or holds text. */
  draft: boolean
  /** A route where watching without touching is the point (a breath session). */
  busyRoute: boolean
}

/**
 * An app's own block always wins. A route change is a page change anyway, so
 * it is the best moment. Otherwise wait until the tab is hidden or untouched
 * for a minute, and never while a field holds text or a breath session is on.
 */
export function isSafeToReload(ctx: ReloadContext): boolean {
  if (ctx.blocked) return false
  if (ctx.navigated) return true
  if (ctx.draft || ctx.busyRoute) return false
  return ctx.hidden || ctx.idleMs >= IDLE_RELOAD_MS
}

const TEXT_FIELDS = [
  "textarea",
  "input:not([type])",
  ...["text", "search", "email", "url", "tel", "number", "password"].map((type) => `input[type="${type}"]`),
].join(", ")

function isUsableField(field: Element): field is HTMLInputElement | HTMLTextAreaElement {
  return field.matches(TEXT_FIELDS) && !(field as HTMLInputElement).readOnly && !(field as HTMLInputElement).disabled
}

/** True when a reload could lose something the visitor is typing. */
export function hasDraft(doc: Document): boolean {
  const active = doc.activeElement
  if (active && ((active as HTMLElement).isContentEditable || isUsableField(active))) return true
  for (const field of doc.querySelectorAll(TEXT_FIELDS)) {
    if (isUsableField(field) && field.value.trim() !== "") return true
  }
  for (const field of doc.querySelectorAll('[contenteditable]:not([contenteditable="false"])')) {
    if (field.textContent?.trim()) return true
  }
  return false
}

export function isBusyRoute(pathname: string): boolean {
  const appPath = pathname.replace(/^\/preview\/pr\/\d+(?=\/|$)/, "") || "/"
  return appPath.startsWith("/breathwork/session")
}

const blockers = new Set<string>()
let activeUpdater: UpdateController | null = null

/**
 * Hold off update reloads while `key` is busy (a stream, a recording, an
 * unsaved form). Release it when done; a pending update may reload then.
 */
export function setReloadBlocked(key: string, blocked: boolean): void {
  if (blocked) {
    blockers.add(key)
    return
  }
  blockers.delete(key)
  activeUpdater?.check(false)
}

/** The router calls this on every client-side route change. */
export function notifyRouteChange(): void {
  activeUpdater?.check(true)
}

// ---------------------------------------------------------------------------
// The thin effectful layer.

export interface UpdateControllerDeps {
  postSkipWaiting: () => void
  reload: () => void
  /** What `isSafeToReload` needs besides `blocked` and `navigated`. */
  readContext: () => Omit<ReloadContext, "blocked" | "navigated">
  /** Called once, when an update first becomes ready: start watching for a safe moment. */
  onUpdateReady: () => void
}

export interface UpdateController {
  dispatch: (event: UpdateEvent) => void
  /** Reload if an update is ready and now is safe. */
  check: (navigated: boolean) => void
  readonly state: UpdateState
}

export function createUpdateController(deps: UpdateControllerDeps): UpdateController {
  let state = INITIAL_UPDATE_STATE
  let watching = false

  const check = (navigated: boolean) => {
    if (state.phase !== "updateReady") return
    if (isSafeToReload({ ...deps.readContext(), blocked: blockers.size > 0, navigated })) {
      dispatch({ type: "SAFE_TO_RELOAD" })
    }
  }

  const dispatch = (event: UpdateEvent) => {
    const [next, effect] = updateStep(state, event)
    state = next
    if (effect === "skipWaiting") deps.postSkipWaiting()
    else if (effect === "reload") deps.reload()
    if (state.phase !== "updateReady") return
    if (!watching) {
      watching = true
      deps.onUpdateReady()
    }
    check(false)
  }

  return {
    dispatch,
    check,
    get state() {
      return state
    },
  }
}

// ---------------------------------------------------------------------------

function isEnabled(env: ServiceWorkerEnv): boolean {
  const raw = env.VITE_ENABLE_SERVICE_WORKER
  // Unset → on (PWA caching + auto-update is the default behavior).
  if (raw === undefined || raw === null || raw === "") return true
  if (raw === true) return true
  if (raw === false) return false
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase()
    if (v === "false" || v === "0" || v === "no" || v === "off") return false
    return true
  }
  return true
}

/** Remote PR previews share the production origin; their Vite base is `/preview/pr/<n>/`. */
export function isPreviewDeploy(env: ServiceWorkerEnv): boolean {
  const base = env.BASE_URL ?? "/"
  return base === "/preview" || base.startsWith("/preview/")
}

// Wipe SW + cache state. Safe to call when nothing is registered. Returns
// once both unregistration and cache deletion settle so callers can chain a
// reload if needed.
export async function unregisterServiceWorker(
  navigatorRef: ServiceWorkerNavigator = navigator as unknown as ServiceWorkerNavigator,
  cacheRef: CacheGlobal = globalThis as unknown as CacheGlobal,
): Promise<void> {
  const swContainer = navigatorRef.serviceWorker
  if (swContainer && typeof swContainer.getRegistrations === "function") {
    try {
      const registrations = await swContainer.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister().catch(() => false)))
    } catch {
      /* ignore — best-effort cleanup */
    }
  }
  const caches = cacheRef.caches
  if (caches && typeof caches.keys === "function") {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
    } catch {
      /* ignore — best-effort cleanup */
    }
  }
}

export function registerServiceWorker(
  env: ServiceWorkerEnv = import.meta.env,
  navigatorRef: ServiceWorkerNavigator = navigator as unknown as ServiceWorkerNavigator,
  windowRef: ServiceWorkerWindow = window,
  cacheRef: CacheGlobal = globalThis as unknown as CacheGlobal,
): boolean {
  if (!navigatorRef.serviceWorker) return false

  // Flag off → make sure no SW is left controlling the page from a prior
  // deploy. This is what gives users an escape from stale caches without
  // asking them to hard-reload.
  //
  // Preview builds also set the flag off (they must not register `/sw.js`),
  // but they share the production origin. Unregistering here would tear down
  // the production PWA for anyone who opens a preview on their phone.
  if (!isEnabled(env)) {
    if (!isPreviewDeploy(env)) {
      void unregisterServiceWorker(navigatorRef, cacheRef)
    }
    return false
  }

  if (!env.PROD) return false

  const swContainer = navigatorRef.serviceWorker
  const doc = windowRef.document
  let registration: ServiceWorkerRegistration | null = null
  let lastActivity = Date.now()

  const updater = createUpdateController({
    postSkipWaiting: () => registration?.waiting?.postMessage({ type: "SKIP_WAITING" }),
    reload: () => {
      try {
        windowRef.location?.reload()
      } catch {
        /* no-op in test envs */
      }
    },
    readContext: () => ({
      hidden: doc?.visibilityState === "hidden",
      idleMs: Date.now() - lastActivity,
      draft: doc ? hasDraft(doc) : false,
      busyRoute: isBusyRoute(windowRef.location?.pathname ?? "/"),
    }),
    onUpdateReady: () => {
      // Idle counts from now at the earliest, so a tab left open does not
      // reload the instant an update lands under someone who just came back.
      lastActivity = Date.now()
      const touched = () => {
        lastActivity = Date.now()
      }
      for (const type of ["pointerdown", "keydown", "wheel", "touchstart", "scroll"]) {
        windowRef.addEventListener(type, touched, { capture: true, passive: true })
      }
      doc?.addEventListener("visibilitychange", () => updater.check(false))
      setInterval(() => updater.check(false), IDLE_CHECK_MS)
    },
  })
  activeUpdater = updater

  // Read before registering: on a first visit there is no controller, and the
  // `controllerchange` that follows is the first install claiming the page,
  // not an update.
  updater.dispatch({ type: "REGISTERED", hadController: Boolean(swContainer.controller) })
  swContainer.addEventListener("controllerchange", () => updater.dispatch({ type: "CONTROLLER_CHANGED" }))

  windowRef.addEventListener(
    "load",
    () => {
      swContainer
        .register(SERVICE_WORKER_PATH)
        .then((reg) => {
          registration = reg
          if (reg.waiting) updater.dispatch({ type: "UPDATE_INSTALLED" })
          reg.addEventListener("updatefound", () => {
            const next = reg.installing
            if (!next) return
            next.addEventListener("statechange", () => {
              if (next.state === "installed") updater.dispatch({ type: "UPDATE_INSTALLED" })
            })
          })
          // Periodic update check so long-lived tabs eventually update.
          setInterval(() => {
            reg.update().catch(() => {
              /* offline / network errors are fine */
            })
          }, UPDATE_INTERVAL_MS)
        })
        .catch(() => {
          // Offline support is additive; registration failure should not block the app.
        })
    },
    { once: true },
  )

  return true
}
