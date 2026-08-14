import { apiFetch } from "../../lib/apiBase"
import type {
  EnhancementRun,
  GeneratePreferences,
  Trip,
  TripAccess,
  TripAppearance,
  TripCollaborator,
  TripDay,
  TripStatus,
  TripSummary,
} from "./types"

// Fetch helpers for /api/trips. Every call is authenticated — pass Clerk's
// getToken (from useGetToken) so the server can resolve the user.

export type GetToken = () => Promise<string | null>

async function request<T>(
  getToken: GetToken,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getToken()
  const headers: Record<string, string> = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await apiFetch(`/api/trips${path}`, { ...init, headers, cache: "no-store" })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; message?: string }
      message = body.message || body.error || message
    } catch {
      /* keep status message */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export interface CreateTripInput {
  name: string
  destinations: string[]
  startDate: string
  endDate: string
  timezone: string
  status?: TripStatus
  tags?: string[]
  description?: string
  collaborators?: TripCollaborator[]
}

export const listTrips = (getToken: GetToken) =>
  request<{ trips: TripSummary[] }>(getToken, "").then((r) => r.trips)

export const getTrip = (getToken: GetToken, id: string) =>
  request<{ trip: Trip; access: TripAccess }>(getToken, `/${encodeURIComponent(id)}`)

export const createTrip = (getToken: GetToken, input: CreateTripInput) =>
  request<{ trip: Trip }>(getToken, "", { method: "POST", body: JSON.stringify(input) }).then((r) => r.trip)

export type UpdateTripPatch = {
  name?: string
  destinations?: string[]
  startDate?: string
  endDate?: string
  timezone?: string
  status?: TripStatus
  tags?: string[]
  collaborators?: TripCollaborator[]
  days?: TripDay[]
  slug?: string
  appearance?: TripAppearance
  description?: string | null
}

export const updateTrip = (
  getToken: GetToken,
  id: string,
  patch: UpdateTripPatch,
  init?: Pick<RequestInit, "signal">,
) =>
  request<{ trip: Trip }>(getToken, `/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    signal: init?.signal,
  }).then((r) => r.trip)

export const deleteTrip = (getToken: GetToken, id: string) =>
  request<{ ok: boolean }>(getToken, `/${encodeURIComponent(id)}`, { method: "DELETE" })

export const generateItinerary = (
  getToken: GetToken,
  id: string,
  input: { prompt?: string; preferences?: GeneratePreferences; replaceExisting?: boolean },
) =>
  request<{ trip: Trip; summary?: string }>(getToken, `/${encodeURIComponent(id)}/generate`, {
    method: "POST",
    body: JSON.stringify(input),
  })

export interface EnhanceTripResult {
  run: EnhancementRun
  trip?: Trip
  applied?: string[]
  error?: string
  message?: string
}

const ENHANCE_POLL_MS = 180_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readEnhanceBody(res: Response): Promise<EnhanceTripResult> {
  let body: EnhanceTripResult | null
  try {
    body = (await res.json()) as EnhanceTripResult
  } catch {
    throw new Error(`HTTP ${res.status}`)
  }
  if (typeof body !== "object" || body === null) throw new Error(`HTTP ${res.status}`)
  return body
}

async function pollEnhancement(
  getToken: GetToken,
  id: string,
  runId: string,
): Promise<EnhanceTripResult> {
  const deadline = Date.now() + ENHANCE_POLL_MS
  let wait = 400
  while (Date.now() < deadline) {
    await sleep(wait)
    wait = Math.min(Math.round(wait * 1.35), 2000)
    const token = await getToken()
    const res = await apiFetch(`/api/trips/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
    if (!res.ok) continue
    const body = await readEnhanceBody(res)
    if (body.run && body.run.status !== "running") {
      return {
        ...body,
        applied: body.applied ?? body.run.appliedSuggestionIds,
      }
    }
  }
  throw new Error("The AI review is taking too long. Nothing in your itinerary changed, so you can run it again.")
}

/** Starts a run (202) and polls until it leaves `running`. A legacy 502
 *  with a `{ run }` body is still accepted so older servers keep working. */
export async function enhanceTrip(
  getToken: GetToken,
  id: string,
  scope: "day" | "trip",
  dayId?: string,
  prompt?: string,
): Promise<EnhanceTripResult> {
  const token = await getToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await apiFetch(`/api/trips/${encodeURIComponent(id)}/enhance`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({ scope, dayId, prompt: prompt?.trim() || undefined }),
  })
  const body = await readEnhanceBody(res)
  if (body.run?.status === "running") return pollEnhancement(getToken, id, body.run.id)
  if (res.ok) return body
  if (res.status === 502 && body.run) return body
  throw new Error(body.message || body.error || `HTTP ${res.status}`)
}

export const applySuggestions = (getToken: GetToken, id: string, runId: string, suggestionIds: string[]) =>
  request<{ trip: Trip; applied: string[]; skipped: string[] }>(
    getToken,
    `/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}/apply`,
    { method: "POST", body: JSON.stringify({ suggestionIds }) },
  )

/** Other trips' Instagram places, via list+get (routes that exist on production). */
export async function listForeignInstagramTrips(getToken: GetToken, currentTripId: string): Promise<Trip[]> {
  const summaries = await listTrips(getToken)
  const others = summaries.filter((s) => s.id !== currentTripId)
  const loaded = await Promise.all(
    others.map((s) =>
      getTrip(getToken, s.id)
        .then((r) => r.trip)
        .catch(() => null),
    ),
  )
  return loaded.filter((t): t is Trip => t != null)
}
