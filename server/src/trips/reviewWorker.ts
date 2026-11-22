import { hostname } from "node:os"
import {
  autoApplyAddSuggestions,
  enhanceTrip,
  fetchOpenMeteoWeather,
  type Geocoder,
  type LlmCall,
  type WeatherFetcher,
} from "./ai"
import type { ReviewClaim, TripStore } from "./store"
import { nextUpdatedAt } from "./tripWrites"
import {
  finishRun,
  REVIEW_ATTEMPT_DEADLINE_MS,
  REVIEW_HEARTBEAT_MS,
  REVIEW_LEASE_MS,
  REVIEW_RETRY_BACKOFF_MS,
  RUN_FAILED_REASON,
  type CompleteEnhancementRun,
  type FailedEnhancementRun,
  type ReviewRequest,
  type Trip,
} from "./types"

// ── AI review worker ─────────────────────────────────────────────────────
//
// Runs the durable review queue (see "Durable review queue" in types.ts).
// A run row is the job: the worker claims it with a lease, renews the lease
// while the model works, and ends the attempt through the store, which
// fences every write on the claim. So a worker that lost its lease (it
// stalled, or the process died and another took over) can never overwrite
// the run or the trip.
//
// One attempt:
//   1. read the trip as it is now, then review it (deadline, heartbeat)
//   2. a returned failed run is final; a thrown error is retried with backoff
//      when `isRetryable` says so
//   3. a complete run is applied onto the trip as it is *after* the review
//      (weather + auto-added stops) and saved with the run in one write;
//      if the trip moved on meanwhile, re-read and apply again

export type RunReview = (
  trip: Trip,
  request: ReviewRequest,
  signal: AbortSignal,
) => Promise<CompleteEnhancementRun | FailedEnhancementRun>

export interface ReviewWorkerDeps {
  store: TripStore
  /** Names this worker's claims and log lines; unique per worker. */
  workerId: string
  runReview: RunReview
  /** Whether a thrown review error is worth another attempt. Default: every
   *  one (a failure that is final comes back as a failed run instead). */
  isRetryable?: (err: unknown) => boolean
  leaseMs?: number
  heartbeatMs?: number
  attemptDeadlineMs?: number
  /** Backoff before retry n (1-based); the last entry repeats. */
  backoffMs?: readonly number[]
  /** Reviews at once in this process. It is a 1 GB box. */
  concurrency?: number
  now?: () => number
  /** 0–1, for the backoff jitter. */
  random?: () => number
  log?: (line: string) => void
}

export interface ReviewWorker {
  /** Claim now, without blocking the caller: that run, or (no id) any due
   *  run. A run id that finds no free slot is claimed when one frees. */
  kick(runId?: string): void
  /** Claim due runs while there are free slots. */
  sweep(): Promise<void>
  /** Sweep now and every `intervalMs`, and again whenever a slot frees. */
  start(intervalMs: number): void
  /** Claim nothing more. Attempts in progress carry on. */
  stop(): void
  /** Stop, abort the attempts in progress and hand their runs back without
   *  spending the attempt, so the next process takes them at once. Waits for
   *  that at most `timeoutMs`. */
  drain(timeoutMs: number): Promise<void>
  /** Slots in use: claims being made plus attempts running. */
  inflight(): number
}

/** How often the server sweeps for due reviews, on top of the kick each new
 *  review gets: retries, and runs whose worker died. */
export const REVIEW_SWEEP_MS = 10_000

const DEFAULT_CONCURRENCY = 2
/** Saves of a finished review onto a trip that keeps changing under it. */
const COMPLETE_TRIES = 5
/** Added to a retry's backoff before kicking it: a timer can fire a
 *  millisecond early, and the run is due on the store's clock, not ours. */
const RETRY_KICK_SLACK_MS = 25

// The run's `error` is shown to travellers, and may be the last word (the
// final attempt's), so none promises another try.
const TRIP_DELETED = "This trip was deleted."
const TRIP_BUSY = "The trip kept changing while the AI review was saving its changes."
const TIMED_OUT = "The AI review took too long."

/** Unique per process and per worker, so a log line names its owner. */
function reviewWorkerId(): string {
  return `${hostname()}:${process.pid}:${crypto.randomUUID().slice(0, 8)}`
}

