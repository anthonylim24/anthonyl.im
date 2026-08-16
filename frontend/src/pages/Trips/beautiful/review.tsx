import { Check, X } from "lucide-react"
import { SuggestionChip } from "../components/StatusChip"
import type { EnhancementSuggestion, ItineraryItem } from "../types"
import {
  ghostBtnClass,
  mutedInkClass,
  primaryBtnClass,
  softPanelClass,
  wrapAnywhereClass,
} from "../ui"

export function ApprovalCard({
  title,
  detail,
  confirmLabel,
  onConfirm,
  onDismiss,
  disabled = false,
}: {
  title: string
  detail?: string
  confirmLabel: string
  onConfirm: () => void
  onDismiss: () => void
  disabled?: boolean
}) {
  return (
    <section className={`p-4 ${softPanelClass}`} aria-label={title}>
      <h3 className={`text-sm font-semibold text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>{title}</h3>
      {detail && <p className={`mt-1 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>{detail}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={disabled} onClick={onConfirm} className={primaryBtnClass}>
          <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          {confirmLabel}
        </button>
        <button type="button" disabled={disabled} onClick={onDismiss} className={ghostBtnClass}>
          Dismiss all
        </button>
      </div>
    </section>
  )
}

export function RecommendationCard({
  suggestion,
  selectable,
  applied,
  checked,
  onToggle,
  current,
}: {
  suggestion: EnhancementSuggestion
  selectable: boolean
  applied: boolean
  checked: boolean
  onToggle: (id: string, on: boolean) => void
  current?: Pick<ItineraryItem, "title" | "time" | "location">
}) {
  return (
    <li className={`p-3 ${softPanelClass}`}>
      <label className="flex min-h-11 items-start gap-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggle(suggestion.id, e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-stone-400 accent-[var(--trips-accent)]"
            aria-label={`Accept: ${suggestion.title}`}
          />
        ) : (
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
            {applied ? <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" strokeWidth={2} /> : null}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SuggestionChip kind={suggestion.kind} />
            <span className={`text-sm font-medium text-stone-900 dark:text-stone-100 ${wrapAnywhereClass}`}>
              {suggestion.title}
            </span>
            {applied && <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">added</span>}
            {suggestion.confidence === "low" && !applied && (
              <span className="text-[11px] text-amber-700 dark:text-amber-400">low confidence</span>
            )}
            {suggestion.confidence === "high" && selectable && (
              <span className={`text-[11px] ${mutedInkClass}`}>high confidence</span>
            )}
          </div>
          {suggestion.detail && (
            <p className={`mt-1 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>{suggestion.detail}</p>
          )}
          {suggestion.proposedItem && (
            <p className={`mt-1 text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
              Adds: {suggestion.proposedItem.title}
              {suggestion.proposedItem.location?.name ? ` @ ${suggestion.proposedItem.location.name}` : ""}
            </p>
          )}
          <DiffTable suggestion={suggestion} current={current} />
        </div>
      </label>
    </li>
  )
}

function itemLine(item: Pick<ItineraryItem, "title" | "time" | "location">): string {
  const bits = [item.title]
  if (item.time) bits.push(item.time)
  if (item.location?.name && item.location.name !== item.title) bits.push(item.location.name)
  return bits.join(" · ")
}

export function DiffTable({
  suggestion,
  current,
}: {
  suggestion: EnhancementSuggestion
  current?: Pick<ItineraryItem, "title" | "time" | "location">
}) {
  if (suggestion.kind !== "edit" && suggestion.kind !== "reorder") return null
  const after = suggestion.proposedChanges
    ? itemLine({
        title: suggestion.proposedChanges.title ?? current?.title ?? suggestion.title,
        time: suggestion.proposedChanges.time ?? current?.time,
        location: suggestion.proposedChanges.location ?? current?.location,
      })
    : suggestion.proposedOrder
      ? `${suggestion.proposedOrder.length} stops in a new order`
      : suggestion.detail
  const before = current ? itemLine(current) : "Current stop"
  return (
    <table className="mt-2 w-full text-left text-xs">
      <caption className="sr-only">Proposed change</caption>
      <thead>
        <tr className={mutedInkClass}>
          <th className="pb-1 font-medium">Before</th>
          <th className="pb-1 font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        <tr className="align-top text-stone-800 dark:text-stone-200">
          <td className={`pr-3 ${wrapAnywhereClass}`}>{before}</td>
          <td className={wrapAnywhereClass}>{after}</td>
        </tr>
      </tbody>
    </table>
  )
}

export function ReviewHeader({
  title,
  onDismiss,
}: {
  title: string
  onDismiss: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss suggestions"
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-200/60 dark:hover:bg-stone-800"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
