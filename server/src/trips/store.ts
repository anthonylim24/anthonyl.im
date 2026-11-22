import { config } from "../config"
import { createSupabaseClient, type SupabaseClient } from "../igPlaces/supabase"
import type {
  CompleteEnhancementRun,
  EnhancementRun,
  FailedEnhancementRun,
  ReviewRequest,
  RunningEnhancementRun,
  RunQueueInfo,
  Trip,
} from "./types"

// ── TripStore ────────────────────────────────────────────────────────────
//
// Trips are stored as whole documents (one row per trip, `doc jsonb`).
// Trip counts are tiny (personal travel planner), so visibility filtering
// happens in process rather than in SQL.

export interface TripStore {
  list(): Promise<Trip[]>
  get(id: string): Promise<Trip | null>
  /** The trip whose permalink is `slug`, without loading every trip. */
  getBySlug(slug: string): Promise<Trip | null>
  /** The trip holding an invite link with this token, if any. */
  findByInviteToken(token: string): Promise<Trip | null>
  create(trip: Trip): Promise<void>
  update(trip: Trip): Promise<void>
  /** Persist `trip` only if the stored row still has `expectedUpdatedAt`. */
  updateIfUnchanged(trip: Trip, expectedUpdatedAt: string): Promise<boolean>
  delete(id: string): Promise<void>
  listRuns(tripId: string): Promise<EnhancementRun[]>
  getRun(tripId: string, runId: string): Promise<EnhancementRun | null>
  saveRun(run: EnhancementRun): Promise<void>

  // ── Durable review queue (see "Durable review queue" in types.ts) ──────
  //
  // Every transition below keeps `run.queue` in the stored doc in step with
  // the queue, so `getRun` / `listRuns` show progress with no extra read.

  /** Queue a review. At most one live (queued or working) review per trip:
   *  when one exists, nothing is inserted and that run comes back. */
  enqueueReview(run: RunningEnhancementRun, request: ReviewRequest, maxAttempts: number): Promise<EnqueueReviewResult>
  /** Claim one due review: a queued run whose `nextAttemptAt` has passed, or
   *  a working run whose lease lapsed (its worker died). Starts the next
   *  attempt and leases it to `workerId` for `leaseMs`. A run out of
   *  attempts is failed instead of claimed. `runId` claims only that run. */
  claimReview(workerId: string, leaseMs: number, runId?: string): Promise<ReviewClaim | null>
  /** Renew the lease. False when the claim was lost (lapsed and re-claimed). */
  heartbeatReview(claim: ReviewClaim, leaseMs: number): Promise<boolean>
  /** Hand a claimed run back without spending its attempt (shutdown). */
  releaseReview(claim: ReviewClaim): Promise<void>
  /** End an attempt that failed. With `retryInMs` and attempts left, the run
   *  is queued again; otherwise it is saved as `failed`. "lost" when the
   *  claim no longer holds the run (nothing written). */
  failReview(
    claim: ReviewClaim,
    error: string,
    retryInMs: number | null,
    failed: FailedEnhancementRun,
  ): Promise<"requeued" | "failed" | "lost">
  /** Finish a claimed run. With `tripWrite`, the trip is written only if its
   *  `updatedAt` is still `expectedUpdatedAt`, and the run and trip are saved
   *  together or not at all. "trip_changed": the trip moved on (nothing
   *  written; recompute on the fresh trip). "lost": the claim no longer
   *  holds the run (nothing written). */
  completeReview(
    claim: ReviewClaim,
    run: CompleteEnhancementRun,
    tripWrite: { trip: Trip; expectedUpdatedAt: string } | null,
  ): Promise<"ok" | "trip_changed" | "lost">
}

/** A review a worker holds. `attempt` fences the claim: a worker whose
 *  lease lapsed and was re-claimed cannot write the run any more. */
export interface ReviewClaim {
  run: RunningEnhancementRun
  request: ReviewRequest
  workerId: string
  attempt: number
  maxAttempts: number
}

export type EnqueueReviewResult =
  | { inserted: true; run: RunningEnhancementRun }
  | { inserted: false; live: EnhancementRun }

interface MemoryQueueRow {
  request: ReviewRequest
  state: RunQueueInfo["state"]
  attempts: number
  maxAttempts: number
  runAfter: number
  lockedBy: string | null
  lockedUntil: number
  lastError?: string
}

export class MemoryTripStore implements TripStore {
  private trips = new Map<string, Trip>()
  private runs = new Map<string, EnhancementRun>()
  private queue = new Map<string, MemoryQueueRow>()

  /** Clock seam for tests. */
  constructor(private now: () => number = Date.now) {}

