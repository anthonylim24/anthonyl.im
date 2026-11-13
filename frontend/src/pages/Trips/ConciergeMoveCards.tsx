import { Check, X } from "lucide-react"
import type { ResolvedMove } from "./conciergeMoves"
import { a } from "./atlas.stylex"
import { c } from "./chat.stylex"
import { sx } from "@/styles/merge"

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
    <ul {...sx(c.cardList)} aria-label="Proposed itinerary changes" aria-live="polite">
      {visible.map((move) => {
        const applied = appliedKeys.has(move.key)
        const busy = busyKey === move.key
        const labelId = `concierge-move-${move.key}`
        return (
          <li
            key={move.key}
            {...sx(c.card, c.cardBody)}
          >
            <p id={labelId} {...sx(c.moveLabel)}>
              {move.label}
            </p>
            {canEdit && !applied ? (
              <div {...sx(c.moveActions)}>
                <button
                  type="button"
                  disabled={busy}
                  aria-busy={busy}
                  aria-describedby={labelId}
                  onClick={() => onConfirm(move)}
                  {...sx(a.btn, a.btnSm, c.action, move.move.type === "remove" ? a.btnDanger : a.btnPrimary)}
                >
                  <Check {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
                  {busy ? "Updating…" : move.move.type === "remove" ? "Remove it" : "Apply"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-describedby={labelId}
                  onClick={() => onDismiss(move.key)}
                  {...sx(a.btn, a.btnSm, a.btnGhost, c.action)}
                >
                  <X {...sx(c.icon14)} strokeWidth={1.75} aria-hidden />
                  Keep
                </button>
              </div>
            ) : (
              <p {...sx(c.moveStatus, applied ? c.moveStatusOk : undefined)}>{applied ? "Done" : "Ask an editor to apply this."}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
