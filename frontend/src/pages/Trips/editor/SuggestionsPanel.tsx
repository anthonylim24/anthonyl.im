import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { Sparkles } from "lucide-react"
import { ACCENT } from "../theme"
import { ApprovalCard, RecommendationCard } from "../beautiful"
import { EASE, fieldLabelClass, mutedInkClass, quietBtnClass, softPanelClass, wrapAnywhereClass } from "../ui"
import type { EnhancementRun, EnhancementSuggestion, ItineraryItem } from "../types"
import type { DayOption } from "./editorUi"

const APPLICABLE = new Set(["add", "edit", "remove", "reorder"])

interface Group {
  key: string
  label: string | null
  suggestions: EnhancementSuggestion[]
}

/** Review an enhancement run: accept per suggestion, grouped by day for
 *  trip-wide runs so the list reads as an itinerary rather than a feed. */
export function SuggestionsPanel({
  run,
  dayOptions,
  onApply,
  onDismiss,
  resolveItem,
}: {
  run: EnhancementRun
  dayOptions: DayOption[]
  onApply: (ids: string[]) => void
  onDismiss: () => void
  resolveItem?: (suggestion: EnhancementSuggestion) => Pick<ItineraryItem, "title" | "time" | "location"> | undefined
}) {
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: EASE }}
      aria-label="AI enhancement suggestions"
      className={`mt-5 space-y-4 p-5 motion-reduce:transition-none ${softPanelClass} ${ACCENT.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900 dark:text-stone-100">
            <Sparkles className={`h-4 w-4 shrink-0 ${ACCENT.text}`} strokeWidth={1.5} aria-hidden />
            Enhancement review {run.scope === "day" ? `· ${dayLabel(run.dayId)}` : "· whole trip"}
          </h2>
          {(run.outcomeReason || run.summary) && (
            <p className={`mt-1 text-sm ${mutedInkClass} ${wrapAnywhereClass}`}>
              {run.outcomeReason || run.summary}
            </p>
          )}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss suggestions" className={quietBtnClass}>
          Dismiss suggestions
        </button>
      </div>

      {run.status === "error" ? (
        <p className={`text-sm ${mutedInkClass}`}>
          {run.error ?? "The review failed before it could propose changes."}
        </p>
      ) : run.suggestions.length === 0 && !(run.outcomeReason || run.summary) ? (
        <p className={`text-sm ${mutedInkClass}`}>No places added. This plan already looks solid.</p>
      ) : run.suggestions.length === 0 ? null : (
        <>
          {actionableIds.length > 1 && (
            <div className="flex items-center justify-between gap-3 border-b border-stone-200/80 pb-2 dark:border-stone-800">
              <span className={fieldLabelClass} role="status">
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
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.key}>
                {group.label && <p className={fieldLabelClass}>{group.label}</p>}
                <ul className={`space-y-2 ${group.label ? "mt-2" : ""}`}>
                  {group.suggestions.map((s) => (
                    <RecommendationCard
                      key={s.id}
                      suggestion={s}
                      selectable={APPLICABLE.has(s.kind) && !appliedIds.has(s.id)}
                      applied={appliedIds.has(s.id)}
                      checked={selected.has(s.id)}
                      onToggle={toggle}
                      current={resolveItem?.(s)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}

      {actionableIds.length > 0 && (
        <ApprovalCard
          title="Apply selected suggestions"
          detail={`${selected.size} change${selected.size === 1 ? "" : "s"} ready to write into the itinerary.`}
          confirmLabel={`Apply ${selected.size} selected`}
          disabled={selected.size === 0}
          onConfirm={() => onApply([...selected])}
          onDismiss={onDismiss}
        />
      )}
    </motion.section>
  )
}
