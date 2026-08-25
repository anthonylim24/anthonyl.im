import { Check, X } from "lucide-react"
import { accentChipBtnClass, dangerChipBtnClass, ghostBtnClass, mutedInkClass, wrapAnywhereClass } from "./ui"
import type { ResolvedMove } from "./conciergeMoves"
import { sx } from '@/lib/utils'
import { styles } from './trips.stylex'

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
    <ul {...sx(styles.mt3, styles.spaceY2)} aria-label="Proposed itinerary changes" aria-live="polite">
      {visible.map((move) => {
        const applied = appliedKeys.has(move.key)
        const busy = busyKey === move.key
        const labelId = `concierge-move-${move.key}`
        return (
          <li
            key={move.key}
            {...sx(styles.placeCard, styles.placeCardBody)}
          >
            <p id={labelId} {...sx(styles.textSm, styles.leadingSnug, wrapAnywhereClass)}>
              {move.label}
            </p>
            {canEdit && !applied ? (
              <div {...sx(styles.mt2, styles.flexWrap, styles.gap2)}>
                <button
                  type="button"
                  disabled={busy}
                  aria-busy={busy}
                  aria-describedby={labelId}
                  onClick={() => onConfirm(move)}
                  {...sx(move.move.type === "remove" ? dangerChipBtnClass : accentChipBtnClass)}
                >
                  <Check {...sx(styles.iconXs)} strokeWidth={1.5} aria-hidden />
                  {busy ? "Updating…" : move.move.type === "remove" ? "Remove it" : "Apply"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-describedby={labelId}
                  onClick={() => onDismiss(move.key)}
                  {...sx(ghostBtnClass)}
                >
                  <X {...sx(styles.iconXs)} strokeWidth={1.5} aria-hidden />
                  Keep
                </button>
              </div>
            ) : (
              <p {...sx(styles.mt1_5, styles.textXs, mutedInkClass)}>{applied ? "Done" : "Ask an editor to apply this."}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
