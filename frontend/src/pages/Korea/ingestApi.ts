// Fetch helpers for the Instagram place ingestion pipeline.
// Each helper accepts a `getToken` function (from Clerk's useAuth()) so it can
// attach a fresh JWT to every request.

export type PlaceResult = {
  id: number
  name: string
  name_romanized: string | null
  city: string | null
  category: 'restaurant' | 'cafe' | 'bar' | 'shopping' | 'activity' | 'hotel' | 'landmark' | 'other'
  confidence: number
  confidence_band: 'high' | 'medium' | 'low'
  is_subject: boolean
  supporting_quote: string | null
  address: string | null
  lat: number | null
  lng: number | null
  geocode_source: string | null
  geocode_disagree: boolean
}

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead'
export type JobStep = 'queued' | 'fetching' | 'bundling' | 'extracting' | 'geocoding' | 'saving' | 'done'

export type Job = {
  id: number
  url: string
  status: JobStatus
  step: JobStep
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
  post_id: number | null
  places: PlaceResult[]
}

export type Stats = {
  enabled: boolean
  pending?: number
  running?: number
  done?: number
  failed?: number
  dead?: number
  error?: string
}

type SubmitResult = {
  jobs: Array<{ jobId: number; status: string; reused: boolean }>
}

const BASE = '/api/korea/places/from-instagram'

async function authHeaders(
  getToken: () => Promise<string | null>,
): Promise<Record<string, string>> {
  const token = await getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function throwOnError(res: Response): Promise<void> {
  if (res.ok) return
  let message = `HTTP ${res.status}`
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') message = body.error
    else if (body && typeof body.message === 'string') message = body.message
  } catch {
    // ignore parse failures — keep the status-based message
  }
  throw new Error(message)
}

export async function submitUrl(
  getToken: () => Promise<string | null>,
  url: string,
): Promise<SubmitResult> {
  const headers = await authHeaders(getToken)
  const res = await fetch(BASE + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ url }),
  })
  await throwOnError(res)
  return res.json() as Promise<SubmitResult>
}

export async function listJobs(
  getToken: () => Promise<string | null>,
  limit = 50,
): Promise<Job[]> {
  const headers = await authHeaders(getToken)
  const res = await fetch(`${BASE}/jobs?limit=${limit}`, { headers })
  await throwOnError(res)
  return res.json() as Promise<Job[]>
}

export async function retryJob(
  getToken: () => Promise<string | null>,
  jobId: number,
): Promise<void> {
  const token = await getToken()
  const r = await fetch(`${BASE}/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try {
      const body = await r.json() as { error?: string }
      if (body.error) msg = body.error
    } catch {}
    throw new Error(msg)
  }
}

export async function fetchStats(
  getToken: () => Promise<string | null>,
): Promise<Stats> {
  const headers = await authHeaders(getToken)
  const res = await fetch(`${BASE}/_stats`, { headers })
  await throwOnError(res)
  return res.json() as Promise<Stats>
}