  async list() {
    return [...this.trips.values()]
  }
  async get(id: string) {
    return this.trips.get(id) ?? null
  }
  async getBySlug(slug: string) {
    for (const trip of this.trips.values()) if (trip.slug === slug) return trip
    return null
  }
  async findByInviteToken(token: string) {
    for (const trip of this.trips.values()) if (trip.invites?.some((i) => i.token === token)) return trip
    return null
  }
  async create(trip: Trip) {
    this.trips.set(trip.id, structuredClone(trip))
  }
  async update(trip: Trip) {
    this.trips.set(trip.id, structuredClone(trip))
  }
  async updateIfUnchanged(trip: Trip, expectedUpdatedAt: string) {
    const current = this.trips.get(trip.id)
    if (!current || current.updatedAt !== expectedUpdatedAt) return false
    this.trips.set(trip.id, structuredClone(trip))
    return true
  }
  async delete(id: string) {
    this.trips.delete(id)
    for (const [k, run] of this.runs) {
      if (run.tripId !== id) continue
      this.runs.delete(k)
      this.queue.delete(k)
    }
  }
  async listRuns(tripId: string) {
    return [...this.runs.values()]
      .filter((r) => r.tripId === tripId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async getRun(tripId: string, runId: string) {
    const run = this.runs.get(runId)
    return run && run.tripId === tripId ? run : null
  }
  async saveRun(run: EnhancementRun) {
    this.runs.set(run.id, structuredClone(run))
  }

  private info(row: MemoryQueueRow): RunQueueInfo {
    return {
      state: row.state,
      attempt: row.attempts,
      maxAttempts: row.maxAttempts,
      ...(row.state === "queued" ? { nextAttemptAt: new Date(row.runAfter).toISOString() } : {}),
      ...(row.lastError !== undefined ? { lastError: row.lastError } : {}),
    }
  }

  /** Mirror the queue row onto the stored doc, as the SQL functions do. */
  private sync(runId: string, doc?: EnhancementRun) {
    const row = this.queue.get(runId)
    const run = doc ?? this.runs.get(runId)
    if (!row || !run) return
    this.runs.set(runId, structuredClone({ ...run, queue: this.info(row) }))
  }

  private holds(claim: ReviewClaim): MemoryQueueRow | null {
    const row = this.queue.get(claim.run.id)
    return row && row.state === "working" && row.lockedBy === claim.workerId && row.attempts === claim.attempt ? row : null
  }

  async enqueueReview(run: RunningEnhancementRun, request: ReviewRequest, maxAttempts: number): Promise<EnqueueReviewResult> {
    for (const [id, row] of this.queue) {
      const live = this.runs.get(id)
      if (live?.tripId === run.tripId && (row.state === "queued" || row.state === "working")) {
        return { inserted: false, live: structuredClone(live) }
      }
    }
    const now = this.now()
    this.queue.set(run.id, {
      request: structuredClone(request),
      state: "queued",
      attempts: 0,
      maxAttempts,
      runAfter: now,
      lockedBy: null,
      lockedUntil: 0,
    })
    this.sync(run.id, run)
    return { inserted: true, run: structuredClone(this.runs.get(run.id) as RunningEnhancementRun) }
  }

  async claimReview(workerId: string, leaseMs: number, runId?: string): Promise<ReviewClaim | null> {
    const now = this.now()
    const due = [...this.queue.entries()]
      .filter(([id]) => runId === undefined || id === runId)
      .filter(([, row]) => (row.state === "queued" && row.runAfter <= now) || (row.state === "working" && row.lockedUntil < now))
      .sort(([, a], [, b]) => a.runAfter - b.runAfter)
    for (const [id, row] of due) {
      const run = this.runs.get(id)
      if (!run || run.status !== "running") continue
      if (row.attempts >= row.maxAttempts) {
        // Out of attempts: the last one died with its lease. Fail it for good.
        row.state = "done"
        row.lockedBy = null
        const lastError = row.lastError ?? "The AI review stopped before it finished."
        this.sync(id, {
          ...run,
          status: "error",
          error: lastError,
          outcome: "no_adds_possible",
          outcomeReason: "The AI review failed before it could add places.",
        })
        continue
      }
      row.state = "working"
      row.attempts += 1
      row.lockedBy = workerId
      row.lockedUntil = now + leaseMs
      this.sync(id)
      return {
        run: structuredClone(this.runs.get(id) as RunningEnhancementRun),
        request: structuredClone(row.request),
        workerId,
        attempt: row.attempts,
        maxAttempts: row.maxAttempts,
      }
    }
    return null
  }

  async heartbeatReview(claim: ReviewClaim, leaseMs: number) {
    const row = this.holds(claim)
    if (!row) return false
    row.lockedUntil = this.now() + leaseMs
    return true
  }

  async releaseReview(claim: ReviewClaim) {
    const row = this.holds(claim)
    if (!row) return
    row.state = "queued"
    row.attempts -= 1
    row.runAfter = this.now()
    row.lockedBy = null
    this.sync(claim.run.id)
  }

  async failReview(claim: ReviewClaim, error: string, retryInMs: number | null, failed: FailedEnhancementRun) {
    const row = this.holds(claim)
    if (!row) return "lost" as const
    row.lockedBy = null
    row.lastError = error
    if (retryInMs !== null && row.attempts < row.maxAttempts) {
      row.state = "queued"
      row.runAfter = this.now() + retryInMs
      this.sync(claim.run.id)
      return "requeued" as const
    }
    row.state = "done"
    this.sync(claim.run.id, failed)
    return "failed" as const
  }

  async completeReview(
    claim: ReviewClaim,
    run: CompleteEnhancementRun,
    tripWrite: { trip: Trip; expectedUpdatedAt: string } | null,
  ) {
    const row = this.holds(claim)
    if (!row) return "lost" as const
    if (tripWrite) {
      const current = this.trips.get(tripWrite.trip.id)
      if (!current || current.updatedAt !== tripWrite.expectedUpdatedAt) return "trip_changed" as const
      this.trips.set(tripWrite.trip.id, structuredClone(tripWrite.trip))
    }
    row.state = "done"
    row.lockedBy = null
    this.sync(claim.run.id, run)
    return "ok" as const
  }
}

interface TripRow {
  id: string
  owner_id: string
  updated_at: string
  doc: Trip
}

interface RunRow {
  id: string
  trip_id: string
  doc: EnhancementRun
}

/** The queue columns `trip_review_claim` returns with the run. */
interface ClaimedRunRow extends RunRow {
  doc: RunningEnhancementRun
  request: ReviewRequest
  attempts: number
  max_attempts: number
}

/** The claim's fence, as every `trip_review_*` lease check takes it. */
function fence(claim: ReviewClaim) {
  return { p_id: claim.run.id, p_worker: claim.workerId, p_attempt: claim.attempt }
}

/** Leases cross as whole seconds, rounded up so a lease is never shorter
 *  than asked. */
function leaseSec(leaseMs: number) {
  return Math.ceil(leaseMs / 1000)
}

/** An rpc's text result, checked against what the function can return. */
function oneOf<T extends string>(fn: string, value: unknown, allowed: readonly T[]): T {
  if (allowed.includes(value as T)) return value as T
  throw new Error(`${fn} returned ${JSON.stringify(value)}, expected one of ${allowed.join(", ")}`)
}

export class SupabaseTripStore implements TripStore {
  constructor(private sb: SupabaseClient) {}

  async list() {
    const rows = await this.sb.select<TripRow>("trips", { select: "doc" })
    return rows.map((r) => r.doc)
  }
  async get(id: string) {
    const rows = await this.sb.select<TripRow>("trips", { select: "doc", eq: { id } })
    return rows[0]?.doc ?? null
  }
  async getBySlug(slug: string) {
    // A JSON path filter on the document: no column or index needed at this size.
    const rows = await this.sb.select<TripRow>("trips", { select: "doc", eq: { "doc->>slug": slug }, limit: 1 })
    return rows[0]?.doc ?? null
  }
  async findByInviteToken(token: string) {
    // jsonb containment: some element of doc.invites has this token.
    const rows = await this.sb.select<TripRow>("trips", {
      select: "doc",
      filters: { "doc->invites": `cs.${JSON.stringify([{ token }])}` },
      limit: 1,
    })
    return rows[0]?.doc ?? null
  }
  async create(trip: Trip) {
    await this.sb.insert("trips", {
      id: trip.id,
      owner_id: trip.ownerId,
      updated_at: trip.updatedAt,
      doc: trip,
    })
  }
  async update(trip: Trip) {
    await this.sb.update("trips", { doc: trip, updated_at: trip.updatedAt }, { id: trip.id })
  }
  async updateIfUnchanged(trip: Trip, expectedUpdatedAt: string) {
    const rows = await this.sb.update(
      "trips",
      { doc: trip, updated_at: trip.updatedAt },
      { id: trip.id, updated_at: expectedUpdatedAt },
    )
    return rows.length > 0
  }
  async delete(id: string) {
    await this.sb.delete("trip_enhancement_runs", { trip_id: id })
    await this.sb.delete("trips", { id })
  }
  async listRuns(tripId: string) {
    const rows = await this.sb.select<RunRow>("trip_enhancement_runs", {
      select: "doc",
      eq: { trip_id: tripId },
      order: "created_at.desc",
      limit: 50,
    })
    return rows.map((r) => r.doc)
  }
  async getRun(tripId: string, runId: string) {
    const rows = await this.sb.select<RunRow>("trip_enhancement_runs", {
      select: "doc",
      eq: { id: runId, trip_id: tripId },
    })
    return rows[0]?.doc ?? null
  }
  async saveRun(run: EnhancementRun) {
    await this.sb.insert(
      "trip_enhancement_runs",
      { id: run.id, trip_id: run.tripId, created_at: run.createdAt, doc: run },
      { onConflict: "id" },
    )
  }

  // Queue methods: each is one call to a trip_review_* SQL function
  // (supabase/migrations/20261121_trip_review_queue.sql), which does the
  // whole transition in one transaction and keeps doc.queue in step.
  async enqueueReview(run: RunningEnhancementRun, request: ReviewRequest, maxAttempts: number): Promise<EnqueueReviewResult> {
    const result = await this.sb.rpc<{ inserted: boolean; doc: EnhancementRun } | null>("trip_review_enqueue", {
      p_id: run.id,
      p_trip_id: run.tripId,
      p_doc: run,
      p_request: request,
      p_max_attempts: maxAttempts,
    })
    if (!result?.doc) throw new Error(`trip_review_enqueue returned no run for ${run.id}`)
    return result.inserted
      ? { inserted: true, run: result.doc as RunningEnhancementRun }
      : { inserted: false, live: result.doc }
  }
  async claimReview(workerId: string, leaseMs: number, runId?: string): Promise<ReviewClaim | null> {
    const rows = await this.sb.rpc<ClaimedRunRow[] | null>("trip_review_claim", {
      p_worker: workerId,
      p_lease_sec: leaseSec(leaseMs),
      p_run_id: runId ?? null,
    })
    const row = rows?.[0]
    if (!row) return null
    return { run: row.doc, request: row.request, workerId, attempt: row.attempts, maxAttempts: row.max_attempts }
  }
  async heartbeatReview(claim: ReviewClaim, leaseMs: number): Promise<boolean> {
    const held = await this.sb.rpc<boolean | null>("trip_review_heartbeat", { ...fence(claim), p_lease_sec: leaseSec(leaseMs) })
    return held === true
  }
  async releaseReview(claim: ReviewClaim): Promise<void> {
    await this.sb.rpc("trip_review_release", fence(claim))
  }
  async failReview(
    claim: ReviewClaim,
    error: string,
    retryInMs: number | null,
    failed: FailedEnhancementRun,
  ): Promise<"requeued" | "failed" | "lost"> {
    const result = await this.sb.rpc("trip_review_fail", {
      ...fence(claim),
      p_error: error,
      p_retry_in_ms: retryInMs === null ? null : Math.ceil(retryInMs),
      p_failed_doc: failed,
    })
    return oneOf("trip_review_fail", result, ["requeued", "failed", "lost"] as const)
  }
  async completeReview(
    claim: ReviewClaim,
    run: CompleteEnhancementRun,
    tripWrite: { trip: Trip; expectedUpdatedAt: string } | null,
  ): Promise<"ok" | "trip_changed" | "lost"> {
    const result = await this.sb.rpc("trip_review_complete", {
      ...fence(claim),
      p_run_doc: run,
      p_trip_id: tripWrite?.trip.id ?? run.tripId,
      p_trip_doc: tripWrite?.trip ?? null,
      p_expected_updated_at: tripWrite?.expectedUpdatedAt ?? null,
      p_trip_updated_at: tripWrite?.trip.updatedAt ?? null,
    })
    return oneOf("trip_review_complete", result, ["ok", "trip_changed", "lost"] as const)
  }
}

/** True when an error says the trips schema isn't in the database yet: a
 *  missing table (supabase/schema.sql not applied) or a missing function
 *  (a migration such as supabase/migrations/20261121_trip_review_queue.sql
 *  not applied). Routes map this to a 503 with an actionable message
 *  instead of a raw 500. Matches on the PostgREST code first, because the
 *  client keeps only the start of an error body. */
export function isNotProvisionedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table") ||
    message.includes("PGRST202") ||
    message.includes("Could not find the function")
  )
}

let storeSingleton: TripStore | null = null

export function getTripStore(): TripStore {
  if (storeSingleton) return storeSingleton
  if (process.env.TRIPS_STORE === "memory") {
    // Explicit dev/test override — useful for local screenshots and demos
    // against a database that doesn't have the trips tables yet.
    console.warn("[trips] TRIPS_STORE=memory — using in-memory trip store (non-persistent)")
    storeSingleton = new MemoryTripStore()
  } else if (config.supabaseUrl && config.supabaseServiceKey) {
    storeSingleton = new SupabaseTripStore(
      createSupabaseClient({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey }),
    )
  } else {
    console.warn("[trips] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — using in-memory trip store (non-persistent)")
    storeSingleton = new MemoryTripStore()
  }
  return storeSingleton
}
