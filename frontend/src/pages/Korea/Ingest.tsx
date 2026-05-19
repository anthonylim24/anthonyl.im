import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { motion, useReducedMotion } from 'motion/react'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { isInstagramUrl } from './isInstagramUrl'
import { fetchStats, listJobs, retryJob, submitUrl } from './ingestApi'
import type { Job, JobStep, LogLine, Stats } from './ingestApi'

// ─── Step pipeline ────────────────────────────────────────────────────────────

const PIPELINE_STEPS: JobStep[] = ['fetching', 'bundling', 'extracting', 'geocoding', 'saving']

type UiStep = 'fetching' | 'bundling' | 'extracting' | 'geocoding' | 'saving'

const STEP_DESCRIPTIONS: Record<UiStep, string> = {
  fetching:   'Pulls the post from Instagram via yt-dlp (local) or Apify (cloud fallback). Captures caption, media, and location tag.',
  bundling:   'Transcribes audio with Whisper (Korean + auto-detect dual-pass) and OCRs frames + carousel images with Google Vision.',
  extracting: "Runs gpt-oss-120b 3× in parallel with self-consistency voting. Drops hallucinations whose quote isn't in the source.",
  geocoding:  'Looks each place up in Google Places + Kakao in parallel. Reconciles disagreements and flags them for review.',
  saving:     'Writes the post and extracted places into Supabase under your user.',
}

const STEP_DURATIONS: Record<UiStep, number> = {
  fetching: 8, bundling: 25, extracting: 4, geocoding: 3, saving: 1,
}

function formatLogTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function computeEta(job: Job): { label: string; tone: 'live' | 'done' } | null {
  if (job.status === 'done' || job.step === 'done') {
    const ms = new Date(job.updated_at).getTime() - new Date(job.created_at).getTime()
    return { label: `completed in ${Math.max(1, Math.round(ms / 1000))}s`, tone: 'done' }
  }
  if (job.status !== 'running' && job.status !== 'pending') return null
  const order: UiStep[] = ['fetching', 'bundling', 'extracting', 'geocoding', 'saving']
  const current = order.includes(job.step as UiStep) ? job.step as UiStep : null
  if (!current) {
    const total = order.reduce((a, s) => a + STEP_DURATIONS[s], 0)
    return { label: `~${total}s left`, tone: 'live' }
  }
  const currentIdx = order.indexOf(current)
  const elapsedInStep = job.step_started_at
    ? (Date.now() - new Date(job.step_started_at).getTime()) / 1000
    : 0
  const currentRemaining = Math.max(0, STEP_DURATIONS[current] - elapsedInStep)
  const futureRemaining = order.slice(currentIdx + 1).reduce((a, s) => a + STEP_DURATIONS[s], 0)
  const total = Math.round(currentRemaining + futureRemaining)
  return { label: `~${Math.max(1, total)}s left`, tone: 'live' }
}

type StepState = 'past' | 'current' | 'future' | 'errored'

function deriveStepStates(job: Job): Record<string, StepState> {
  const result: Record<string, StepState> = {}

  if (job.status === 'done' || job.step === 'done') {
    for (const s of PIPELINE_STEPS) result[s] = 'past'
    return result
  }

  const isFailed = job.status === 'failed' || job.status === 'dead'
  const currentIdx = PIPELINE_STEPS.indexOf(job.step as Exclude<JobStep, 'queued' | 'done'>)

  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const s = PIPELINE_STEPS[i]
    if (currentIdx === -1) {
      // step is 'queued' — all future
      result[s] = 'future'
    } else if (i < currentIdx) {
      result[s] = 'past'
    } else if (i === currentIdx) {
      result[s] = isFailed ? 'errored' : 'current'
    } else {
      result[s] = 'future'
    }
  }

  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const secs = Math.round((Date.now() - date.getTime()) / 1000)
  if (secs < 5) return 'just now'
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins === 1) return '1 min ago'
  return `${mins} mins ago`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatsLine({ stats }: { stats: Stats | null }) {
  if (!stats) return null

  const parts: string[] = []
  if ((stats.pending ?? 0) > 0) parts.push(`${stats.pending} pending`)
  if ((stats.running ?? 0) > 0) parts.push(`${stats.running} running`)
  if ((stats.done ?? 0) > 0) parts.push(`${stats.done} done`)
  if ((stats.failed ?? 0) > 0) parts.push(`${stats.failed} failed`)
  if ((stats.dead ?? 0) > 0) parts.push(`${stats.dead} dead`)

  if (parts.length === 0) return null

  return (
    <span className="font-mono text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
      {parts.join(' · ')}
    </span>
  )
}

