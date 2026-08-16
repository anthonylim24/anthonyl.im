import { useReducedMotion } from "motion/react"
import { Check, Circle, Loader2, X } from "lucide-react"
import { mutedInkClass, softPanelClass, spinnerClass, wrapAnywhereClass } from "../ui"
import type { AgentPhase, ToolChip } from "./types"

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}.0s`
}

/** Pixel-grid loader with elapsed time. Real phases only, no invented reasoning. */
export function LoadingState({
  label,
  elapsed = 0,
  compact = false,
}: {
  label: string
  elapsed?: number
  compact?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-3 ${compact ? "" : "rounded-2xl border border-stone-200/80 bg-[var(--trips-surface)] px-4 py-3 dark:border-stone-800"}`}
    >
      <div className="trip-pixel-loader" aria-hidden data-static={reduce ? "true" : undefined}>
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>{label}</p>
        <p className={`font-mono-trips text-[11px] tabular-nums ${mutedInkClass}`}>{formatElapsed(elapsed)}</p>
      </div>
    </div>
  )
}

export function ThinkingTrace({
  phases,
  title = "Working",
}: {
  phases: AgentPhase[]
  title?: string
}) {
  const running = phases.find((p) => p.status === "running")
  return (
    <details className={`group ${softPanelClass}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</span>
        <span className={`text-xs ${mutedInkClass}`}>
          {running ? running.label : `${phases.filter((p) => p.status === "complete").length} of ${phases.length}`}
        </span>
      </summary>
      <ol className="space-y-1.5 border-t border-stone-200/80 px-4 py-3 dark:border-stone-800">
        {phases.map((phase) => (
          <li key={phase.id} className="flex items-start gap-2.5">
            <PhaseMark status={phase.status} />
            <div className="min-w-0">
              <p className="text-sm text-stone-800 dark:text-stone-200">{phase.label}</p>
              {phase.detail && <p className={`text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>{phase.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </details>
  )
}

function PhaseMark({ status }: { status: AgentPhase["status"] }) {
  if (status === "complete") {
    return <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" strokeWidth={2} aria-hidden />
  }
  if (status === "failed") {
    return <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" strokeWidth={2} aria-hidden />
  }
  if (status === "running") {
    return <Loader2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--ta)] ${spinnerClass}`} aria-hidden />
  }
  return <Circle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${mutedInkClass}`} strokeWidth={1.5} aria-hidden />
}

export function TaskRows({ tasks }: { tasks: AgentPhase[] }) {
  return (
    <ul className="space-y-1" aria-label="Agent tasks">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-1.5"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <PhaseMark status={task.status} />
            <span className={`text-sm text-stone-800 dark:text-stone-200 ${wrapAnywhereClass}`}>{task.label}</span>
          </span>
          {task.detail && (
            <span className={`shrink-0 font-mono-trips text-[11px] tabular-nums ${mutedInkClass}`}>{task.detail}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ToolChips({ chips }: { chips: ToolChip[] }) {
  if (chips.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tool calls">
      {chips.map((chip) => (
        <li
          key={chip.id}
          className={`rounded-md border px-2 py-1 font-mono-trips text-[11px] ${
            chip.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100"
              : chip.tone === "accent"
                ? "border-[color:var(--ta-ring)] bg-[color:var(--ta-soft)] text-[color:var(--ta)]"
                : "border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
          }`}
        >
          {chip.label}
        </li>
      ))}
    </ul>
  )
}
