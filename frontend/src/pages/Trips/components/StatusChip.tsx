import { itemStatusMeta, suggestionBadgeClass } from "../theme"
import type { ItemStatus, SuggestionKind, TripStatus } from "../types"

/** Square-cornered badge. Tint and label carry the state; no status dot. */
const chipBase =
  "inline-flex shrink-0 items-center rounded-[var(--tr-r-control)] border px-2 py-0.5 text-[10px] font-medium"

const tripStatusMeta: Record<TripStatus, { label: string; chip: string }> = {
  draft: {
    label: "Draft",
    chip: "border-[color:var(--tr-line-strong)] bg-transparent text-[color:var(--tr-ink-muted)]",
  },
  active: {
    label: "Active",
    chip: "border-[color:var(--tr-ok)] bg-[var(--tr-ok-soft)] text-[color:var(--tr-ok)]",
  },
  archived: {
    label: "Archived",
    chip: "border-[color:var(--tr-line)] bg-[var(--tr-overlay)] text-[color:var(--tr-ink-muted)]",
  },
  completed: {
    label: "Completed",
    chip: "border-[color:var(--tr-line)] bg-[var(--tr-overlay)] text-[color:var(--tr-ink-muted)]",
  },
}

const reservationStatusMeta: Record<"confirmed" | "pending" | "tentative", { label: string; chip: string }> = {
  confirmed: {
    label: "Confirmed",
    chip: "border-[color:var(--tr-ok)] bg-[var(--tr-ok-soft)] text-[color:var(--tr-ok)]",
  },
  pending: {
    label: "Pending",
    chip: "border-[color:var(--tr-warn)] bg-[var(--tr-warn-soft)] text-[color:var(--tr-warn)]",
  },
  tentative: {
    label: "Tentative",
    chip: "border-[color:var(--tr-line-strong)] bg-transparent text-[color:var(--tr-ink-muted)]",
  },
}

/** Item status. Renders nothing for `none`, so call sites need no guard. */
export function StatusChip({ status, className = "" }: { status: ItemStatus; className?: string }) {
  const meta = itemStatusMeta[status]
  if (!meta) return null
  return <span className={`${chipBase} ${meta.chip} ${className}`}>{meta.label}</span>
}

/** Trip lifecycle status - same chip, trip vocabulary. */
export function TripStatusChip({ status, className = "" }: { status: TripStatus; className?: string }) {
  const meta = tripStatusMeta[status]
  return <span className={`${chipBase} ${meta.chip} ${className}`}>{meta.label}</span>
}

/** Booking state on a reservation: confirmed, pending, or tentative. */
export function ReservationChip({
  status,
  className = "",
}: {
  status: "confirmed" | "pending" | "tentative"
  className?: string
}) {
  const meta = reservationStatusMeta[status]
  return <span className={`${chipBase} ${meta.chip} ${className}`}>{meta.label}</span>
}

const suggestionLabel: Record<SuggestionKind, string> = {
  add: "Add",
  edit: "Edit",
  remove: "Remove",
  reorder: "Reorder",
  warning: "Warning",
  info: "Note",
}

/** Enhancement suggestion kind - added, removed, or neutral. */
export function SuggestionChip({ kind, className = "" }: { kind: SuggestionKind; className?: string }) {
  return <span className={`${chipBase} ${suggestionBadgeClass(kind)} ${className}`}>{suggestionLabel[kind]}</span>
}

/** Provenance chip for AI-authored items - neutral tint, no decorative mark. */
export function AiChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`${chipBase} border-[color:var(--tr-line-strong)] bg-[var(--tr-overlay)] text-[color:var(--tr-ink-muted)] ${className}`}
      title="Added by AI enhancement"
    >
      AI
    </span>
  )
}