/** What a finished review writes onto the trip: the live forecast onto each
 *  day's weather, then every addable stop (`run` comes back stamped with
 *  what landed). The trip comes back untouched when nothing changes. */
function applyCompletedEnhancement(
  trip: Trip,
  run: CompleteEnhancementRun,
): { trip: Trip; run: CompleteEnhancementRun } {
  let next = trip
  const weather = run.weatherByDate
  if (weather && Object.keys(weather).length > 0) {
    next = { ...next, days: next.days.map((d) => (weather[d.date] ? { ...d, weather: weather[d.date] } : d)) }
  }
  const appliedAdds = autoApplyAddSuggestions(next, run)
  return { trip: appliedAdds.trip, run: appliedAdds.run }
}

/** The review worker the server runs: `enhanceTrip` over the trips model. */
export function createTripReviewWorker(
  args: {
    store: TripStore
    llm: LlmCall
    fetchWeather?: WeatherFetcher
    geocode?: Geocoder | null
  } & Partial<Omit<ReviewWorkerDeps, "store" | "runReview">>,
): ReviewWorker {
  const { llm, fetchWeather = fetchOpenMeteoWeather, geocode, ...worker } = args
  return createReviewWorker({
    workerId: reviewWorkerId(),
    ...worker,
    runReview: (trip, request, signal) =>
      enhanceTrip({
        trip,
        scope: request.scope,
        dayId: request.dayId,
        prompt: request.prompt,
        llm,
        fetchWeather,
        geocode,
        signal,
      }),
  })
}

/** Why an attempt's signal aborted. Only a deadline is the review's fault;
 *  a lost claim or a drain means the run is not this attempt's to write. */
class AttemptStopped extends Error {
  constructor(readonly why: "deadline" | "lost" | "drain") {
    super(why === "deadline" ? TIMED_OUT : `review stopped: ${why}`)
  }
}

function stoppedBy(signal: AbortSignal): AttemptStopped["why"] | null {
  return signal.aborted && signal.reason instanceof AttemptStopped ? signal.reason.why : null
}

function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.trim() || RUN_FAILED_REASON
}

/** Settles with `work`, or rejects with the abort reason as soon as `signal`
 *  aborts, so a review that ignores its signal still frees its slot. */
function untilAborted<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
    // A late settle after the abort lands on a settled promise: no unhandled rejection.
    Promise.resolve()
      .then(work)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort))
  })
}

