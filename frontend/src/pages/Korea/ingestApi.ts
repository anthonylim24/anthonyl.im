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
  signal_source: 'caption' | 'transcript' | 'ocr' | 'location_tag' | 'multiple' | null
  vote_count: number
}

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'dead'
export type JobStep = 'queued' | 'fetching' | 'bundling' | 'extracting' | 'geocoding' | 'saving' | 'done'

export interface LogLine {
  id: number
  job_id: number
  step: JobStep
  level: 'info' | 'warn' | 'error'
  message: string
  created_at: string
}

export interface PostPreview {
  caption: string | null
  caption_truncated: boolean
  transcript: string | null
  transcript_truncated: boolean
  has_ocr: boolean
  location_tag: { name?: string; lat?: number; lng?: number } | null
}

export type Job = {
  id: number
  url: string
  status: JobStatus
  step: JobStep
  step_started_at: string | null
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
  post_id: number | null
  places: PlaceResult[]
  logs: LogLine[]
  /** Truncated preview of the cached post — caption, transcript, location tag.
   *  Lets the UI explain "no places found" with the source the LLM actually saw. */
  post_preview: PostPreview | null
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

/** Common error type so callers can branch on infrastructure misconfig. */
export class ApiNotConfiguredError extends Error {
  constructor(message = 'The Instagram places API is not configured on the server.') {
    super(message)
    this.name = 'ApiNotConfiguredError'
  }
}

async function throwOnError(res: Response): Promise<void> {
  // If a server-side SPA fallback caught the request (route not mounted),
  // we get a 200 with content-type text/html instead of JSON. That's almost
  // certainly a server-config issue, not a programming error. Detect it
  // before trying to parse JSON, so the UI can surface a clear message.
  const ct = res.headers.get('content-type') ?? ''
  if (res.ok && !ct.includes('application/json')) {
    throw new ApiNotConfiguredError(
      `Server returned ${ct || 'no content-type'} instead of JSON — the IG places ` +
      `endpoint is not mounted. Set CLERK_SECRET_KEY (or IG_DEV_BEARER) on the server.`,
    )
  }
  if (res.ok) return
  let message = `HTTP ${res.status}`
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') message = body.error
    else if (body && typeof body.message === 'string') message = body.message
  } catch {
    // ignore parse failures — keep the status-based message
  }
  // 503 with our specific error code → upgrade to ApiNotConfiguredError so
  // the page can show a one-time banner rather than a transient retry spinner.
  if (res.status === 503 && message.toLowerCase().includes('not_configured')) {
    throw new ApiNotConfiguredError(message)
  }
  throw new Error(message)
}

export async function submitUrl(
  getToken: () => Promise<string | null>,
  url: string,
): Promise<SubmitResult> {
  const headers = await authHeaders(getToken)
  const res = await fetch(BASE, {
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
