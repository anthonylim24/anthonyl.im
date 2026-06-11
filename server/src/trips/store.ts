import { config } from "../config"
import { createSupabaseClient, type SupabaseClient } from "../igPlaces/supabase"
import type { EnhancementRun, Trip } from "./types"

// ── TripStore ────────────────────────────────────────────────────────────
//
// Trips are stored as whole documents (one row per trip, `doc jsonb`).
// Trip counts are tiny (personal travel planner), so visibility filtering
// happens in process rather than in SQL.

export interface TripStore {
  list(): Promise<Trip[]>
  get(id: string): Promise<Trip | null>
  create(trip: Trip): Promise<void>
  update(trip: Trip): Promise<void>
  delete(id: string): Promise<void>
  listRuns(tripId: string): Promise<EnhancementRun[]>
  getRun(tripId: string, runId: string): Promise<EnhancementRun | null>
  saveRun(run: EnhancementRun): Promise<void>
}

export class MemoryTripStore implements TripStore {
  private trips = new Map<string, Trip>()
  private runs = new Map<string, EnhancementRun>()

  async list() {
    return [...this.trips.values()]
  }
  async get(id: string) {
    return this.trips.get(id) ?? null
  }
  async create(trip: Trip) {
    this.trips.set(trip.id, structuredClone(trip))
  }
  async update(trip: Trip) {
    this.trips.set(trip.id, structuredClone(trip))
  }
  async delete(id: string) {
    this.trips.delete(id)
    for (const [k, run] of this.runs) if (run.tripId === id) this.runs.delete(k)
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
}

let storeSingleton: TripStore | null = null

export function getTripStore(): TripStore {
  if (storeSingleton) return storeSingleton
  if (config.supabaseUrl && config.supabaseServiceKey) {
    storeSingleton = new SupabaseTripStore(
      createSupabaseClient({ url: config.supabaseUrl, serviceKey: config.supabaseServiceKey }),
    )
  } else {
    console.warn("[trips] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — using in-memory trip store (non-persistent)")
    storeSingleton = new MemoryTripStore()
  }
  return storeSingleton
}