export function createReviewWorker(deps: ReviewWorkerDeps): ReviewWorker {
  const { store, workerId } = deps
  const leaseMs = deps.leaseMs ?? REVIEW_LEASE_MS
  const heartbeatMs = deps.heartbeatMs ?? REVIEW_HEARTBEAT_MS
  const deadlineMs = deps.attemptDeadlineMs ?? REVIEW_ATTEMPT_DEADLINE_MS
  const backoffMs = deps.backoffMs ?? REVIEW_RETRY_BACKOFF_MS
  const concurrency = deps.concurrency ?? DEFAULT_CONCURRENCY
  const now = deps.now ?? Date.now
  const random = deps.random ?? Math.random
  const log = deps.log ?? ((line: string) => console.log(line))
  const isRetryable = deps.isRetryable ?? (() => true)

  /** Attempts in progress: what drain aborts and hands back. Not keyed by
   *  run: a stalled attempt and its own re-claim can briefly share one. */
  const attempts = new Set<{ claim: ReviewClaim; abort: AbortController }>()
  /** Everything drain waits for: claims being made, attempts, hand-backs. */
  const work = new Set<Promise<void>>()
  /** Run ids kicked while every slot was busy. */
  const waiting = new Set<string>()
  const retryTimers = new Set<ReturnType<typeof setTimeout>>()
  let reserved = 0
  let sweepTimer: ReturnType<typeof setInterval> | null = null
  let sweeping = false
  let stopped = false
  // A store that cannot claim (queue not migrated yet) fails every sweep the
  // same way: say so once, and again only when it changes.
  let lastClaimError: string | null = null

  function track(p: Promise<void>) {
    work.add(p)
    void p
      .catch((err) => log(`[trips/review] unexpected error: ${messageOf(err)}`))
      .finally(() => work.delete(p))
  }

  function retryDelay(attempt: number): number {
    const base = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0
    return Math.round(base * (0.5 + random()))
  }

  /** Kick a requeued run once it is due. The sweep would find it too; this
   *  is for a worker that does not sweep (and is sooner than the next one). */
  function retryLater(runId: string, delayMs: number) {
    if (stopped) return
    const timer = setTimeout(() => {
      retryTimers.delete(timer)
      kick(runId)
    }, delayMs + RETRY_KICK_SLACK_MS)
    timer.unref?.()
    retryTimers.add(timer)
  }

  /** Claim one run into a free slot. Never rejects. True when it claimed. */
  async function claimOne(runId?: string): Promise<boolean> {
    if (stopped) return false
    if (reserved >= concurrency) {
      if (runId !== undefined) waiting.add(runId)
      return false
    }
    // The slot is held across the await, so a kick and a sweep that run
    // together cannot both take the last one.
    reserved++
    let claim: ReviewClaim | null
    try {
      claim = await store.claimReview(workerId, leaseMs, runId)
      lastClaimError = null
    } catch (err) {
      reserved--
      const text = messageOf(err)
      if (text !== lastClaimError) log(`[trips/review] claim failed: ${text}`)
      lastClaimError = text
      return false
    }
    if (!claim) {
      reserved--
      return false
    }
    waiting.delete(claim.run.id)
    if (stopped) {
      // Claimed while shutting down: hand it straight back.
      reserved--
      const held = claim
      track(store.releaseReview(held).catch((err) => log(`[trips/review] run=${held.run.id} release failed: ${messageOf(err)}`)))
      return false
    }
    track(
      runAttempt(claim).finally(() => {
        reserved--
        slotFreed()
      }),
    )
    return true
  }

  function slotFreed() {
    if (stopped) return
    for (const runId of [...waiting]) {
      if (reserved >= concurrency) break
      waiting.delete(runId)
      kick(runId)
    }
    if (sweepTimer) kick()
  }

  async function sweep() {
    if (stopped || sweeping) return
    sweeping = true
    try {
      while (await claimOne()) {
        // Claim until the slots are full or nothing is due.
      }
    } finally {
      sweeping = false
    }
  }

  function kick(runId?: string) {
    // Tracked, so a drain also waits for a claim still on its way back.
    track(runId === undefined ? sweep() : claimOne(runId).then(() => {}))
  }

  /** Renew the lease until stopped. A renewal that finds the claim gone
   *  aborts the attempt; one that fails (network) is tried again next beat,
   *  as the lease outlasts several beats. */
  function heartbeat(claim: ReviewClaim, abort: AbortController): () => void {
    let beating = false
    const timer = setInterval(() => {
      if (beating) return
      beating = true
      store
        .heartbeatReview(claim, leaseMs)
        .then(
          (held) => {
            if (!held) abort.abort(new AttemptStopped("lost"))
          },
          (err) => log(`[trips/review] run=${claim.run.id} heartbeat failed: ${messageOf(err)}`),
        )
        .finally(() => {
          beating = false
        })
    }, heartbeatMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  async function runAttempt(claim: ReviewClaim): Promise<void> {
    const tag = `[trips/review] run=${claim.run.id} trip=${claim.run.tripId} attempt=${claim.attempt}/${claim.maxAttempts}`
    const startedAt = now()
    log(`${tag} start`)
    const abort = new AbortController()
    const entry = { claim, abort }
    attempts.add(entry)
    const stopBeating = heartbeat(claim, abort)
    let result: string
    try {
      result = await settle(claim, abort)
    } catch (err) {
      // The store failed mid-attempt. Nothing more to do here: the lease
      // lapses and the run is claimed again.
      result = `store error, left for the lease to lapse: ${messageOf(err)}`
    } finally {
      stopBeating()
      attempts.delete(entry)
    }
    log(`${tag} ${result} ${now() - startedAt}ms`)
  }

  /** One attempt, start to end. Returns the log line's result. */
  async function settle(claim: ReviewClaim, abort: AbortController): Promise<string> {
    const trip = await store.get(claim.run.tripId)
    if (!trip) return fail(claim, TRIP_DELETED, null)

    const deadline = setTimeout(() => abort.abort(new AttemptStopped("deadline")), deadlineMs)
    deadline.unref?.()
    let review: CompleteEnhancementRun | FailedEnhancementRun
    try {
      review = await untilAborted(() => deps.runReview(trip, claim.request, abort.signal), abort.signal)
    } catch (err) {
      const why = stoppedBy(abort.signal)
      if (why === "lost") return "lost (another worker holds the run)"
      if (why === "drain") return "handed back"
      if (why === "deadline") return fail(claim, TIMED_OUT, retryDelay(claim.attempt))
      return fail(claim, messageOf(err), isRetryable(err) ? retryDelay(claim.attempt) : null)
    } finally {
      clearTimeout(deadline)
    }
    // An answer that arrives after the claim was lost or handed back is not
    // this attempt's to write.
    const why = stoppedBy(abort.signal)
    if (why === "lost") return "lost (another worker holds the run)"
    if (why === "drain") return "handed back"

    // `enhanceTrip` mints its own id and time; the run keeps the queued ones.
    const run = { ...review, id: claim.run.id, createdAt: claim.run.createdAt }
    if (run.status === "error") return fail(claim, run.error, null, run)
    return complete(claim, run)
  }

  async function fail(
    claim: ReviewClaim,
    error: string,
    retryInMs: number | null,
    failed: FailedEnhancementRun = finishRun(claim.run, { status: "error", error }),
  ): Promise<string> {
    // The failed run goes along every time: on the last attempt the store
    // saves it as the run's end.
    const outcome = await store.failReview(claim, error, retryInMs, failed)
    if (outcome === "requeued" && retryInMs !== null) {
      retryLater(claim.run.id, retryInMs)
      return `requeued, retry in ${retryInMs}ms: ${error}`
    }
    return outcome === "failed" ? `failed: ${error}` : "lost (another worker holds the run)"
  }

  async function complete(claim: ReviewClaim, review: CompleteEnhancementRun): Promise<string> {
    for (let i = 0; i < COMPLETE_TRIES; i++) {
      const fresh = await store.get(claim.run.tripId)
      if (!fresh) return fail(claim, TRIP_DELETED, null)
      // Always from the review as returned: applying onto an already
      // applied run would count its adds twice.
      const applied = applyCompletedEnhancement(fresh, review)
      const tripWrite =
        applied.trip === fresh
          ? null
          : { trip: { ...applied.trip, updatedAt: nextUpdatedAt(fresh.updatedAt) }, expectedUpdatedAt: fresh.updatedAt }
      const outcome = await store.completeReview(claim, applied.run, tripWrite)
      if (outcome === "ok") return `complete, ${applied.run.appliedSuggestionIds.length} added`
      if (outcome === "lost") return "lost (another worker holds the run)"
      // "trip_changed": someone saved the trip meanwhile. Apply again onto theirs.
    }
    return fail(claim, TRIP_BUSY, retryDelay(claim.attempt))
  }

  function stop() {
    stopped = true
    if (sweepTimer) clearInterval(sweepTimer)
    sweepTimer = null
    for (const timer of retryTimers) clearTimeout(timer)
    retryTimers.clear()
    waiting.clear()
  }

  return {
    kick,
    sweep,
    start(intervalMs) {
      if (stopped || sweepTimer) return
      sweepTimer = setInterval(() => kick(), intervalMs)
      sweepTimer.unref?.()
      kick()
    },
    stop,
    async drain(timeoutMs) {
      stop()
      // Every hand-back starts now, together: the process may be killed soon.
      for (const { claim, abort } of attempts) {
        abort.abort(new AttemptStopped("drain"))
        track(
          store.releaseReview(claim).then(
            () => log(`[trips/review] run=${claim.run.id} handed back for the next worker`),
            (err) => log(`[trips/review] run=${claim.run.id} release failed: ${messageOf(err)}`),
          ),
        )
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      let timedOut = false
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
      }).then(() => {
        timedOut = true
      })
      // Settling work can add more (a claim that returns now hands its run
      // back), so wait until nothing is left.
      while (!timedOut && work.size > 0) await Promise.race([Promise.allSettled([...work]), timeout])
      clearTimeout(timer)
    },
    inflight: () => reserved,
  }
}
