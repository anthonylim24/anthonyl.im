import { X } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import type { AreaShape } from "../map/geo"
import { ar } from "./areas.stylex"

/** The map's key while a neighborhood is drawn: which one, how its edge was found, and a way to clear it. */
export function AreaKey({ name, shape, onClear }: { name: string; shape: AreaShape; onClear: () => void }) {
  return (
    <div {...sx(ar.key, "trips-glass-pill")} role="group" aria-label={`${name} on the map`}>
      <span {...sx(ar.keySwatch, shape.approximate && ar.keySwatchGuess)} aria-hidden />
      <span {...sx(ar.keyText)}>
        <span {...sx(a.display, ar.keyName, a.truncate)}>{name}</span>
        <span {...sx(ar.keyHow)}>{shape.approximate ? "Drawn around your stops" : "Outline from OpenStreetMap"}</span>
      </span>
      <button type="button" {...sx(a.iconBtn, a.iconBtnSm)} aria-label={`Clear ${name} from the map`} onClick={onClear}>
        <X size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  )
}
