import { itemStatusMeta, suggestionBadgeClass } from "../theme"
import type { ItemStatus, SuggestionKind, TripStatus } from "../types"

/** Dot + label chip. One treatment for every status surface in Trips. */
const chipBase =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]"

const tripStatusMeta: Record<TripStatus, { label: string; chip: string; dot: string }> = {
  draft: {
    label: "Draft",
    chip: "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900/60 dark:text-stone-300 dark:border-stone-700",
    dot: "bg-stone-400 dark:bg-stone-500",
  },
  active: {
    label: "Active",
    chip: "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60",
    dot: "bg-emerald-600 dark:bg-emerald-400",
  },
  archived: {
    label: "Archived",
    chip: "bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-900/60 dark:text-stone-400 dark:border-stone-800",
    dot: "bg-stone-300 dark:bg-stone-600",
  },
  completed: {
    label: "Completed",
    chip: "bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-900/60 dark:text-stone-400 dark:border-stone-800",
    dot: "bg-stone-400 dark:bg-stone-600",
  },
}

/** Item status. Renders nothing for `none`, so call sites need no guard. */
export function StatusChip({ status, className = "" }: { status: ItemStatus; className?: string }) {
  const meta = itemStatusMeta[status]
  if (!meta) return null
  return (
    <span className={`${chipBase} ${meta.chip} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  )
}

/** Trip lifecycle status — same chip, trip vocabulary. */
export function TripStatusChip({ status, className = "" }: { status: TripStatus; className?: string }) {
  const meta = tripStatusMeta[status]
  return (
    <span className={`${chipBase} ${meta.chip} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  )
}

const suggestionLabel: Record<SuggestionKind, string> = {
  add: "Add",
  edit: "Edit",
  remove: "Remove",
  reorder: "Reorder",
  warning: "Warning",
  info: "Note",
}

/** Enhancement suggestion kind — added, removed, or neutral. */
export function SuggestionChip({ kind, className = "" }: { kind: SuggestionKind; className?: string }) {
  return <span className={`${chipBase} ${suggestionBadgeClass(kind)} ${className}`}>{suggestionLabel[kind]}</span>
}

/** Provenance chip for AI-authored items — neutral tint, accent dot. */
export function AiChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`${chipBase} border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300 ${className}`}
      title="Added by AI enhancement"
    >
      <span className="h-[3px] w-[3px] rounded-full bg-[color:var(--ta)]" aria-hidden />
      AI
    </span>
  )
}
