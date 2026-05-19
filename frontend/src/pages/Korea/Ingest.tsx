import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { clerkEnabled, useGetToken } from '@/lib/safeAuth'
import { motion, useReducedMotion } from 'motion/react'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { isInstagramUrl } from './isInstagramUrl'
import { ApiNotConfiguredError, fetchStats, listJobs, reextractJob, retryJob, submitUrl } from './ingestApi'
import type { Job, JobStep, LogLine, PostPreview, Stats } from './ingestApi'

// ─── Step pipeline ────────────────────────────────────────────────────────────

const PIPELINE_STEPS = ['fetching', 'bundling', 'extracting', 'geocoding', 'saving'] as const satisfies JobStep[]

type UiStep = (typeof PIPELINE_STEPS)[number]

interface StepInfo {
  summary: string
  stack: string[]
}

const STEP_DESCRIPTIONS: Record<UiStep, StepInfo> = {
  fetching: {
    summary:
      "Pulls the Instagram post — caption, media URLs, owner, and the post's location tag if any.",
    stack: [
      'Apify instagram-scraper actor (primary; surfaces location tag + lat/lng)',
      'yt-dlp CLI via Bun.spawn (free backup when Apify is unavailable)',
      'Hono fetch + JSON normalizer',
    ],
  },
  bundling: {
    summary:
      'Builds the multimodal evidence bundle the extractor will read — caption + transcript + on-screen text.',
    stack: [
      'ffmpeg (download, frame extraction at 1/5 fps)',
      'Groq Whisper-large-v3-turbo (dual-pass: ko + auto-detect, merged by avg_logprob)',
      'Google Cloud Vision DOCUMENT_TEXT_DETECTION (Korean + English OCR)',
    ],
  },
  extracting: {
    summary:
      'Identifies the real-world places mentioned, with confidence bands derived from self-consistency voting.',
    stack: [
      'Groq openai/gpt-oss-120b (3× parallel, temperature 0.5)',
      'Cerebras Inference gpt-oss-120b (fallback when Groq is rate-limited)',
      'Strict JSON schema (token-constrained decoding)',
      "Hallucination filter: drop places whose verbatim quote isn’t in the source",
      'Vote merge + canonicalize (NFD strip-marks + Levenshtein ≤ 2)',
    ],
  },
  geocoding: {
    summary:
      'Resolves each extracted place to a canonical address + lat/lng, cross-checking two providers.',
    stack: [
      'Google Places (New) — Text Search → Place Details (Pro tier)',
      'Kakao Local — /v2/local/search/keyword (Korean side-streets)',
      'Reconciliation: haversine ≤ 200 m + fuzzy-match name → agree/disagree',
      'Quality bar: Korea bbox guard + rating-count floor on restaurants/cafes/bars',
    ],
  },
  saving: {
    summary:
      'Writes the cached post payload + extracted places into Supabase, scoped to your user.',
    stack: [
      'Supabase PostgREST (REST + RPC, service-role)',
      'instagram_posts (shared cache, dedupe_key)',
      'instagram_places (per-user, soft-dedupe on google_place_id)',
    ],
  },
}

const STEP_DURATIONS: Record<UiStep, number> = {
  fetching: 8, bundling: 25, extracting: 4, geocoding: 3, saving: 1,
}

// ─── Shared hooks ─────────────────────────────────────────────────────────────

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs, active])
  return now
}

// ─── Step utilities ───────────────────────────────────────────────────────────

function formatLogTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function computeEta(job: Job, now: number): { label: string; tone: 'live' | 'done' | 'slow' } | null {
  if (job.status === 'done' || job.step === 'done') {
    // Use the first log entry's timestamp as the run start — `created_at`
    // would be stale after a re-extract (the job row was created on the
    // original submission, but the actual processing happened later when
    // the user clicked "Re-run extraction"). Reextract wipes logs, so the
    // earliest log entry is fresh.
    const start = job.logs.length > 0
      ? new Date(job.logs[0].created_at).getTime()
      : new Date(job.created_at).getTime()
    const ms = new Date(job.updated_at).getTime() - start
    return { label: `completed in ${Math.max(1, Math.round(ms / 1000))}s`, tone: 'done' }
  }
  if (job.status !== 'running' && job.status !== 'pending') return null
  const current = PIPELINE_STEPS.includes(job.step as UiStep) ? job.step as UiStep : null
  if (!current) {
    const total = PIPELINE_STEPS.reduce((a, s) => a + STEP_DURATIONS[s], 0)
    return { label: `~${total}s left`, tone: 'live' }
  }
  const currentIdx = PIPELINE_STEPS.indexOf(current)
  const elapsedInStep = job.step_started_at
    ? (now - new Date(job.step_started_at).getTime()) / 1000
    : 0

  // Slow-step fallback: if elapsed > 2× the estimate, surface a warning
  if (elapsedInStep > 2 * STEP_DURATIONS[current]) {
    return { label: 'taking longer than expected', tone: 'slow' }
  }

  const currentRemaining = Math.max(0, STEP_DURATIONS[current] - elapsedInStep)
  const futureRemaining = PIPELINE_STEPS.slice(currentIdx + 1).reduce((a, s) => a + STEP_DURATIONS[s], 0)
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

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r === 0 ? `${m}m` : `${m}m ${r}s`
}

