import { useState, type ReactNode } from "react"
import { CalendarDays, Check } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { Modal } from "../components/kit"
import { prep as p } from "../prep/prep.stylex"
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

/** One day: picking it sends the thing there and closes the sheet. */
interface PickOne {
  onPick: (dayId: string) => void
  onPickMany?: never
  confirm?: never
}

/** Any number of days, ticked, then sent with the footer's button. */
interface PickMany {
  onPickMany: (dayIds: string[]) => void
  /** The footer button's words for this many days ("Copy to 3 days"). */
  confirm: (count: number) => string
  onPick?: never
}

/**
 * Pick a day to send something to, or several. A sheet rather than a menu: a
 * trip can run to sixty days, which a popover inside a card can't hold.
 */
export function DayPicker({
  title,
  description,
  choices,
  lead,
  onClose,
  ...mode
}: {
  title: string
  description?: string
  choices: readonly DayChoice[]
  /** Shown above the day list, inside the sheet (the wishlist's recommended days). */
  lead?: ReactNode
  onClose: () => void
} & (PickOne | PickMany)) {
  if (mode.onPickMany) {
    return (
      <ManyDays title={title} description={description} choices={choices} lead={lead} onClose={onClose} onPickMany={mode.onPickMany} confirm={mode.confirm} />
    )
  }
  return (
    <Modal open onClose={onClose} title={title} description={description}>
      {lead}
      <ul {...sx(s.pickList)}>
        {choices.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              disabled={!!choice.off}
              {...sx(s.pickRow)}
              onClick={() => {
                mode.onPick(choice.id)
                onClose()
              }}
            >
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden {...sx(a.noShrink, a.muted)} />
              <ChoiceText choice={choice} />
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function ChoiceText({ choice }: { choice: DayChoice }) {
  return (
    <span {...sx(a.grow)}>
      <span {...sx(s.pickLabel, a.wrap)}>{choice.label}</span>
      {(choice.detail || choice.off) && (
        <span {...sx(a.small, a.wrap)} style={{ display: "block" }}>
          {[choice.off, choice.detail].filter(Boolean).join(" · ")}
        </span>
      )}
    </span>
  )
}

function ManyDays({
  title,
  description,
  choices,
  lead,
  onClose,
  onPickMany,
  confirm,
}: {
  title: string
  description?: string
  choices: readonly DayChoice[]
  lead?: ReactNode
  onClose: () => void
} & PickMany) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const open = choices.filter((choice) => !choice.off)
  const all = open.length > 0 && open.every((choice) => picked.has(choice.id))
  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now)
      if (!next.delete(id)) next.add(id)
      return next
    })
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          {open.length > 1 && (
            <button type="button" {...sx(a.btn, a.btnGhost)} onClick={() => setPicked(all ? new Set() : new Set(open.map((choice) => choice.id)))}>
              {all ? "Clear" : "Every day"}
            </button>
          )}
          <span {...sx(a.grow)} />
          <button
            type="button"
            {...sx(a.btn, a.btnPrimary)}
            disabled={picked.size === 0}
            onClick={() => {
              onPickMany(choices.filter((choice) => picked.has(choice.id)).map((choice) => choice.id))
              onClose()
            }}
          >
            {confirm(picked.size)}
          </button>
        </>
      }
    >
      {lead}
      <ul {...sx(s.pickList)}>
        {choices.map((choice) => {
          const on = picked.has(choice.id)
          return (
            <li key={choice.id}>
              <label {...sx(s.pickRow, !!choice.off && s.pickRowOff)}>
                <span {...sx(s.pickBox)}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!!choice.off}
                    onChange={() => toggle(choice.id)}
                    {...sx(p.box, on && p.boxOn)}
                  />
                  <Check size={14} strokeWidth={3} aria-hidden {...sx(p.mark, on && p.markOn)} />
                </span>
                <ChoiceText choice={choice} />
              </label>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
