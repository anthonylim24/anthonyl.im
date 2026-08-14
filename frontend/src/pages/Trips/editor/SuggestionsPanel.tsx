import { useId, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, X } from "lucide-react"
import { ACCENT, suggestionBadgeClass } from "../theme"
import {
  EASE,
  checkboxClass,
  ghostBtnClass,
  hintClass,
  iconBtnClass,
  mutedInkClass,
  panelClass,
  primaryBtnClass,
  quietBtnClass,
  wrapAnywhereClass,
} from "../ui"
import type { EnhancementRun, EnhancementSuggestion, SuggestionKind } from "../types"
import type { DayOption } from "./editorUi"

const APPLICABLE = new Set(["add", "edit", "remove", "reorder"])

const KIND_LABEL: Record<SuggestionKind, string> = {
  add: "Add",
  edit: "Edit",
  remove: "Remove",
  reorder: "Reorder",
  warning: "Warning",
  info: "Note",
}

interface Group {
  key: string
  label: string | null
  suggestions: EnhancementSuggestion[]
}

const badgeClass =
  "inline-flex shrink-0 items-center justify-center border px-1.5 py-0.5 text-[11px] font-medium"

/** Review an enhancement run: accept per suggestion, grouped by day for
 *  trip-wide runs so the list reads as an itinerary rather than a feed. */
