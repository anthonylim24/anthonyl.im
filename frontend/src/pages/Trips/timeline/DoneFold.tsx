import { CheckCheck, ChevronDown } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { plural } from "../meta"
import { clockRange } from "./timeline"
import { tl } from "./timeline.stylex"

/**
 * Today's stops already over, as one quiet line that opens them again: "4 stops
 * done · 8:00 AM–1:30 PM  Show". The list and the timeline both lead with it,
 * so the day opens on what is left with its sky still in view.
 */
export function DoneFold({ count, from, to, open, onToggle, controls }: { count: number; from: number; to: number; open: boolean; onToggle: () => void; controls?: string }) {
  return (
    <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} {...sx(a.focusable, tl.fold)}>
      <CheckCheck size={14} strokeWidth={1.75} aria-hidden {...sx(tl.noShrink)} />
      <span {...sx(tl.foldText)}>
        {plural(count, "stop")} done <span {...sx(tl.foldWhen)}>{clockRange(from, to)}</span>
      </span>
      <span {...sx(tl.foldAction)}>
        {open ? "Hide" : "Show"}
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden {...sx(tl.foldChevron, open && tl.foldChevronOpen)} />
      </span>
    </button>
  )
}
