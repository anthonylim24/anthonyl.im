import { sx } from '@/styles/merge'
import { ingest } from './Ingest.stylex'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useLatestCallback } from '@/hooks/useLatestCallback'
import { Link } from 'react-router-dom'
import { clerkEnabled, useGetToken } from '@/lib/safeAuth'
import { motion, useReducedMotion } from 'motion/react'
import { Check, ChevronRight, Circle, Download, Layers, Loader2, MapPin, Save, Sparkles, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isInstagramUrl } from './isInstagramUrl'
import { ApiNotConfiguredError, fetchStats, listJobs, reextractJob, retryJob, submitUrl } from './ingestApi'
import type { Job, JobStep, LogLine, PostPreview, Stats } from './ingestApi'
import { JobCardSkeleton } from './skeletons'

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

// Per-stage glyph + short label. Glyphs carry recognition at a glance — far
// more legible than five identical filled dots.
const STEP_GLYPHS: Record<UiStep, LucideIcon> = {
  fetching: Download,
  bundling: Layers,
  extracting: Sparkles,
  geocoding: MapPin,
  saving: Save,
}

const STEP_LABELS: Record<UiStep, string> = {
  fetching: 'Fetch',
  bundling: 'Bundle',
  extracting: 'Extract',
  geocoding: 'Geocode',
  saving: 'Save',
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
    <span {...sx(ingest.s60c3905b)}>
      {parts.join(' · ')}
    </span>
  )
}

