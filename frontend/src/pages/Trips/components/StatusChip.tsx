import { sx } from '@/lib/utils'
import { suggestionChipStyle } from '../trips.stylex'
import { styles } from '../trips.stylex'
import { typeStampClass } from '../ui'
import type { ItemStatus, SuggestionKind, TripStatus } from '../types'

type StatusMarkKind = 'filled' | 'open' | 'rotated' | 'muted'

const itemMark: Record<Exclude<ItemStatus, 'none'>, StatusMarkKind> = {
  booked: 'filled',
  optional: 'open',
  needs_review: 'rotated',
  completed: 'muted',
}

const itemChipStyle: Record<Exclude<ItemStatus, 'none'>, Parameters<typeof sx>[0]> = {
  booked: styles.chipBooked,
  optional: styles.chipOptional,
  needs_review: styles.chipNeedsReview,
  completed: styles.chipCompleted,
}

const tripStatusMeta: Record<
  TripStatus,
  { label: string; chip: Parameters<typeof sx>[0]; mark: StatusMarkKind }
> = {
  draft: {
    label: 'Draft',
    chip: styles.chipDraft,
    mark: 'open',
  },
  active: {
    label: 'Active',
    chip: styles.chipActive,
    mark: 'filled',
  },
  archived: {
    label: 'Archived',
    chip: styles.chipArchived,
    mark: 'muted',
  },
  completed: {
    label: 'Completed',
    chip: styles.chipArchived,
    mark: 'muted',
  },
}

const itemStatusLabels: Record<Exclude<ItemStatus, 'none'>, string> = {
  booked: 'Booked',
  optional: 'Optional',
  needs_review: 'Needs review',
  completed: 'Done',
}

/** Geometric stamp — CSS boxes, not glyphs. Color comes from the chip text. */
function StatusMark({ kind }: { kind: StatusMarkKind }) {
  if (kind === 'open') {
    return <span {...sx(styles.markOpen)} aria-hidden />
  }
  if (kind === 'rotated') {
    return (
      <span {...sx(styles.markRotatedWrap)} aria-hidden>
        <span {...sx(styles.markRotated)} />
      </span>
    )
  }
  if (kind === 'muted') {
    return <span {...sx(styles.markMuted)} aria-hidden />
  }
  return <span {...sx(styles.markFilled)} aria-hidden />
}

/** Item status. Renders nothing for `none`, so call sites need no guard. */
export function StatusChip({
  status,
  className,
}: {
  status: ItemStatus
  className?: Parameters<typeof sx>[0]
}) {
  if (status === 'none') return null
  return (
    <span {...sx(styles.chipBase, typeStampClass, itemChipStyle[status], className)}>
      <StatusMark kind={itemMark[status]} />
      {itemStatusLabels[status]}
    </span>
  )
}

/** Trip lifecycle status — same chip, trip vocabulary. */
export function TripStatusChip({
  status,
  className,
}: {
  status: TripStatus
  className?: Parameters<typeof sx>[0]
}) {
  const meta = tripStatusMeta[status]
  return (
    <span {...sx(styles.chipBase, typeStampClass, meta.chip, className)}>
      <StatusMark kind={meta.mark} />
      {meta.label}
    </span>
  )
}

const suggestionLabel: Record<SuggestionKind, string> = {
  add: 'Add',
  edit: 'Edit',
  remove: 'Remove',
  reorder: 'Reorder',
  warning: 'Warning',
  info: 'Note',
}

function suggestionKindToStyle(kind: SuggestionKind): Parameters<typeof sx>[0] {
  if (kind === 'add') return suggestionChipStyle('add')
  if (kind === 'remove') return suggestionChipStyle('remove')
  return suggestionChipStyle('neutral')
}

/** Enhancement suggestion kind — added, removed, or neutral. */
export function SuggestionChip({
  kind,
  className,
}: {
  kind: SuggestionKind
  className?: Parameters<typeof sx>[0]
}) {
  return (
    <span {...sx(styles.chipBase, typeStampClass, suggestionKindToStyle(kind), className)}>
      {suggestionLabel[kind]}
    </span>
  )
}

/** Provenance chip for AI-authored items — neutral tint, accent mark. */
export function AiChip({ className }: { className?: Parameters<typeof sx>[0] }) {
  return (
    <span
      {...sx(styles.chipBase, typeStampClass, styles.chipAi, className)}
      title="Added by AI enhancement"
    >
      <span {...sx(styles.markAi)} aria-hidden />
      AI
    </span>
  )
}