function ValidationHint({ value }: { value: string }) {
  if (!value) {
    return (
      <p className="mt-1.5 text-[12px] text-stone-400 dark:text-stone-500">
        Paste an Instagram post or reel URL
      </p>
    )
  }
  if (isInstagramUrl(value)) {
    return (
      <p className="mt-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
        Looks good
      </p>
    )
  }
  return (
    <p className="mt-1.5 text-[12px] text-rose-600 dark:text-rose-400">
      Not an Instagram URL
    </p>
  )
}

function StatusPill({ status }: { status: Job['status'] }) {
  const labels: Record<Job['status'], string> = {
    pending: 'Pending',
    running: 'Running',
    done: 'Done',
    failed: 'Failed',
    dead: 'Dead',
  }
  const styles: Record<Job['status'], string> = {
    pending: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    running: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    failed: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    dead: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  }

  return (
    <span
      aria-label={`Status: ${labels[status]}`}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  )
}

function StepTimeline({ job, reduce }: { job: Job; reduce: boolean | null }) {
  const stepStates = deriveStepStates(job)
  const stepLabels: Record<string, string> = {
    fetching: 'Fetch',
    bundling: 'Bundle',
    extracting: 'Extract',
    geocoding: 'Geocode',
    saving: 'Save',
  }

  const currentStep = PIPELINE_STEPS.find((s) => stepStates[s] === 'current') ?? null

  return (
    <div
      aria-live="polite"
      aria-label={currentStep ? `Current step: ${currentStep}` : undefined}
      className="flex items-center gap-0 overflow-x-auto"
    >
      {PIPELINE_STEPS.map((step, i) => {
        const state = stepStates[step]
        const isLast = i === PIPELINE_STEPS.length - 1
        const description = STEP_DESCRIPTIONS[step as UiStep]

        return (
          <div key={step} className="flex min-w-0 items-center">
            <button
              type="button"
              title={description}
              aria-label={`${stepLabels[step]}: ${description}`}
              className="flex flex-col items-center gap-1 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 rounded"
            >
              {/* Circle indicator */}
              {state === 'past' ? (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500">
                  <CheckCircle2 className="h-3 w-3 text-white" aria-hidden />
                </span>
              ) : state === 'current' ? (
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 ${reduce ? '' : 'animate-pulse'}`}
                >
                  <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                </span>
              ) : state === 'errored' ? (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500">
                  <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                </span>
              ) : (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 dark:border-stone-600">
                  <Circle className="h-2.5 w-2.5 text-stone-300 dark:text-stone-600" aria-hidden />
                </span>
              )}
              {/* Label */}
              <span
                className={`whitespace-nowrap text-[10px] leading-none ${
                  state === 'past'
                    ? 'font-medium text-amber-600 dark:text-amber-400'
                    : state === 'current'
                      ? 'font-semibold text-rose-600 dark:text-rose-400'
                      : state === 'errored'
                        ? 'font-semibold text-red-600 dark:text-red-400'
                        : 'text-stone-400 dark:text-stone-600'
                }`}
              >
                {stepLabels[step]}
              </span>
            </button>

            {/* Connector line */}
            {!isLast && (
              <span
                aria-hidden
                className={`mx-1.5 h-px w-6 shrink-0 sm:w-8 ${
                  state === 'past' ? 'bg-amber-400' : 'bg-stone-200 dark:bg-stone-700'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ConfidenceBadge({ band }: { band: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    low: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  }
  return (
    <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${styles[band]}`}>
      {band}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="rounded bg-stone-100 px-1 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
      {category}
    </span>
  )
}

function PlacesList({ places }: { places: Job['places'] }) {
  const [expanded, setExpanded] = useState(false)

  if (places.length === 0) return null

  return (
    <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex min-h-[44px] w-full items-center gap-2 text-left text-[13px] font-medium text-stone-700 transition-colors hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
        aria-expanded={expanded}
      >
        <span
          aria-hidden
          className={`inline-block transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
        >
          ▶
        </span>
        {places.length} {places.length === 1 ? 'place' : 'places'} extracted
      </button>

      {expanded && (
        <ul className="mt-2 space-y-2">
          {places.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] text-stone-700 dark:text-stone-300"
            >
              <span className="font-medium">{p.name}</span>
              {p.name_romanized && p.name_romanized !== p.name && (
                <span className="text-stone-400 dark:text-stone-500">({p.name_romanized})</span>
              )}
              <CategoryBadge category={p.category} />
              <ConfidenceBadge band={p.confidence_band} />
              {p.is_subject && (
                <span className="rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                  subject
                </span>
              )}
              {p.city && (
                <span className="text-stone-400 dark:text-stone-500">{p.city}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LogsViewer({ logs }: { logs: LogLine[] }) {
  const listRef = useRef<HTMLOListElement>(null)
  const prevLenRef = useRef(logs.length)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const wasAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
    if (wasAtBottom && logs.length > prevLenRef.current) {
      el.scrollTop = el.scrollHeight
    }
    prevLenRef.current = logs.length
  }, [logs.length])

  return (
    <details className="mt-3 rounded-xl border border-stone-200/60 dark:border-stone-800/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200">
        Logs ({logs.length})
      </summary>
      <ol
        ref={listRef}
        className="max-h-48 overflow-y-auto px-3 py-2 font-mono text-[11px]"
        aria-live="polite"
        aria-label="Job log lines"
      >
        {logs.map((l) => (
          <li key={l.id} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-stone-400">{formatLogTime(l.created_at)}</span>
            <span
              className={`shrink-0 uppercase tracking-wide ${
                l.level === 'error'
                  ? 'text-red-600 dark:text-red-400'
                  : l.level === 'warn'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {l.step}
            </span>
            <span className="break-all text-stone-700 dark:text-stone-300">{l.message}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

function JobCard({
  job,
  reduce,
  onRetry,
}: {
  job: Job
  reduce: boolean | null
  onRetry: () => Promise<void>
}) {
  const shortUrl = job.url.replace(/^https?:\/\/(www\.)?instagram\.com/, 'instagram.com')

  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const handleRetry = async () => {
    setRetrying(true)
    setRetryError(null)
    try {
      await onRetry()
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'retry failed')
    } finally {
      setRetrying(false)
    }
  }

  const eta = computeEta(job)

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl border border-stone-200/80 bg-white p-5 dark:border-stone-800/80 dark:bg-stone-900/60"
    >
      {/* Running sweep animation */}
      {job.status === 'running' && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] overflow-hidden rounded-t-2xl"
        >
          <div
            className={`h-full w-1/3 bg-gradient-to-r from-transparent via-rose-500 to-transparent${
              reduce ? '' : ' animate-[ig-sweep_1.6s_linear_infinite]'
            }`}
          />
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 break-all font-mono text-[12px] text-stone-600 underline-offset-2 hover:text-rose-700 hover:underline dark:text-stone-400 dark:hover:text-rose-400"
          title={job.url}
        >
          {shortUrl} ↗
        </a>
        <StatusPill status={job.status} />
      </div>

      {/* Step timeline */}
      <div className="mt-4">
        <StepTimeline job={job} reduce={reduce} />
      </div>

      {/* Meta row */}
      <p className="mt-3 font-mono text-[11px] text-stone-400 dark:text-stone-500">
        Created {formatTimestamp(job.created_at)}
        <span aria-hidden className="mx-1.5">·</span>
        Updated {formatTimestamp(job.updated_at)}
        <span aria-hidden className="mx-1.5">·</span>
        {job.attempts} {job.attempts === 1 ? 'attempt' : 'attempts'}
        {eta && (
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              eta.tone === 'done'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
            }`}
          >
            {eta.label}
          </span>
        )}
      </p>

      {/* Error message */}
      {job.last_error && (
        <p className="mt-2 break-words rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
          {job.last_error}
        </p>
      )}

      {/* Retry button for dead/failed jobs */}
      {(job.status === 'dead' || job.status === 'failed') && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
            aria-busy={retrying}
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
          {retryError && (
            <span className="text-[11px] text-red-700 dark:text-red-400">{retryError}</span>
          )}
        </div>
      )}

      {/* Places */}
      {job.places.length > 0 && <PlacesList places={job.places} />}

      {/* Logs viewer */}
      <LogsViewer logs={job.logs} />
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Ingest() {
  const { getToken } = useAuth()
  const reduce = useReducedMotion()

  // Form state
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshTick, setRefreshTick] = useState(0) // forces re-render for time-ago

  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const doFetchJobs = useCallback(async () => {
    try {
      const data = await listJobs(getTokenRef.current)
      setJobs(data)
      setLastRefreshed(new Date())
    } catch {
      // silently ignore — we'll retry on the next interval
    }
  }, [])

  const doFetchStats = useCallback(async () => {
    try {
      const data = await fetchStats(getTokenRef.current)
      setStats(data)
    } catch {
      // silently hide stats on error — per spec
    }
  }, [])

  // ── Initial fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    void doFetchJobs()
    void doFetchStats()
  }, [doFetchJobs, doFetchStats])

  // ── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      void doFetchJobs()
      void doFetchStats()
    }

    const id = setInterval(tick, 2000)
    const onVisible = () => tick()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [doFetchJobs, doFetchStats])

  // ── Tick for "refreshed X ago" ─────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => setRefreshTick((t) => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  // ── Tick for ETA countdown (1s, only while a job is running) ──────────────

  const [etaTick, setEtaTick] = useState(0)
  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running')
    if (!hasRunning) return
    const id = setInterval(() => setEtaTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [jobs])
  // etaTick drives re-renders for ETA countdown — consumed via Date.now() in computeEta
  void etaTick

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isInstagramUrl(url) || submitting) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      await submitUrl(getTokenRef.current, url)
      setUrl('')
      // Immediately refresh so the new job appears
      await doFetchJobs()
      await doFetchStats()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = isInstagramUrl(url) && !submitting
  const ago = lastRefreshed ? timeAgo(lastRefreshed) : null
  // refreshTick used only to re-render "X ago" string — no-op usage satisfies linter
  void refreshTick

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Page header */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-stone-500 dark:text-stone-500">
              <span className="text-rose-600 dark:text-rose-400">IG</span>
              <span aria-hidden className="mx-2 h-px w-8 inline-block align-middle bg-stone-300 dark:bg-stone-700" />
              Place extractor
            </p>
            <h1
              className="mt-2 font-serif text-[clamp(1.75rem,4.5vw,2.75rem)] font-medium leading-[1.08] tracking-[-0.02em] text-stone-900 dark:text-stone-100"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Ingest
            </h1>
            <p className="mt-2 max-w-[52ch] text-sm text-stone-600 dark:text-stone-400">
              Submit an Instagram post URL and watch the worker extract places in real time.
            </p>
          </div>
          <StatsLine stats={stats} />
        </div>

        {ago && (
          <p className="mt-3 font-mono text-[11px] text-stone-400 dark:text-stone-500">
            Refreshed {ago}
          </p>
        )}
      </motion.header>

      {/* Hairline */}
      <div className="mt-8 border-b border-stone-200/80 dark:border-stone-800/80" aria-hidden />

      {/* Submission form */}
      <motion.section
        aria-label="Submit new URL"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.05 }}
        className="mt-8"
      >
        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="ig-url"
            className="block text-[13px] font-medium text-stone-700 dark:text-stone-300"
          >
            Instagram URL
          </label>
          <div className="mt-2 flex gap-3">
            <input
              id="ig-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setSubmitError(null)
              }}
              placeholder="https://www.instagram.com/reel/…"
              className="min-h-[44px] flex-1 rounded-xl border border-stone-300 bg-white px-4 py-2 font-mono text-[13px] text-stone-900 placeholder-stone-400 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:placeholder-stone-600 dark:focus:border-rose-500 dark:focus:ring-rose-500/20"
              aria-describedby="ig-url-hint"
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={submitting}
              className="inline-flex min-h-[44px] min-w-[80px] items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-2 text-[13px] font-medium text-white outline-none transition hover:bg-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-rose-500 dark:hover:bg-rose-400"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                'Submit'
              )}
            </button>
          </div>

          <div id="ig-url-hint">
            {submitError ? (
              <p className="mt-1.5 text-[12px] text-red-600 dark:text-red-400">{submitError}</p>
            ) : (
              <ValidationHint value={url} />
            )}
          </div>
        </form>
      </motion.section>

      {/* Jobs list */}
      <section aria-label="Recent jobs" className="mt-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
          Recent jobs
          <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">·</span>
          auto-refresh
        </p>

        <div className="mt-4 space-y-4">
          {jobs.length === 0 ? (
            <motion.div
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/30"
            >
              <p className="text-center text-sm text-stone-400 dark:text-stone-600">
                No ingested links yet.
                <br />
                Paste one above to begin.
              </p>
            </motion.div>
          ) : (
            jobs.map((job) => (
              <JobCard key={job.id} job={job} reduce={reduce} onRetry={async () => {
                await retryJob(getTokenRef.current, job.id)
                void doFetchJobs()
              }} />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
