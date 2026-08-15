import { Check, X } from "lucide-react"
import { accentChipBtnClass, dangerChipBtnClass, ghostBtnClass, mutedInkClass, wrapAnywhereClass } from "./ui"
import type { ResolvedMove } from "./conciergeMoves"

export function ConciergeMoveCards({
  moves,
  appliedKeys,
  dismissedKeys,
  busyKey,
  canEdit,
  onConfirm,
  onDismiss,
}: {
  moves: ResolvedMove[]
  appliedKeys: Set<string>
  dismissedKeys: Set<string>
  busyKey: string | null
  canEdit: boolean
  onConfirm: (move: ResolvedMove) => void
  onDismiss: (key: string) => void
}) {
  const visible = moves.filter((m) => !dismissedKeys.has(m.key))
  if (visible.length === 0) return null

  return (
    <ul className="mt-3 space-y-2" aria-label="Proposed itinerary changes" aria-live="polite">
      {visible.map((move) => {
        const applied = appliedKeys.has(move.key)
        const busy = busyKey === move.key
        const labelId = `concierge-move-${move.key}`
        return (
          <li
            key={move.key}
            className="rounded-2xl border border-stone-200/90 bg-stone-50/90 px-3 py-2.5 dark:border-stone-700/80 dark:bg-stone-900/70"
          >
            <p id={labelId} className={`text-sm leading-snug text-stone-800 dark:text-stone-100 ${wrapAnywhereClass}`}>
              {move.label}
            </p>
            {canEdit && !applied ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  aria-busy={busy}
                  aria-describedby={labelId}
                  onClick={() => onConfirm(move)}
                  className={move.move.type === "remove" ? dangerChipBtnClass : accentChipBtnClass}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  {busy ? "Updating…" : move.move.type === "remove" ? "Remove it" : "Apply"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-describedby={labelId}
                  onClick={() => onDismiss(move.key)}
                  className={ghostBtnClass}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                  Keep
                </button>
              </div>
            ) : (
              <p className={`mt-1.5 text-xs ${mutedInkClass}`}>{applied ? "Done" : "Ask an editor to apply this."}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