/**
 * Live per-step view for the popover: for the past, current or errored step
 * find the latest log line and how long the step has taken (or is taking).
 */
function liveStepInfo(
  job: Job,
  step: UiStep,
  state: 'past' | 'current' | 'errored' | 'future',
  now: number,
): { stepLogs: LogLine[]; timingLabel: string | null } {
  if (state === 'future') return { stepLogs: [], timingLabel: null }
  const stepLogs = job.logs.filter((l) => l.step === step)

  let timingLabel: string | null = null
  if (state === 'past') {
    if (stepLogs.length) {
      const start = new Date(stepLogs[0].created_at).getTime()
      const nextStep = PIPELINE_STEPS[PIPELINE_STEPS.indexOf(step) + 1]
      const nextStepLogs = nextStep ? job.logs.filter((l) => l.step === nextStep) : []
      const end = nextStepLogs.length
        ? new Date(nextStepLogs[0].created_at).getTime()
        : new Date(stepLogs[stepLogs.length - 1].created_at).getTime()
      timingLabel = `took ${formatDuration((end - start) / 1000)}`
    }
  } else if (state === 'current') {
    const startIso = job.step_started_at ?? (stepLogs[0]?.created_at ?? null)
    if (startIso) {
      const elapsed = (now - new Date(startIso).getTime()) / 1000
      timingLabel = `${formatDuration(elapsed)} elapsed`
    }
  } else if (state === 'errored') {
    if (stepLogs.length) {
      const start = new Date(stepLogs[0].created_at).getTime()
      const end = new Date(stepLogs[stepLogs.length - 1].created_at).getTime()
      timingLabel = `failed after ${formatDuration((end - start) / 1000)}`
    }
  }
  return { stepLogs, timingLabel }
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

function StepTimeline({ job, reduce, etaNow }: { job: Job; reduce: boolean | null; etaNow: number }) {
  const stepStates = deriveStepStates(job)
  const stepLabels: Record<string, string> = {
    fetching: 'Fetch',
    bundling: 'Bundle',
    extracting: 'Extract',
    geocoding: 'Geocode',
    saving: 'Save',
  }

  const currentStep = PIPELINE_STEPS.find((s) => stepStates[s] === 'current') ?? null

  const [expandedStep, setExpandedStep] = useState<UiStep | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Click-outside closes the expanded popover
  useEffect(() => {
    if (!expandedStep) return
    const handler = (e: MouseEvent) => {
      if (timelineRef.current && !timelineRef.current.contains(e.target as Node)) {
        setExpandedStep(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expandedStep])

  return (
    <div
      ref={timelineRef}
      aria-live="polite"
      aria-label={currentStep ? `Current step: ${currentStep}` : undefined}
      // overflow-visible (not overflow-x-auto) so the per-step popover can
      // escape the timeline's clipping rect. The step pills themselves are
      // narrow enough to fit on the smallest expected viewport (mobile) so
      // horizontal scrolling isn't actually needed.
      className="flex items-center gap-0 overflow-visible"
    >
      {PIPELINE_STEPS.map((step, i) => {
        const state = stepStates[step]
        const isLast = i === PIPELINE_STEPS.length - 1
        const info = STEP_DESCRIPTIONS[step as UiStep]
        const ariaSummary = `${stepLabels[step]}: ${info.summary} Stack: ${info.stack.join('; ')}.`
        const isExpanded = expandedStep === step

        return (
          <div key={step} className="flex min-w-0 items-center">
            <div className="group relative">
            <button
              type="button"
              aria-label={ariaSummary}
              onClick={() => setExpandedStep(isExpanded ? null : step as UiStep)}
              className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 px-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 rounded"
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
                <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
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

            {/* Hover/focus popover + tap-to-expand on mobile */}
            <div
              role="tooltip"
              className={`absolute left-1/2 top-[calc(100%+8px)] z-20 w-72 -translate-x-1/2 rounded-xl border border-stone-200/80 bg-white p-3 text-left shadow-lg ring-1 ring-stone-900/5 transition-opacity duration-150 dark:border-stone-700/80 dark:bg-stone-900 dark:ring-stone-100/5 ${
                isExpanded
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'
              }`}
            >
              <StepPopoverContent step={step as UiStep} state={state} info={info} job={job} etaNow={etaNow} />
            </div>
            </div>

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

function StepPopoverContent({
  step,
  state,
  info,
  job,
  etaNow,
}: {
  step: UiStep
  state: 'past' | 'current' | 'errored' | 'future'
  info: StepInfo
  job: Job
  etaNow: number
}) {
  const { stepLogs, timingLabel } = liveStepInfo(job, step, state, etaNow)
  const stateLabel =
    state === 'current' ? 'Running now' :
    state === 'past' ? 'Completed' :
    state === 'errored' ? 'Failed here' :
    'Up next'

  const stateColor =
    state === 'current' ? 'text-rose-700 dark:text-rose-300' :
    state === 'past' ? 'text-emerald-700 dark:text-emerald-400' :
    state === 'errored' ? 'text-red-700 dark:text-red-400' :
    'text-stone-500 dark:text-stone-400'

  // Compute per-log relative offset from the first line of this step — useful
  // for seeing where time is being spent within a stage.
  const stepStartMs = stepLogs.length ? new Date(stepLogs[0].created_at).getTime() : 0

  return (
    <>
      {/* Live status header (per job) */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-medium uppercase tracking-wider ${stateColor}`}>
          {stateLabel}
        </span>
        {timingLabel && (
          <span className="font-mono text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
            {timingLabel}
          </span>
        )}
      </div>

      {/* Full per-step log breakdown — auto-scrolls when many lines */}
      {stepLogs.length > 0 && (
        <ol
          className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-md bg-stone-50 px-2 py-1.5 dark:bg-stone-950/50"
          aria-label={`Activity log for ${stateLabel.toLowerCase()} step`}
        >
          {stepLogs.map((l, idx) => {
            const offsetSec = idx === 0
              ? 0
              : Math.max(0, (new Date(l.created_at).getTime() - stepStartMs) / 1000)
            const color =
              l.level === 'error'
                ? 'text-red-700 dark:text-red-400'
                : l.level === 'warn'
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-stone-700 dark:text-stone-200'
            return (
              <li key={l.id} className="flex gap-2 text-[11px] leading-snug">
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-stone-400 dark:text-stone-500">
                  {idx === 0 ? 'start' : `+${formatDuration(offsetSec)}`}
                </span>
                <span className={`break-words ${color}`}>{l.message}</span>
              </li>
            )
          })}
        </ol>
      )}

      {state === 'current' && stepLogs.length === 0 && (
        <p className="mt-2 text-[12px] italic text-stone-500 dark:text-stone-400">
          Starting…
        </p>
      )}

      {/* Static "what this step does in general" — divider only when log present */}
      <div
        className={`${stepLogs.length ? 'mt-2 border-t border-stone-200/60 pt-2 dark:border-stone-700/60' : 'mt-2'}`}
      >
        <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
          What this step does
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-stone-600 dark:text-stone-300">
          {info.summary}
        </p>
      </div>

      {/* Tech stack */}
      <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
        Stack
      </p>
      <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-stone-600 dark:text-stone-300">
        {info.stack.map((t) => (
          <li key={t} className="flex gap-1.5">
            <span aria-hidden className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-amber-500" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function ConfidenceBadge({ band, confidence }: { band: 'high' | 'medium' | 'low'; confidence?: number }) {
  const styles = {
    high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
    medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
    low: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  }
  const title = confidence != null ? `Confidence: ${(confidence * 100).toFixed(0)}%` : undefined
  return (
    <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${styles[band]}`} title={title}>
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

const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  caption: 'from caption',
  transcript: 'from transcript',
  ocr: 'from OCR',
  location_tag: 'from location tag',
  multiple: 'from multiple signals',
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
        <ul className="mt-2 space-y-3">
          {places.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-1 text-[13px] text-stone-700 dark:text-stone-300"
            >
              {/* Name row */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-medium">{p.name}</span>
                {p.name_romanized && p.name_romanized !== p.name && (
                  <span className="text-stone-400 dark:text-stone-500">{p.name_romanized}</span>
                )}
                {p.city && (
                  <span className="text-stone-400 dark:text-stone-500">· {p.city}</span>
                )}
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-1">
                <CategoryBadge category={p.category} />
                <ConfidenceBadge band={p.confidence_band} confidence={p.confidence} />
                {p.is_subject && (
                  <span className="rounded bg-rose-50 px-1 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
                    subject
                  </span>
                )}
                {p.vote_count > 0 && (
                  <span className="rounded bg-stone-100 px-1 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    voted {p.vote_count}×
                  </span>
                )}
                {p.signal_source && (
                  <span className="rounded bg-stone-100 px-1 py-0.5 text-[10px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    {SIGNAL_SOURCE_LABELS[p.signal_source] ?? p.signal_source}
                  </span>
                )}
              </div>

              {/* Address */}
              {p.address && (
                <p className="text-[12px] text-stone-500 dark:text-stone-400">{p.address}</p>
              )}

              {/* Geocode disagree */}
              {p.geocode_disagree && (
                <span
                  className="w-fit rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400"
                  title="The two geocoders returned coordinates more than 200 m apart — manual review needed"
                >
                  Coordinates disagree
                </span>
              )}

              {/* Supporting quote */}
              {p.supporting_quote && (
                <p className="text-[12px] italic text-stone-500 dark:text-stone-400">
                  "{p.supporting_quote}"
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Friendly empty-state shown on a `done` job when 0 places were extracted.
 * Surfaces the source content (caption / transcript snippet) so the user can
 * see WHAT the LLM was looking at and why no place was named.
 */
function EmptyExtractionPanel({ preview }: { preview: PostPreview }) {
  const hasLocationTag = preview.location_tag && (preview.location_tag as { name?: string }).name
  return (
    <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
            No places extracted from this post
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-stone-600 dark:text-stone-300">
            The LLM didn&apos;t find any specific named venue or landmark in the source
            text — this usually means the post is about an activity, person, or product
            rather than a place.
          </p>

          {hasLocationTag && (
            <p className="mt-2 text-[12px] text-stone-600 dark:text-stone-300">
              <span className="font-medium text-stone-500 dark:text-stone-400">Location tag from IG:</span>{' '}
              {(preview.location_tag as { name?: string }).name}
            </p>
          )}

          {preview.caption && (
            <details className="mt-2 group">
              <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
                Caption ({preview.caption_truncated ? '500+' : preview.caption.length} chars)
              </summary>
              <p className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-white/70 px-2.5 py-2 text-[12px] leading-relaxed text-stone-700 dark:bg-stone-900/40 dark:text-stone-200">
                {preview.caption}{preview.caption_truncated && '…'}
              </p>
            </details>
          )}

          {preview.transcript && (
            <details className="mt-2 group">
              <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-wide text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
                Transcript ({preview.transcript_truncated ? '800+' : preview.transcript.length} chars)
              </summary>
              <p className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-white/70 px-2.5 py-2 text-[12px] leading-relaxed text-stone-700 dark:bg-stone-900/40 dark:text-stone-200">
                {preview.transcript}{preview.transcript_truncated && '…'}
              </p>
            </details>
          )}

          {!preview.caption && !preview.transcript && (
            <p className="mt-2 text-[12px] italic text-stone-500 dark:text-stone-400">
              No caption or transcript was available.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function LogsViewer({ logs }: { logs: LogLine[] }) {
  const listRef = useRef<HTMLOListElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [isOpen, logs.length])

  return (
    <details
      className="mt-3 rounded-xl border border-stone-200/60 dark:border-stone-800/60"
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
    >
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
  etaNow,
}: {
  job: Job
  reduce: boolean | null
  onRetry: () => Promise<void>
  etaNow: number
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

  const eta = computeEta(job, etaNow)

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
        <StepTimeline job={job} reduce={reduce} etaNow={etaNow} />
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
                : eta.tone === 'slow'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
            }`}
          >
            {eta.label}
          </span>
        )}
      </p>

      {/* Error message with step context */}
      {job.last_error && (
        <p className="mt-2 break-words rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:bg-red-950/30 dark:text-red-400">
          <span className="font-semibold capitalize">{job.step === 'queued' ? 'unknown' : job.step}:</span>{' '}
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

      {/* Places — either the extracted list or the "0 found" empty state */}
      {job.places.length > 0 ? (
        <PlacesList places={job.places} />
      ) : (
        (job.status === 'done' || job.step === 'done') && job.post_preview && (
          <EmptyExtractionPanel preview={job.post_preview} />
        )
      )}

      {/* Logs viewer */}
      <LogsViewer logs={job.logs} />
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Ingest() {
  // Short-circuit: if this build doesn't have VITE_CLERK_PUBLISHABLE_KEY,
  // we have NO way to authenticate against the API — every poll will 401.
  // Render a clear config-issue banner instead of looping forever.
  if (!clerkEnabled) {
    return <ClerkNotConfiguredPage />
  }
  return <IngestImpl />
}

function ClerkNotConfiguredPage() {
  return (
    <div className="korea mx-auto max-w-2xl px-5 py-16">
      <h1
        className="font-serif text-3xl text-stone-900 dark:text-stone-100"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        Ingest
      </h1>
      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-stone-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-stone-200">
        <p className="font-semibold text-red-800 dark:text-red-300">
          Frontend build is missing Clerk configuration
        </p>
        <p className="mt-2 text-[13px] leading-relaxed">
          This build was produced without <code className="font-mono text-[12px]">VITE_CLERK_PUBLISHABLE_KEY</code>,
          so the page can&apos;t sign requests against the API. Every poll would 401.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed">
          <span className="font-semibold">Fix:</span> set
          {' '}<code className="font-mono text-[12px]">VITE_CLERK_PUBLISHABLE_KEY=pk_live_…</code>{' '}
          in the build environment (not just the runtime env — Vite bakes
          variables at build time) and rebuild the frontend
          (<code className="font-mono text-[12px]">cd frontend &amp;&amp; bun run build</code>).
          Then restart the server.
        </p>
      </div>
    </div>
  )
}

function IngestImpl() {
  const getToken = useGetToken()
  const reduce = useReducedMotion()

  // ── Submit notice — rich state for re-extract / shared-data variations ──────
  type SubmitNotice =
    | { kind: 'text'; message: string }
    | { kind: 'reused-done'; jobId: number }
    | { kind: 'shared'; count: number }

  // Form state
  const [url, setUrl] = useState('')
  const [skipVideo, setSkipVideo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitNotice, setSubmitNotice] = useState<SubmitNotice | null>(null)

  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [fetchFailures, setFetchFailures] = useState(0)
  const [apiNotConfigured, setApiNotConfigured] = useState<string | null>(null)

  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  // ── Time ticks ─────────────────────────────────────────────────────────────

  const hasRunningJob = jobs.some((j) => j.status === 'running')
  const etaNow = useNow(1000, hasRunningJob)
  const stalenessNow = useNow(5000, true)

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const doFetchJobs = useCallback(async () => {
    try {
      const data = await listJobs(getTokenRef.current)
      setJobs(data)
      setLastRefreshed(new Date())
      setFetchFailures(0)
      setApiNotConfigured(null)
    } catch (err) {
      if (err instanceof ApiNotConfiguredError) {
        // Sticky banner — this is a server-config issue that won't fix itself.
        setApiNotConfigured(err.message)
        return
      }
      setFetchFailures((n) => n + 1)
    }
  }, [])

  const doFetchStats = useCallback(async () => {
    try {
      const data = await fetchStats(getTokenRef.current)
      setStats(data)
    } catch (err) {
      if (err instanceof ApiNotConfiguredError) {
        setApiNotConfigured(err.message)
      }
      // otherwise hide stats silently — per spec
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

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isInstagramUrl(url) || submitting) return

    setSubmitting(true)
    setSubmitError(null)
    setSubmitNotice(null)

    try {
      const result = await submitUrl(getTokenRef.current, url, { skipVideo })
      setUrl('')

      // Determine what notice to show, if any
      for (const j of result.jobs) {
        if ((j.shared_from_other_user ?? 0) > 0) {
          setSubmitNotice({ kind: 'shared', count: j.shared_from_other_user! })
          setTimeout(() => setSubmitNotice(null), 6000)
          break
        }
        if (j.reused) {
          if (j.status === 'done') {
            setSubmitNotice({ kind: 'reused-done', jobId: j.jobId })
            // no auto-dismiss — user may want to click the button
          } else {
            setSubmitNotice({ kind: 'text', message: 'Already in queue — showing existing results below.' })
            setTimeout(() => setSubmitNotice(null), 5000)
          }
          break
        }
      }

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
  // stalenessNow forces a re-render every 5s so the "X ago" label stays fresh
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void stalenessNow
  const agoLabel = lastRefreshed ? timeAgo(lastRefreshed) : null

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
          <div className="flex items-center gap-4">
            <StatsLine stats={stats} />
            <Link
              to="/korea/places"
              className="text-[12px] text-stone-400 transition hover:text-rose-700 dark:text-stone-500 dark:hover:text-rose-400"
            >
              Browse extracted places →
            </Link>
          </div>
        </div>

        {agoLabel && (
          <p className="mt-3 font-mono text-[11px] text-stone-400 dark:text-stone-500">
            Refreshed {agoLabel}
          </p>
        )}

        {/* API-not-configured banner — sticky, no spinner. Server-side fix needed. */}
        {apiNotConfigured && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <p className="font-semibold">Server config issue</p>
            <p className="mt-0.5 leading-relaxed">{apiNotConfigured}</p>
          </div>
        )}

        {/* Fetch-failure reconnecting banner — transient network glitches only */}
        {!apiNotConfigured && fetchFailures >= 3 && (
          <p role="status" className="mt-2 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-[12px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Reconnecting… polling has failed {fetchFailures} times
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

          <label className="mt-3 inline-flex items-center gap-2 text-[12px] text-stone-600 dark:text-stone-400 cursor-pointer">
            <input
              type="checkbox"
              checked={skipVideo}
              onChange={(e) => setSkipVideo(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-stone-300 text-rose-600 focus:ring-rose-500 dark:border-stone-700"
            />
            <span>Skip video download <span className="text-stone-400">— faster, caption + comments only</span></span>
          </label>

          {/* Submit result notice */}
          {submitNotice && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {submitNotice.kind === 'text' && (
                <p className="text-[12px] text-rose-600 dark:text-rose-400">
                  {submitNotice.message}
                </p>
              )}
              {submitNotice.kind === 'shared' && (
                <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
                  Found shared data from another user — added {submitNotice.count} {submitNotice.count === 1 ? 'place' : 'places'} to your collection.
                </p>
              )}
              {submitNotice.kind === 'reused-done' && (
                <>
                  <p className="text-[12px] text-rose-600 dark:text-rose-400">
                    Already extracted — showing existing results below.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      setSubmitNotice(null)
                      await reextractJob(getTokenRef.current, submitNotice.jobId)
                      void doFetchJobs()
                    }}
                    className="inline-flex min-h-[28px] items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/40"
                  >
                    Re-run extraction
                  </button>
                </>
              )}
            </div>
          )}
        </form>
      </motion.section>

      {/* Jobs list — split into Recent (≤7 days) and Older */}
      {(() => {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
        const recentJobs = jobs.filter((j) => new Date(j.created_at).getTime() >= cutoff)
        const olderJobs = jobs.filter((j) => new Date(j.created_at).getTime() < cutoff)

        const makeJobCard = (job: Job) => (
          <JobCard key={job.id} job={job} reduce={reduce} etaNow={etaNow} onRetry={async () => {
            await retryJob(getTokenRef.current, job.id)
            void doFetchJobs()
          }} />
        )

        if (jobs.length === 0) {
          return (
            <section aria-label="Jobs" className="mt-12">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
                Recent jobs
                <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">·</span>
                auto-refresh
              </p>
              <div className="mt-4">
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
              </div>
            </section>
          )
        }

        return (
          <>
            {recentJobs.length > 0 && (
              <section aria-label="Recent jobs" className="mt-12">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-stone-500 dark:text-stone-500">
                  Recent
                  <span aria-hidden className="mx-2 text-stone-300 dark:text-stone-700">·</span>
                  auto-refresh
                </p>
                <div className="mt-4 space-y-4">
                  {recentJobs.map(makeJobCard)}
                </div>
              </section>
            )}

            {olderJobs.length > 0 && (
              <section aria-label="Older jobs" className="mt-10">
                <p
                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-stone-400 dark:text-stone-600"
                  style={{ fontFamily: "'Cormorant Garamond', serif" }}
                >
                  Older
                  <span aria-hidden className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                  <span className="text-stone-400 dark:text-stone-600 normal-case tracking-normal">{olderJobs.length} more</span>
                </p>
                <div className="mt-4 space-y-4">
                  {olderJobs.map(makeJobCard)}
                </div>
              </section>
            )}

          </>
        )
      })()}

    </div>
  )
}