function ValidationHint({ value }: { value: string }) {
  if (!value) {
    return (
      <p {...sx(ingest.s5e2dcc92)}>
        Paste an Instagram post or reel URL
      </p>
    )
  }
  if (isInstagramUrl(value)) {
    return (
      <p {...sx(ingest.s45b2f91)}>
        Looks good
      </p>
    )
  }
  return (
    <p {...sx(ingest.sd27c2def)}>
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
  const styles = {
    pending: ingest.statusPending,
    running: ingest.statusRunning,
    done: ingest.statusDone,
    failed: ingest.statusFailed,
    dead: ingest.statusDead,
  } as const

  return (
    <span
      aria-label={`Status: ${labels[status]}`}
      {...sx(ingest.statusPillBase, styles[status])}
    >
      {labels[status]}
    </span>
  )
}

/**
 * Cinematic horizontal pipeline timeline.
 *
 * Each stage is a node — a refined glyph in a circular plate — connected by an
 * SVG hairline. Past nodes settle to a soft amber; the active node breathes
 * with a rose pulse + outward rim glow; the connector approaching the active
 * node carries a directional dashed flow (amber → rose). Errored states swap
 * the active rose treatment for a red XCircle.
 *
 * Implementation notes:
 * - 5 equal grid columns. Each cell is `position: relative` so the connector
 *   can be absolutely positioned to span from the cell center to the next
 *   cell center, keeping geometry stable regardless of label length.
 * - Nodes are buttons with full per-step `aria-label`; tap/click toggles the
 *   popover (also opens on hover / focus). Popover content unchanged.
 * - `prefers-reduced-motion`: flow + rim + breath all freeze; the static
 *   visual state (color + dashed stroke) carries the information without
 *   any motion.
 */
function StepTimeline({ job, reduce, etaNow }: { job: Job; reduce: boolean | null; etaNow: number }) {
  const stepStates = deriveStepStates(job)
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
      {...sx(ingest.s7b6e21f)}
      style={{ gridTemplateColumns: `repeat(${PIPELINE_STEPS.length}, minmax(0, 1fr))` }}
    >
      {PIPELINE_STEPS.map((step, i) => {
        const state = stepStates[step]
        const isLast = i === PIPELINE_STEPS.length - 1
        const nextState = isLast ? null : stepStates[PIPELINE_STEPS[i + 1]]
        const connectorVariant: ConnectorVariant = !nextState
          ? 'none'
          : state === 'past' && nextState === 'current'
            ? 'flowing'
            : state === 'past' && nextState === 'past'
              ? 'done'
              : 'idle'

        const info = STEP_DESCRIPTIONS[step as UiStep]
        const ariaSummary = `${STEP_LABELS[step]}: ${info.summary} Stack: ${info.stack.join('; ')}.`
        const isExpanded = expandedStep === step

        return (
          <div key={step} {...sx(ingest.s3dbb69e2)}>
            {!isLast && (
              <PipelineConnector variant={connectorVariant} reduce={!!reduce} />
            )}

            <div {...sx(ingest.s601d5945, 'group')}>
              <button
                type="button"
                aria-label={ariaSummary}
                onClick={() => setExpandedStep(isExpanded ? null : step as UiStep)}
                {...sx(ingest.s925ca98e)}
              >
                <PipelineNode step={step} state={state} reduce={!!reduce} />
                <span
                  {...sx(
                    state === 'past'
                      ? ingest.stepLabelPast
                      : state === 'current'
                        ? ingest.stepLabelCurrent
                        : state === 'errored'
                          ? ingest.stepLabelErrored
                          : ingest.stepLabelFuture,
                  )}
                >
                  {STEP_LABELS[step]}
                </span>
              </button>

              <div
                role="tooltip"
                {...sx(
                  ingest.stepPopover,
                  isExpanded ? ingest.stepPopoverOpen : ingest.stepPopoverClosed,
                )}
              >
                <StepPopoverContent step={step as UiStep} state={state} info={info} job={job} etaNow={etaNow} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

type ConnectorVariant = 'none' | 'idle' | 'flowing' | 'done'

/**
 * SVG connector drawn from the right edge of one node toward the left edge of
 * the next. `flowing` variant runs a dashed stroke + animated dashoffset to
 * convey direction (toward the active node). `done` is a steady amber line.
 * `idle` is the neutral stone hairline.
 *
 * The plate is 36 px tall (`h-9`); the connector sits at y ≈ 17 to thread
 * the visual midline of the plate.
 */
function PipelineConnector({ variant, reduce }: { variant: ConnectorVariant; reduce: boolean }) {
  if (variant === 'none') return null

  const stroke =
    variant === 'flowing'
      ? 'url(#ig-pipeline-flow-grad)'
      : variant === 'done'
        ? 'rgba(180,83,9,0.55)'
        : 'rgba(168,162,158,0.55)'

  return (
    <span
      aria-hidden
      {...sx(ingest.s54507fff)}
      style={{ left: '50%', right: '-50%' }}
    >
      <svg
        viewBox="0 0 100 2"
        preserveAspectRatio="none"
        {...sx(ingest.s67a428ff)}
      >
        <defs>
          <linearGradient id="ig-pipeline-flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#d97706" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="1" />
          </linearGradient>
        </defs>
        <line
          x1="6"
          y1="1"
          x2="94"
          y2="1"
          stroke={stroke}
          strokeWidth={variant === 'flowing' ? 1.4 : 1}
          strokeLinecap="round"
          strokeDasharray={variant === 'flowing' ? '4 3' : undefined}
          style={
            variant === 'flowing' && !reduce
              ? { animation: 'ig-pipeline-flow 1.1s linear infinite' }
              : undefined
          }
        />
      </svg>
    </span>
  )
}

/**
 * Circular glyph plate for a single pipeline stage. Renders four visual
 * states; the active state layers a breath-pulsing rose plate behind an
 * outward rim glow.
 */
function PipelineNode({
  step,
  state,
  reduce,
}: {
  step: UiStep
  state: StepState
  reduce: boolean
}) {
  const Glyph = STEP_GLYPHS[step]

  if (state === 'errored') {
    return (
      <span {...sx(ingest.sb5442fec)}>
        <XCircle {...sx(ingest.sff280fff)} aria-hidden strokeWidth={1.5} />
      </span>
    )
  }

  if (state === 'current') {
    return (
      <span {...sx(ingest.sb5442fec)}>
        <span
          aria-hidden
          {...sx(ingest.pipelineRim, reduce ? undefined : 'ig-pipeline-rim')}
          style={
            reduce
              ? undefined
              : { animation: 'ig-pipeline-rim 2.2s cubic-bezier(0.16, 1, 0.3, 1) infinite' }
          }
        />
        <span
          aria-hidden
          {...sx(ingest.pipelineBreath, reduce ? undefined : 'ig-pipeline-breath')}
          style={{
            background: 'radial-gradient(circle at 30% 30%, #fb7185 0%, #f43f5e 55%, #c2410c 100%)',
            boxShadow: '0 0 0 1px rgba(244,63,94,0.35), 0 6px 14px -4px rgba(244,63,94,0.45)',
            animation: reduce
              ? undefined
              : 'ig-pipeline-breath 2.4s cubic-bezier(0.16, 1, 0.3, 1) infinite',
          }}
        />
        <Glyph
          {...sx(ingest.s3c9c4fb0)}
          aria-hidden
          strokeWidth={2}
        />
      </span>
    )
  }

  if (state === 'past') {
    return (
      <span
        {...sx(ingest.s316e3563)}
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(252,211,77,0.55) 0%, rgba(217,119,6,0.25) 60%, rgba(120,113,108,0.18) 100%)',
          boxShadow: '0 0 0 1px rgba(180,140,80,0.35)',
        }}
      >
        <Check
          {...sx(ingest.s2f8a34ed)}
          aria-hidden
          strokeWidth={2.4}
        />
      </span>
    )
  }

  return (
    <span {...sx(ingest.s65702fd3)}>
      <Glyph {...sx(ingest.sc9b47330)} aria-hidden strokeWidth={1.5} />
    </span>
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

  const stateStyle =
    state === 'current' ? ingest.stateLabelCurrent :
    state === 'past' ? ingest.stateLabelPast :
    state === 'errored' ? ingest.stateLabelErrored :
    ingest.stateLabelFuture

  // Compute per-log relative offset from the first line of this step — useful
  // for seeing where time is being spent within a stage.
  const stepStartMs = stepLogs.length ? new Date(stepLogs[0].created_at).getTime() : 0

  return (
    <>
      {/* Live status header (per job) */}
      <div {...sx(ingest.sbbe27b4f)}>
        <span {...sx(stateStyle)}>
          {stateLabel}
        </span>
        {timingLabel && (
          <span {...sx(ingest.s7d1c8b7c)}>
            {timingLabel}
          </span>
        )}
      </div>

      {/* Full per-step log breakdown — auto-scrolls when many lines */}
      {stepLogs.length > 0 && (
        <ol
          {...sx(ingest.s4845fba1)}
          aria-label={`Activity log for ${stateLabel.toLowerCase()} step`}
        >
          {stepLogs.map((l, idx) => {
            const offsetSec = idx === 0
              ? 0
              : Math.max(0, (new Date(l.created_at).getTime() - stepStartMs) / 1000)
            const msgStyle =
              l.level === 'error' ? ingest.logMsgError :
              l.level === 'warn' ? ingest.logMsgWarn :
              ingest.logMsgInfo
            return (
              <li key={l.id} {...sx(ingest.s66529f26)}>
                <span {...sx(ingest.s8d0bd648)}>
                  {idx === 0 ? 'start' : `+${formatDuration(offsetSec)}`}
                </span>
                <span {...sx(msgStyle)}>{l.message}</span>
              </li>
            )
          })}
        </ol>
      )}

      {state === 'current' && stepLogs.length === 0 && (
        <p {...sx(ingest.s21c6c9b2)}>
          Starting…
        </p>
      )}

      {/* Static "what this step does in general" — divider only when log present */}
      <div {...sx(stepLogs.length ? ingest.stepInfoDivider : ingest.stepInfoPlain)}>
        <p {...sx(ingest.sbe90b7b4)}>
          What this step does
        </p>
        <p {...sx(ingest.s56c52d31)}>
          {info.summary}
        </p>
      </div>

      {/* Tech stack */}
      <p {...sx(ingest.sddff2b20)}>
        Stack
      </p>
      <ul {...sx(ingest.s41be442a)}>
        {info.stack.map((t) => (
          <li key={t} {...sx(ingest.sb2ddf91a)}>
            <span aria-hidden {...sx(ingest.s8c22b5ab)} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function ConfidenceBadge({ band, confidence }: { band: 'high' | 'medium' | 'low'; confidence?: number }) {
  const styles = {
    high: ingest.confHigh,
    medium: ingest.confMedium,
    low: ingest.confLow,
  } as const
  const title = confidence != null ? `Confidence: ${(confidence * 100).toFixed(0)}%` : undefined
  return (
    <span {...sx(styles[band])} title={title}>
      {band}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span {...sx(ingest.s619ce5a0)}>
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

function PlacesList({
  places,
  emergent,
  reduce,
}: {
  places: Job['places']
  /** When true, auto-expand and animate each card in with a soft drop-in.
   *  The first card briefly outlines in rose to draw the eye. */
  emergent: boolean
  reduce: boolean | null
}) {
  const [expanded, setExpanded] = useState(emergent)

  // If the job transitions into "just completed" while we're already mounted
  // (the live polling case), auto-expand to reveal the result without a click.
  useEffect(() => {
    if (emergent) setExpanded(true)
  }, [emergent])

  if (places.length === 0) return null

  return (
    <div {...sx(ingest.sd28b0f1b)}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        {...sx(ingest.s957a7ae7)}
        aria-expanded={expanded}
      >
        <ChevronRight
          aria-hidden
          {...sx(ingest.chevron, expanded ? ingest.chevronOpen : undefined)}
        />
        {places.length} {places.length === 1 ? 'place' : 'places'} extracted
      </button>

      {expanded && (
        <ul {...sx(ingest.sfdf42904)}>
          {places.map((p, idx) => (
            <motion.li
              key={p.id}
              initial={emergent && !reduce ? { opacity: 0, y: 6, scale: 0.96 } : false}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.36,
                ease: [0.16, 1, 0.3, 1],
                delay: emergent && !reduce ? Math.min(idx, 8) * 0.08 : 0,
              }}
              {...sx(
                ingest.placeRow,
                emergent && idx === 0 && !reduce ? ingest.placeRowEmerge : undefined,
                emergent && idx === 0 && !reduce ? 'ig-place-emerge-ring' : undefined,
              )}
              style={
                emergent && idx === 0 && !reduce
                  ? { animation: 'ig-place-emerge-ring 2.6s ease-out 1.2s forwards' }
                  : undefined
              }
            >
              {/* Name row */}
              <div {...sx(ingest.se28e8787)}>
                <span {...sx(ingest.s129e46b3)}>{p.name}</span>
                {p.name_romanized && p.name_romanized !== p.name && (
                  <span {...sx(ingest.s5e96a87d)}>{p.name_romanized}</span>
                )}
                {p.city && (
                  <span {...sx(ingest.s5e96a87d)}>· {p.city}</span>
                )}
              </div>

              {/* Badges row */}
              <div {...sx(ingest.s1fa2d8e5)}>
                <CategoryBadge category={p.category} />
                <ConfidenceBadge band={p.confidence_band} confidence={p.confidence} />
                {p.is_subject && (
                  <span {...sx(ingest.scdb07eaf)}>
                    subject
                  </span>
                )}
                {p.vote_count > 0 && (
                  <span {...sx(ingest.s619ce5a0)}>
                    voted {p.vote_count}×
                  </span>
                )}
                {p.signal_source && (
                  <span {...sx(ingest.s619ce5a0)}>
                    {SIGNAL_SOURCE_LABELS[p.signal_source] ?? p.signal_source}
                  </span>
                )}
              </div>

              {/* Address */}
              {p.address && (
                <p {...sx(ingest.se5cdcc4)}>{p.address}</p>
              )}

              {/* Geocode disagree */}
              {p.geocode_disagree && (
                <span
                  {...sx(ingest.s9a71eef)}
                  title="The two geocoders returned coordinates more than 200 m apart — manual review needed"
                >
                  Coordinates disagree
                </span>
              )}

              {/* Supporting quote */}
              {p.supporting_quote && (
                <p {...sx(ingest.s8d4ad146)}>
                  "{p.supporting_quote}"
                </p>
              )}
            </motion.li>
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
    <div {...sx(ingest.s383450e8)}>
      <div {...sx(ingest.se99caec9)}>
        <Circle {...sx(ingest.s3e844809)} aria-hidden />
        <div {...sx(ingest.se30fd43e)}>
          <p {...sx(ingest.sdc6c05d2)}>
            No places extracted from this post
          </p>
          <p {...sx(ingest.s1a9a112b)}>
            The LLM didn&apos;t find any specific named venue or landmark in the source
            text — this usually means the post is about an activity, person, or product
            rather than a place.
          </p>

          {hasLocationTag && (
            <p {...sx(ingest.s7fb1db58)}>
              <span {...sx(ingest.s8e209a8a)}>Location tag from IG:</span>{' '}
              {(preview.location_tag as { name?: string }).name}
            </p>
          )}

          {preview.caption && (
            <details {...sx(ingest.s64ff6eb, 'group')}>
              <summary {...sx(ingest.s1512038a)}>
                Caption ({preview.caption.length} chars)
              </summary>
              <p {...sx(ingest.s8131c145)}>
                {preview.caption}{preview.caption_truncated && '…'}
              </p>
            </details>
          )}

          {preview.transcript && (
            <details {...sx(ingest.s64ff6eb, 'group')}>
              <summary {...sx(ingest.s1512038a)}>
                Transcript ({preview.transcript_truncated ? '5000+' : preview.transcript.length} chars)
              </summary>
              <p {...sx(ingest.s8131c145)}>
                {preview.transcript}{preview.transcript_truncated && '…'}
              </p>
            </details>
          )}

          {!preview.caption && !preview.transcript && (
            <p {...sx(ingest.s21c6c9b2)}>
              No caption or transcript was available.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function LogsViewer({ logs, defaultOpen = false }: { logs: LogLine[]; defaultOpen?: boolean }) {
  const listRef = useRef<HTMLOListElement | null>(null)
  // Uncontrolled-ish: defaultOpen seeds the initial state; subsequent user
  // toggles take over and persist. Done that way (rather than `open={...}`
  // controlled) so a freshly-submitted job opens immediately, but the user
  // can still collapse it without us re-opening on the next poll.
  const [isOpen, setIsOpen] = useState(defaultOpen)

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [isOpen, logs.length])

  return (
    <details
      open={isOpen}
      {...sx(ingest.se4f7be31)}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
    >
      <summary {...sx(ingest.sb4069d98)}>
        Logs ({logs.length})
      </summary>
      <ol
        ref={listRef}
        {...sx(ingest.sd788321b)}
        aria-live="polite"
        aria-label="Job log lines"
      >
        {logs.map((l) => (
          <li key={l.id} {...sx(ingest.s9109cdbf)}>
            <span {...sx(ingest.sa8e02460)}>{formatLogTime(l.created_at)}</span>
            <span
              {...sx(
                l.level === 'error'
                  ? ingest.logStepError
                  : l.level === 'warn'
                    ? ingest.logStepWarn
                    : ingest.logStepInfo,
              )}
            >
              {l.step}
            </span>
            <span {...sx(ingest.sf5facc2b)}>{l.message}</span>
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
  onReextract,
  etaNow,
}: {
  job: Job
  reduce: boolean | null
  onRetry: () => Promise<void>
  onReextract: () => Promise<void>
  etaNow: number
}) {
  const shortUrl = job.url.replace(/^https?:\/\/(www\.)?instagram\.com/, 'instagram.com')

  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [reextracting, setReextracting] = useState(false)
  const [reextractError, setReextractError] = useState<string | null>(null)

  // Emergence — trigger the staggered place-card reveal only when this card
  // *witnesses* the job transition from in-flight → done. Already-completed
  // jobs on first mount stay calm; emergence is about the moment of arrival.
  const wasCompletedRef = useRef(job.status === 'done' || job.step === 'done')
  const [emergent, setEmergent] = useState(false)
  useEffect(() => {
    const isDone = job.status === 'done' || job.step === 'done'
    if (isDone && !wasCompletedRef.current) {
      wasCompletedRef.current = true
      setEmergent(true)
      // Total visible runway: 8 cards × 80ms + 360ms reveal + 2.6s ring ≈ 3.7s.
      const t = setTimeout(() => setEmergent(false), 4000)
      return () => clearTimeout(t)
    }
  }, [job.status, job.step])

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

  const handleReextract = async () => {
    setReextracting(true)
    setReextractError(null)
    try {
      await onReextract()
    } catch (err) {
      setReextractError(err instanceof Error ? err.message : 're-extract failed')
    } finally {
      setReextracting(false)
    }
  }

  const eta = computeEta(job, etaNow)

  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      {...sx(ingest.s28353d49)}
    >
      {/* Running sweep animation */}
      {job.status === 'running' && (
        <div
          aria-hidden
          {...sx(ingest.s17bea155)}
        >
          <div
            {...sx(ingest.sweepBar, reduce ? undefined : 'animate-ig-sweep')}
          />
        </div>
      )}

      {/* Header row */}
      <div {...sx(ingest.s71b5dc26)}>
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          {...sx(ingest.se164d5a4)}
          title={job.url}
        >
          {shortUrl} ↗
        </a>
        <StatusPill status={job.status} />
      </div>

      {/* Step timeline */}
      <div {...sx(ingest.s33458e)}>
        <StepTimeline job={job} reduce={reduce} etaNow={etaNow} />
      </div>

      {/* Meta row */}
      <p {...sx(ingest.s91675395)}>
        Created {formatTimestamp(job.created_at)}
        <span aria-hidden {...sx(ingest.sc0b07296)}>·</span>
        Updated {formatTimestamp(job.updated_at)}
        <span aria-hidden {...sx(ingest.sc0b07296)}>·</span>
        {job.attempts} {job.attempts === 1 ? 'attempt' : 'attempts'}
        {eta && (
          <span
            {...sx(
              eta.tone === 'done'
                ? ingest.etaDone
                : eta.tone === 'slow'
                  ? ingest.etaSlow
                  : ingest.etaDefault,
            )}
          >
            {eta.label}
          </span>
        )}
      </p>

      {/* Error message with step context */}
      {job.last_error && (
        <p {...sx(ingest.s72e92e25)}>
          <span {...sx(ingest.sc5c56bbb)}>{job.step === 'queued' ? 'unknown' : job.step}:</span>{' '}
          {job.last_error}
        </p>
      )}

      {/* Retry button for dead/failed jobs */}
      {(job.status === 'dead' || job.status === 'failed') && (
        <div {...sx(ingest.sb3307e52)}>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            {...sx(ingest.s69cd3a8a)}
            aria-busy={retrying}
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
          {retryError && (
            <span {...sx(ingest.s70ee951d)}>{retryError}</span>
          )}
        </div>
      )}

      {/* Re-extract button for done jobs — works for both fresh runs and
          places copied from another user (cross-user share). Triggers a
          full pipeline re-run that wipes the user's per-job places + logs. */}
      {(job.status === 'done' || job.step === 'done') && (
        <div {...sx(ingest.sb3307e52)}>
          <button
            type="button"
            onClick={handleReextract}
            disabled={reextracting}
            {...sx(ingest.sab856c4d)}
            aria-busy={reextracting}
          >
            {reextracting ? 'Re-extracting…' : 'Re-extract'}
          </button>
          {reextractError && (
            <span {...sx(ingest.s70ee951d)}>{reextractError}</span>
          )}
        </div>
      )}

      {/* Places — either the extracted list or the "0 found" empty state */}
      {job.places.length > 0 ? (
        <PlacesList places={job.places} emergent={emergent} reduce={reduce} />
      ) : (
        (job.status === 'done' || job.step === 'done') && job.post_preview && (
          <EmptyExtractionPanel preview={job.post_preview} />
        )
      )}

      {/* Logs viewer */}
      <LogsViewer logs={job.logs} defaultOpen={job.status === 'pending' || job.status === 'running'} />
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
    <div {...sx(ingest.s102510f7)}>
      <h1
        {...sx(ingest.s37f7dc96)}
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        Ingest
      </h1>
      <div {...sx(ingest.sb5cebbd6)}>
        <p {...sx(ingest.sb09a9ba6)}>
          Frontend build is missing Clerk configuration
        </p>
        <p {...sx(ingest.s3f2691cc)}>
          This build was produced without <code {...sx(ingest.sd81d42ba)}>VITE_CLERK_PUBLISHABLE_KEY</code>,
          so the page can&apos;t sign requests against the API. Every poll would 401.
        </p>
        <p {...sx(ingest.s6876764d)}>
          <span {...sx(ingest.s62c182b1)}>Fix:</span> set
          {' '}<code {...sx(ingest.sd81d42ba)}>VITE_CLERK_PUBLISHABLE_KEY=pk_live_…</code>{' '}
          in the build environment (not just the runtime env — Vite bakes
          variables at build time) and rebuild the frontend
          (<code {...sx(ingest.sd81d42ba)}>cd frontend &amp;&amp; bun run build</code>).
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
    | { kind: 'shared'; count: number; jobId: number }

  // Form state
  const [url, setUrl] = useState('')
  const [skipVideo, setSkipVideo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitNotice, setSubmitNotice] = useState<SubmitNotice | null>(null)

  // Data state
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoaded, setJobsLoaded] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [fetchFailures, setFetchFailures] = useState(0)
  const [apiNotConfigured, setApiNotConfigured] = useState<string | null>(null)

  const readToken = useLatestCallback(getToken)
  const [isRefreshing, startTransition] = useTransition()
  const [refreshInFlight, setRefreshInFlight] = useState(0)
  const jobsSeq = useRef(0)
  const statsSeq = useRef(0)

  // ── Time ticks ─────────────────────────────────────────────────────────────

  const hasRunningJob = jobs.some((j) => j.status === 'running')
  const etaNow = useNow(1000, hasRunningJob)
  const stalenessNow = useNow(5000, true)

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const doFetchJobs = useCallback(async () => {
    const seq = ++jobsSeq.current
    setRefreshInFlight((n) => n + 1)
    try {
      const data = await listJobs(readToken)
      if (seq !== jobsSeq.current) return
      startTransition(() => {
        setJobs(data)
        setJobsLoaded(true)
      })
      setLastRefreshed(new Date())
      setFetchFailures(0)
      setApiNotConfigured(null)
    } catch (err) {
      if (seq !== jobsSeq.current) return
      setJobsLoaded(true)
      if (err instanceof ApiNotConfiguredError) {
        // Sticky banner — this is a server-config issue that won't fix itself.
        setApiNotConfigured(err.message)
        return
      }
      setFetchFailures((n) => n + 1)
    } finally {
      setRefreshInFlight((n) => n - 1)
    }
  }, [readToken, startTransition])

  const doFetchStats = useCallback(async () => {
    const seq = ++statsSeq.current
    setRefreshInFlight((n) => n + 1)
    try {
      const data = await fetchStats(readToken)
      if (seq !== statsSeq.current) return
      startTransition(() => setStats(data))
    } catch (err) {
      if (seq !== statsSeq.current) return
      if (err instanceof ApiNotConfiguredError) {
        setApiNotConfigured(err.message)
      }
      // otherwise hide stats silently — per spec
    } finally {
      setRefreshInFlight((n) => n - 1)
    }
  }, [readToken, startTransition])

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
      const result = await submitUrl(readToken, url, { skipVideo })
      setUrl('')

      // Determine what notice to show, if any
      for (const j of result.jobs) {
        if ((j.shared_from_other_user ?? 0) > 0) {
          setSubmitNotice({ kind: 'shared', count: j.shared_from_other_user!, jobId: j.jobId })
          // no auto-dismiss — the inline "Re-extract" button needs to stay reachable
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
    <div {...sx(ingest.sc0a5fd9d)} aria-busy={submitting || isRefreshing || refreshInFlight > 0}>
      {/* Page header — no entry animation: motion-12 + react-19 can stall
          opacity-0 mounts under tab-restore / fast-paint conditions, and a
          blank header with the rest of the page hidden behind it is worse
          than no animation. Per-card animations below are fine since one
          stalled card is unnoticeable. */}
      <motion.header
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div {...sx(ingest.s9a3eba28)}>
          <div>
            <p {...sx(ingest.s3ac16245)}>
              <span {...sx(ingest.s8cb1089a)}>IG</span>
              <span aria-hidden {...sx(ingest.s887d0ab)} />
              Place extractor
            </p>
            <h1
              {...sx(ingest.sc2eed480)}
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Ingest
            </h1>
            <p {...sx(ingest.sc3862c91)}>
              Submit an Instagram post URL and watch the worker extract places in real time.
            </p>
          </div>
          <div {...sx(ingest.s86ff3e6)}>
            <StatsLine stats={stats} />
            <Link
              to="/korea/places"
              {...sx(ingest.sa06248c6)}
            >
              Browse extracted places →
            </Link>
          </div>
        </div>

        {agoLabel && (
          <p {...sx(ingest.s91675395)}>
            Refreshed {agoLabel}
          </p>
        )}

        {/* API-not-configured banner — sticky, no spinner. Server-side fix needed. */}
        {apiNotConfigured && (
          <div
            role="alert"
            {...sx(ingest.sca78bd76)}
          >
            <p {...sx(ingest.s62c182b1)}>Server config issue</p>
            <p {...sx(ingest.s15d69e19)}>{apiNotConfigured}</p>
          </div>
        )}

        {/* Fetch-failure reconnecting banner — transient network glitches only */}
        {!apiNotConfigured && fetchFailures >= 3 && (
          <p role="status" {...sx(ingest.sf8d576c5)}>
            <Loader2 {...sx(ingest.s30736863, 'animate-spin')} aria-hidden />
            Reconnecting… polling has failed {fetchFailures} times
          </p>
        )}
      </motion.header>

      {/* Hairline */}
      <div {...sx(ingest.sa377ca47)} aria-hidden />

      {/* Submission form */}
      <motion.section
        aria-label="Submit new URL"
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.05 }}
        {...sx(ingest.s334592)}
      >
        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="ig-url"
            {...sx(ingest.s720eeac6)}
          >
            Instagram URL
          </label>
          <div {...sx(ingest.s8b950f29)}>
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
              {...sx(
                ingest.urlInputBase,
                url && !isInstagramUrl(url) ? ingest.urlInputInvalid : ingest.urlInputValid,
              )}
              aria-describedby="ig-url-hint"
              aria-invalid={url ? !isInstagramUrl(url) : undefined}
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!canSubmit}
              aria-busy={submitting}
              {...sx(ingest.se37e4925)}
            >
              {submitting ? (
                <>
                  <Loader2 {...sx(ingest.sd6e31421, 'animate-spin')} aria-hidden />
                  <span>Submitting</span>
                </>
              ) : (
                'Submit'
              )}
            </button>
          </div>

          <div id="ig-url-hint">
            {submitError ? (
              <p {...sx(ingest.sbaf3bbab)}>{submitError}</p>
            ) : (
              <ValidationHint value={url} />
            )}
          </div>

          <label {...sx(ingest.s5b3b4528)}>
            <input
              type="checkbox"
              checked={skipVideo}
              onChange={(e) => setSkipVideo(e.target.checked)}
              {...sx(ingest.sc985d42d)}
            />
            <span>
              Skip video download
              <span {...sx(ingest.s5e96a87d)}> — faster, caption + comments only</span>
            </span>
          </label>

          {/* Submit result notice */}
          {submitNotice && (
            <div {...sx(ingest.sfcabccd8)}>
              {submitNotice.kind === 'text' && (
                <p {...sx(ingest.sbe9cad21)}>
                  {submitNotice.message}
                </p>
              )}
              {submitNotice.kind === 'shared' && (
                <>
                  <p {...sx(ingest.se4d80143)}>
                    Found shared data from another user — added {submitNotice.count} {submitNotice.count === 1 ? 'place' : 'places'} to your collection.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      setSubmitNotice(null)
                      await reextractJob(readToken, submitNotice.jobId)
                      void doFetchJobs()
                    }}
                    {...sx(ingest.s9f3aba83)}
                  >
                    Re-extract anyway
                  </button>
                </>
              )}
              {submitNotice.kind === 'reused-done' && (
                <>
                  <p {...sx(ingest.sbe9cad21)}>
                    Already extracted — showing existing results below.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      setSubmitNotice(null)
                      await reextractJob(readToken, submitNotice.jobId)
                      void doFetchJobs()
                    }}
                    {...sx(ingest.s803c2c94)}
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
          <JobCard
            key={job.id}
            job={job}
            reduce={reduce}
            etaNow={etaNow}
            onRetry={async () => {
              await retryJob(readToken, job.id)
              void doFetchJobs()
            }}
            onReextract={async () => {
              await reextractJob(readToken, job.id)
              void doFetchJobs()
            }}
          />
        )

        // Before the first fetch resolves, show skeleton cards instead of
        // the "no jobs yet" empty state — otherwise a fresh page render
        // briefly flashes the empty-state banner before real data arrives.
        if (!jobsLoaded && jobs.length === 0) {
          return (
            <section aria-label="Jobs" {...sx(ingest.s6356c07)}>
              <p {...sx(ingest.s84bb96bf)}>
                Recent
                <span aria-hidden {...sx(ingest.s4c78f04e)}>·</span>
                loading
              </p>
              <div {...sx(ingest.s27bd8e87)} aria-busy="true">
                {Array.from({ length: 3 }).map((_, i) => <JobCardSkeleton key={i} />)}
              </div>
            </section>
          )
        }

        if (jobs.length === 0) {
          return (
            <section aria-label="Jobs" {...sx(ingest.s6356c07)}>
              <p {...sx(ingest.s84bb96bf)}>
                Recent
                <span aria-hidden {...sx(ingest.s4c78f04e)}>·</span>
                auto-refresh
              </p>
              <div {...sx(ingest.s33458e)}>
                <motion.div
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  {...sx(ingest.s71e7957)}
                >
                  <p {...sx(ingest.sa05ecb46)}>
                    No ingested links yet.
                  </p>
                  <p {...sx(ingest.sc42b4b05)}>
                    Paste an Instagram reel or post URL above to begin.
                  </p>
                </motion.div>
              </div>
            </section>
          )
        }

        return (
          <>
            {recentJobs.length > 0 && (
              <section aria-label="Recent jobs" {...sx(ingest.s6356c07)}>
                <p {...sx(ingest.s84bb96bf)}>
                  Recent
                  <span aria-hidden {...sx(ingest.s4c78f04e)}>·</span>
                  auto-refresh
                </p>
                <div {...sx(ingest.s27bd8e87)}>
                  {recentJobs.map(makeJobCard)}
                </div>
              </section>
            )}

            {olderJobs.length > 0 && (
              <section aria-label="Older jobs" {...sx(ingest.s6356c05)}>
                <p {...sx(ingest.s3a8a013f)}>
                  Older
                  <span aria-hidden {...sx(ingest.s4c78f04e)}>·</span>
                  <span {...sx(ingest.s6021228b)}>
                    {olderJobs.length} more
                  </span>
                </p>
                <div {...sx(ingest.s27bd8e87)}>
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
