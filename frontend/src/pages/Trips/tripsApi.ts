import type { EnhancementRun, GeneratePreferences, Trip, TripAccess, TripCollaborator, TripDay, TripStatus, TripSummary } from "./types"

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
  const res = await fetch(`/api/trips${path}`, { ...init, headers, cache: "no-store" })
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

export const updateTrip = (
  getToken: GetToken,
  id: string,
  patch: Partial<CreateTripInput> & { days?: TripDay[]; slug?: string },
) =>
  request<{ trip: Trip }>(getToken, `/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
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

export const enhanceTrip = (getToken: GetToken, id: string, scope: "day" | "trip", dayId?: string, prompt?: string) =>
  request<{ run: EnhancementRun; trip?: Trip }>(getToken, `/${encodeURIComponent(id)}/enhance`, {
    method: "POST",
    body: JSON.stringify({ scope, dayId, prompt: prompt?.trim() || undefined }),
  })

export const applySuggestions = (getToken: GetToken, id: string, runId: string, suggestionIds: string[]) =>
  request<{ trip: Trip; applied: string[]; skipped: string[] }>(
    getToken,
    `/${encodeURIComponent(id)}/enhancements/${encodeURIComponent(runId)}/apply`,
    { method: "POST", body: JSON.stringify({ suggestionIds }) },
  )
