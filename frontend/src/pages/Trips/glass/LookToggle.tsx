import { Droplet } from "lucide-react"
import { sx } from "@/styles/merge"
import { a } from "../atlas.stylex"
import { chooseLook, useLook } from "./look"

/** The header switch between the atlas and Liquid Glass. */
export function LookToggle() {
  const look = useLook()
  const glass = look === "glass"
  return (
    <button
      type="button"
      aria-pressed={glass}
      aria-label="Liquid Glass look"
      title={glass ? "Liquid Glass: on (click for the atlas)" : "Liquid Glass: off (click to turn on)"}
      onClick={() => chooseLook(glass ? "atlas" : "glass")}
      {...sx(a.iconBtn, a.iconBtnSm)}
    >
      <Droplet size={18} strokeWidth={1.75} fill={glass ? "currentColor" : "none"} aria-hidden />
    </button>
  )
}
