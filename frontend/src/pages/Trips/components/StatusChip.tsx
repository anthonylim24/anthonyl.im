import { itemStatusMeta, suggestionBadgeClass } from "../theme"
import { typeStampClass } from "../ui"
import type { ItemStatus, SuggestionKind, TripStatus } from "../types"

/** Mark + label chip. One treatment for every status surface in Trips. */
const chipBase = `inline-flex shrink-0 items-center gap-1.5 rounded-[length:var(--trips-radius)] border px-2 py-0.5 ${typeStampClass}`

type StatusMarkKind = "filled" | "open" | "rotated" | "muted"

const itemMark: Record<Exclude<ItemStatus, "none">, StatusMarkKind> = {
  booked: "filled",
  optional: "open",
  needs_review: "rotated",
  completed: "muted",
}

const tripStatusMeta: Record<TripStatus, { label: string; chip: string; mark: StatusMarkKind }> = {
  draft: {
    label: "Draft",
    chip: "border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] text-[color:var(--trips-ink-secondary)]",
    mark: "open",
  },
  active: {
    label: "Active",
    chip: "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-900/60",
    mark: "filled",
  },
  archived: {
    label: "Archived",
    chip: "border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] text-[color:var(--trips-ink-tertiary)]",
    mark: "muted",
  },
  completed: {
    label: "Completed",
    chip: "border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] text-[color:var(--trips-ink-tertiary)]",
    mark: "muted",
  },
}

/** Geometric stamp — CSS boxes, not glyphs. Color comes from the chip text. */
function StatusMark({ kind }: { kind: StatusMarkKind }) {
  if (kind === "open") {
    return <span className="inline-block h-2 w-2 shrink-0 border border-current bg-transparent" aria-hidden />
  }
  if (kind === "rotated") {
    return (
      <span className="inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center" aria-hidden>
        <span className="block h-1.5 w-1.5 rotate-45 bg-current" />
      </span>
    )
  }
  if (kind === "muted") {
    return <span className="inline-block h-2 w-2 shrink-0 bg-current opacity-45" aria-hidden />
  }
  return <span className="inline-block h-2 w-2 shrink-0 bg-current" aria-hidden />
}

/** Item status. Renders nothing for `none`, so call sites need no guard. */
export function StatusChip({ status, className = "" }: { status: ItemStatus; className?: string }) {
  const meta = itemStatusMeta[status]
  if (!meta || status === "none") return null
  return (
    <span className={`${chipBase} ${meta.chip} ${className}`}>
      <StatusMark kind={itemMark[status]} />
      {meta.label}
    </span>
  )
}

/** Trip lifecycle status — same chip, trip vocabulary. */
export function TripStatusChip({ status, className = "" }: { status: TripStatus; className?: string }) {
  const meta = tripStatusMeta[status]
  return (
    <span className={`${chipBase} ${meta.chip} ${className}`}>
      <StatusMark kind={meta.mark} />
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

/** Provenance chip for AI-authored items — neutral tint, accent mark. */
export function AiChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`${chipBase} border-[color:var(--trips-border)] bg-[color:var(--trips-rail)] text-[color:var(--trips-ink-secondary)] ${className}`}
      title="Added by AI enhancement"
    >
      <span className="inline-block h-2 w-2 shrink-0 bg-[color:var(--ta)]" aria-hidden />
      AI
    </span>
  )
}
