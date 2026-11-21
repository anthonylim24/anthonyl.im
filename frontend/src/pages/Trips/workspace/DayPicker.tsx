import { CalendarDays } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { Modal } from "../components/kit"
import { ws as s } from "../workspace.stylex"

export interface DayChoice {
  id: string
  /** "Day 3 · Sat, Nov 14". */
  label: string
  /** "Kyoto · 4 stops". */
  detail?: string
  /** Why it can't be picked ("This day", "Full"); the choice shows but is off. */
  off?: string
}

/**
 * Pick a day to send something to. A sheet rather than a menu: a trip can
 * run to sixty days, which a popover inside a card can't hold.
 */
export function DayPicker({
  title,
  description,
  choices,
  onPick,
  onClose,
}: {
  title: string
  description?: string
  choices: readonly DayChoice[]
  onPick: (dayId: string) => void
  onClose: () => void
}) {
  return (
    <Modal open onClose={onClose} title={title} description={description}>
      <ul {...sx(s.pickList)}>
        {choices.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              disabled={!!choice.off}
              {...sx(s.pickRow)}
              onClick={() => {
                onPick(choice.id)
                onClose()
              }}
            >
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.muted)} />
              <span {...sx(a.grow)}>
                <span {...sx(s.pickLabel, a.wrap)}>{choice.label}</span>
                {(choice.detail || choice.off) && (
                  <span {...sx(a.small, a.wrap)} style={{ display: "block" }}>
                    {[choice.off, choice.detail].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