export function SuggestionsPanel({
  run,
  dayOptions,
  onApply,
  onDismiss,
}: {
  run: EnhancementRun
  dayOptions: DayOption[]
  onApply: (ids: string[]) => void
  onDismiss: () => void
}) {
  const reduce = useReducedMotion()
  const confidenceHelpId = useId()
  const appliedIds = useMemo(() => new Set(run.appliedSuggestionIds), [run])
  const actionableIds = useMemo(
    () =>
      run.suggestions
        .filter((s) => APPLICABLE.has(s.kind) && !appliedIds.has(s.id))
        .map((s) => s.id),
    [run, appliedIds],
  )
  const [selected, setSelected] = useState<Set<string>>(() => new Set(actionableIds))

  const groups = useMemo<Group[]>(() => {
    if (run.scope !== "trip") return [{ key: "all", label: null, suggestions: run.suggestions }]
    const byDay = new Map<string, EnhancementSuggestion[]>()
    const tripWide: EnhancementSuggestion[] = []
    for (const s of run.suggestions) {
      if (!s.dayId) {
        tripWide.push(s)
        continue
      }
      const bucket = byDay.get(s.dayId)
      if (bucket) bucket.push(s)
      else byDay.set(s.dayId, [s])
    }
    const ordered: Group[] = []
    for (const day of dayOptions) {
      const suggestions = byDay.get(day.id)
      if (suggestions) ordered.push({ key: day.id, label: day.label, suggestions })
      byDay.delete(day.id)
    }
    for (const [dayId, suggestions] of byDay) ordered.push({ key: dayId, label: dayId, suggestions })
    if (tripWide.length > 0) ordered.push({ key: "trip", label: "Whole trip", suggestions: tripWide })
    return ordered
  }, [run, dayOptions])

  const allSelected = actionableIds.length > 0 && selected.size === actionableIds.length
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const dayLabel = (id?: string) => dayOptions.find((d) => d.id === id)?.label ?? id

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={reduce ? { duration: 0 } : { duration: 0.28, ease: EASE }}
      aria-label="AI enhancement suggestions"
      className={`mt-5 p-5 ${panelClass} ${ACCENT.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[color:var(--tr-ink)]">
            Enhancement review
            {run.scope === "day" ? `, ${dayLabel(run.dayId)}` : ", whole trip"}
          </h2>
          {(run.outcomeReason || run.summary) && (
            <p className={`mt-1 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>
              {run.outcomeReason || run.summary}
            </p>
          )}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestions" className={iconBtnClass}>
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      {run.status === "error" ? (
        <p className={`mt-4 text-sm ${mutedInkClass}`}>
          {run.error ?? "The review failed before it could propose changes."}
        </p>
      ) : run.suggestions.length === 0 && !(run.outcomeReason || run.summary) ? (
        <p className={`mt-4 text-sm ${mutedInkClass}`}>No places added. This plan already looks solid.</p>
      ) : run.suggestions.length === 0 ? null : (
        <>
          {actionableIds.length > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3 border-b border-[color:var(--tr-line)] pb-2">
              <span className={`text-xs ${mutedInkClass}`} role="status">
                {selected.size} of {actionableIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelected(allSelected ? new Set() : new Set(actionableIds))}
                className={quietBtnClass}
              >
                {allSelected ? "Select none" : "Select all"}
              </button>
            </div>
          )}
          {run.suggestions.some((s) => s.confidence) && (
            <p id={confidenceHelpId} className={hintClass}>
              High means the change is a clear fit. Medium means check the time and place. Low means
              treat it as a guess.
            </p>
          )}
          <div className="mt-3 space-y-4">
            {groups.map((group) => (
              <div key={group.key}>
                {group.label && <p className={`text-sm font-medium text-[color:var(--tr-ink)]`}>{group.label}</p>}
                <ul className={`space-y-2 ${group.label ? "mt-2" : ""}`}>
                  {group.suggestions.map((s) => (
                    <SuggestionItem
                      key={s.id}
                      suggestion={s}
                      dayLabel={dayLabel(s.dayId)}
                      selectable={APPLICABLE.has(s.kind) && !appliedIds.has(s.id)}
                      applied={appliedIds.has(s.id)}
                      checked={selected.has(s.id)}
                      confidenceHelpId={confidenceHelpId}
                      onToggle={toggle}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {actionableIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => onApply([...selected])}
            className={primaryBtnClass}
          >
            <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Apply {selected.size} selected
          </button>
          <button type="button" onClick={onDismiss} className={ghostBtnClass}>
            Dismiss all
          </button>
        </div>
      )}
    </motion.section>
  )
}

function SuggestionItem({
  suggestion,
  dayLabel,
  selectable,
  applied,
  checked,
  confidenceHelpId,
  onToggle,
}: {
  suggestion: EnhancementSuggestion
  dayLabel?: string
  selectable: boolean
  applied: boolean
  checked: boolean
  confidenceHelpId: string
  onToggle: (id: string, on: boolean) => void
}) {
  const affected = [
    dayLabel ? `On ${dayLabel}` : null,
    suggestion.proposedItem?.title
      ? suggestion.proposedItem.title
      : suggestion.itemId
        ? `item ${suggestion.itemId}`
        : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <li className="border-t border-[color:var(--tr-line)] pt-3 first:border-t-0 first:pt-0">
      <label className="flex min-h-11 items-start gap-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onToggle(suggestion.id, e.target.checked)}
            className={`mt-1 ${checkboxClass}`}
            aria-label={`Accept: ${suggestion.title}`}
          />
        ) : (
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
            {applied ? <Check className="h-3.5 w-3.5 text-[color:var(--tr-ok)]" strokeWidth={1.5} /> : null}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${badgeClass} ${suggestionBadgeClass(suggestion.kind)}`}>
              {KIND_LABEL[suggestion.kind]}
            </span>
            <span className={`text-sm font-medium text-[color:var(--tr-ink)] ${wrapAnywhereClass}`}>
              {suggestion.title}
            </span>
            {applied && (
              <span className="text-[11px] font-medium text-[color:var(--tr-ok)]">added</span>
            )}
            {suggestion.confidence && !applied && (
              <span
                className={`text-[11px] ${
                  suggestion.confidence === "low" ? "text-[color:var(--tr-warn)]" : mutedInkClass
                }`}
                aria-describedby={confidenceHelpId}
              >
                {suggestion.confidence} confidence
              </span>
            )}
          </div>
          {affected && (
            <p className={`mt-1 text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>{affected}</p>
          )}
          {suggestion.detail && (
            <p className={`mt-1 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>{suggestion.detail}</p>
          )}
          {suggestion.proposedItem && (
            <p className={`mt-1 text-xs ${mutedInkClass} ${wrapAnywhereClass}`}>
              Adds: {suggestion.proposedItem.title}
              {suggestion.proposedItem.location?.name ? ` @ ${suggestion.proposedItem.location.name}` : ""}
            </p>
          )}
        </div>
      </label>
    </li>
  )
}
